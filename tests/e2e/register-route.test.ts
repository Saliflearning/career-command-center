import { NextRequest } from "next/server";

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: { hash: jest.fn() },
}));
jest.mock("@/lib/db/client", () => ({
  db: (() => {
    const mockedDb = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    // The route now issues a real email-verification token on success
    // (QUALITY_AUDIT F1).
    verificationToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
      $transaction: jest.fn(),
    };
    mockedDb.$transaction.mockImplementation(
      async (callback: (transaction: typeof mockedDb) => unknown) =>
        callback(mockedDb)
    );
    return mockedDb;
  })(),
}));

import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { POST } from "@/app/api/auth/register/route";
import { __resetRateLimits } from "@/lib/rate-limit";

function rawRequest(body: string) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function request(body: unknown) {
  return rawRequest(JSON.stringify(body));
}

describe("POST /api/auth/register", () => {
  const originalVerificationRequired = process.env.REQUIRE_EMAIL_VERIFICATION;
  const originalVerificationCutoff =
    process.env.EMAIL_VERIFICATION_ENFORCE_AFTER;
  const originalResendKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;

  beforeEach(() => {
    jest.clearAllMocks();
    // The route is rate limited per client IP (QUALITY_AUDIT F2). These requests
    // carry no x-forwarded-for, so they all share one bucket — reset it so each
    // test starts with a full budget instead of inheriting the previous test's.
    __resetRateLimits();
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);
    (db.user.create as jest.Mock).mockResolvedValue({ id: "user-new" });
    (db.verificationToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.verificationToken.create as jest.Mock).mockResolvedValue({});
    (db.$transaction as jest.Mock).mockImplementation(
      async (callback: (transaction: typeof db) => unknown) => callback(db)
    );
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
  });

  afterEach(() => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("REQUIRE_EMAIL_VERIFICATION", originalVerificationRequired);
    restore("EMAIL_VERIFICATION_ENFORCE_AFTER", originalVerificationCutoff);
    restore("RESEND_API_KEY", originalResendKey);
    restore("EMAIL_FROM", originalEmailFrom);
  });

  it("rejects malformed JSON before lookup or hashing", async () => {
    const response = await POST(rawRequest("{not-json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid registration request." });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("does not create an account when mandatory verification cannot be delivered", async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    delete process.env.EMAIL_VERIFICATION_ENFORCE_AFTER;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const response = await POST(
      request({ email: "person@example.com", password: "valid-password-phrase" })
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Account creation is temporarily unavailable.",
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it.each(["null", "[]", '"account"', "42", "true"])(
    "rejects a non-object JSON root before side effects: %s",
    async (body) => {
      const response = await POST(rawRequest(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid registration request." });
      expect(db.user.findUnique).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(db.user.create).not.toHaveBeenCalled();
    }
  );

  it.each([
    {},
    { email: 7, password: "password-123" },
    { email: "person@example.com", password: ["password-123"] },
    { name: { value: "Person" }, email: "person@example.com", password: "password-123" },
    { email: "   ", password: "password-123" },
    { email: "not-an-email", password: "password-123" },
    { email: `${"a".repeat(250)}@example.com`, password: "password-123" },
    { name: "N".repeat(101), email: "person@example.com", password: "password-123" },
    { email: "person@example.com", password: "short" },
    { email: "person@example.com", password: "p".repeat(73) },
    { email: "person@example.com", password: "\u00e9".repeat(37) },
  ])("rejects invalid fields before lookup or hashing", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid registration request." });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("normalizes identity fields, preserves password bytes, and persists only a hash", async () => {
    const response = await POST(
      request({
        name: "  Avery Example  ",
        email: "  Avery.Example@EXAMPLE.COM  ",
        password: "  exact-password  ",
      })
    );

    expect(response.status).toBe(201);
    // The account is created UNVERIFIED and a verification token is issued
    // (QUALITY_AUDIT F1). Outside production the link is returned so the flow
    // is testable; the token itself is random, so assert its shape.
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      emailVerified: false,
      verificationSent: false,
    });
    expect(payload.verificationUrl).toMatch(
      /^http:\/\/localhost:3000\/api\/auth\/verify\?token=[a-f0-9]{64}&email=avery\.example%40example\.com$/
    );
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: "avery.example@example.com" },
      select: { id: true },
    });
    expect(bcrypt.hash).toHaveBeenCalledWith("  exact-password  ", 12);
    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        email: "avery.example@example.com",
        name: "Avery Example",
        hashedPassword: "hashed-password",
        emailVerified: null,
      },
      select: { id: true },
    });
    expect(db.user.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ password: expect.anything() }) })
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("fails the whole registration transition when token persistence fails", async () => {
    (db.verificationToken.create as jest.Mock).mockRejectedValue(
      new Error("verification token persistence failed")
    );

    const response = await POST(
      request({ email: "person@example.com", password: "valid-password-phrase" })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Account registration failed.",
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("stores a missing optional name as null", async () => {
    const response = await POST(
      request({ email: "person@example.com", password: "valid-password-phrase" })
    );

    expect(response.status).toBe(201);
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: null }) })
    );
  });

  it("returns a bounded conflict for a known duplicate without hashing", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-existing" });

    const response = await POST(
      request({ email: "PERSON@example.com", password: "valid-password-phrase" })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "An account with this email already exists." });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate-create race to the same bounded conflict", async () => {
    (db.user.create as jest.Mock).mockRejectedValue({ code: "P2002", meta: { target: ["email"] } });

    const response = await POST(
      request({ email: "person@example.com", password: "valid-password-phrase" })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "An account with this email already exists." });
  });

  it("does not persist when hashing fails and hides the diagnostic", async () => {
    (bcrypt.hash as jest.Mock).mockRejectedValue(new Error("hash worker secret detail"));

    const response = await POST(
      request({ email: "person@example.com", password: "valid-password-phrase" })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Account registration failed." });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it.each(["lookup", "create"])(
    "bounds a database %s failure without returning private diagnostics",
    async (operation) => {
      const failure = new Error("DATABASE_URL and private database diagnostic");
      if (operation === "lookup") {
        (db.user.findUnique as jest.Mock).mockRejectedValue(failure);
      } else {
        (db.user.create as jest.Mock).mockRejectedValue(failure);
      }

      const response = await POST(
        request({ email: "person@example.com", password: "valid-password-phrase" })
      );
      const payload = await response.json();

      expect(response.status).toBe(500);
      expect(payload).toEqual({ error: "Account registration failed." });
      expect(JSON.stringify(payload)).not.toContain("DATABASE_URL");
      if (operation === "lookup") {
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(db.user.create).not.toHaveBeenCalled();
      }
    }
  );
  it("does not lock out an honest user who mistypes: invalid attempts spend the cheap budget, not the account budget", async () => {
    // Ten rejected attempts (weak password) — far past the 5-account budget.
    for (let i = 0; i < 10; i++) {
      const rejected = await POST(
        request({ email: `typo${i}@example.com`, password: "short" })
      );
      expect(rejected.status).toBe(400);
    }
    expect(db.user.create).not.toHaveBeenCalled();

    // A valid registration must still succeed afterwards.
    const ok = await POST(
      request({ email: "real.person@example.com", password: "a-good-password" })
    );
    expect(ok.status).toBe(201);
    expect(db.user.create).toHaveBeenCalledTimes(1);
  });

  it("still bounds account creation: the 6th well-formed attempt is rejected", async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await POST(
        request({ email: `user${i}@example.com`, password: "a-good-password" })
      );
      expect(ok.status).toBe(201);
    }
    const blocked = await POST(
      request({ email: "user5@example.com", password: "a-good-password" })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
