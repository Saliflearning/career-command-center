jest.mock("@/lib/db/client", () => ({
  db: (() => {
    const mockedDb = {
      user: {
        update: jest.fn(),
      },
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

import { createHash } from "crypto";
import { db } from "@/lib/db/client";
import {
  consumeEmailVerificationToken,
  isEmailVerificationRequired,
  issueEmailVerificationToken,
} from "./verification";

const email = "person@example.com";
const identifier = `email-verify:${email}`;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

describe("email verification state transitions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.$transaction as jest.Mock).mockImplementation(
      async (callback: (transaction: typeof db) => unknown) => callback(db)
    );
    (db.verificationToken.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (db.verificationToken.create as jest.Mock).mockResolvedValue({});
    (db.user.update as jest.Mock).mockResolvedValue({});
  });

  it("replaces an outstanding token inside one transaction", async () => {
    await issueEmailVerificationToken(email);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier },
    });
    expect(db.verificationToken.create).toHaveBeenCalledTimes(1);
  });

  it("atomically claims a valid token before verifying the user", async () => {
    const rawToken = "valid-token";
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() + 60_000),
    });

    await expect(
      consumeEmailVerificationToken(rawToken, email)
    ).resolves.toEqual({ ok: true, email });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier, token: hashToken(rawToken) },
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { email },
      data: { emailVerified: expect.any(Date) },
    });
    expect(
      (db.verificationToken.deleteMany as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan((db.user.update as jest.Mock).mock.invocationCallOrder[0]);
  });

  it("does not verify when another request already claimed the token", async () => {
    const rawToken = "already-claimed";
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() + 60_000),
    });
    (db.verificationToken.deleteMany as jest.Mock).mockResolvedValue({
      count: 0,
    });

    await expect(
      consumeEmailVerificationToken(rawToken, email)
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects when verification persistence fails", async () => {
    (db.verificationToken.create as jest.Mock).mockRejectedValue(
      new Error("database unavailable")
    );

    await expect(issueEmailVerificationToken(email)).rejects.toThrow(
      "database unavailable"
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects when the user update fails", async () => {
    const rawToken = "retryable-token";
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() + 60_000),
    });
    (db.user.update as jest.Mock).mockRejectedValue(
      new Error("database unavailable")
    );

    await expect(
      consumeEmailVerificationToken(rawToken, email)
    ).rejects.toThrow("database unavailable");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("email verification enforcement", () => {
  const originalRequired = process.env.REQUIRE_EMAIL_VERIFICATION;
  const originalCutoff = process.env.EMAIL_VERIFICATION_ENFORCE_AFTER;

  afterEach(() => {
    if (originalRequired === undefined) {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    } else {
      process.env.REQUIRE_EMAIL_VERIFICATION = originalRequired;
    }

    if (originalCutoff === undefined) {
      delete process.env.EMAIL_VERIFICATION_ENFORCE_AFTER;
    } else {
      process.env.EMAIL_VERIFICATION_ENFORCE_AFTER = originalCutoff;
    }
  });

  it("does not gate sign-in when verification enforcement is disabled", () => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;

    expect(isEmailVerificationRequired(new Date("2030-01-01T00:00:00Z"))).toBe(
      false
    );
  });

  it("gates all unverified accounts when enabled without a cutoff", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    delete process.env.EMAIL_VERIFICATION_ENFORCE_AFTER;

    expect(isEmailVerificationRequired(new Date("2020-01-01T00:00:00Z"))).toBe(
      true
    );
  });

  it("preserves legacy accounts created before the enforcement cutoff", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.EMAIL_VERIFICATION_ENFORCE_AFTER = "2026-08-24T00:00:00.000Z";

    expect(isEmailVerificationRequired(new Date("2026-08-23T23:59:59.999Z"))).toBe(
      false
    );
    expect(isEmailVerificationRequired(new Date("2026-08-24T00:00:00.000Z"))).toBe(
      true
    );
  });

  it("fails closed for new accounts when a configured cutoff is invalid", () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.EMAIL_VERIFICATION_ENFORCE_AFTER = "not-a-date";

    expect(isEmailVerificationRequired(new Date("2026-08-24T00:00:00.000Z"))).toBe(
      true
    );
  });
});
