jest.mock("@/lib/db/client", () => ({
  db: (() => {
    const mockedDb = {
      user: {
        findUnique: jest.fn(),
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
  consumePasswordResetToken,
  inspectPasswordResetToken,
  issuePasswordResetToken,
} from "./password-reset";

const email = "person@example.com";
const identifier = `password-reset:${email}`;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

describe("password reset state transitions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.$transaction as jest.Mock).mockImplementation(
      async (callback: (transaction: typeof db) => unknown) => callback(db)
    );
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue(null);
    (db.verificationToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.verificationToken.create as jest.Mock).mockResolvedValue({});
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      hashedPassword: "current-password-hash",
    });
    (db.user.update as jest.Mock).mockResolvedValue({});
    process.env.NEXTAUTH_URL = "https://career-command-center.example";
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  it("stores only a hash and returns an email-bound reset URL", async () => {
    const issued = await issuePasswordResetToken(email);

    expect(issued.status).toBe("issued");
    if (issued.status !== "issued") throw new Error("expected issued token");

    expect(issued.url).toMatch(
      /^https:\/\/career-command-center\.example\/reset-password\?token=[a-f0-9]{64}&email=person%40example\.com$/
    );
    expect(db.verificationToken.create).toHaveBeenCalledWith({
      data: {
        identifier,
        token: hashToken(issued.token),
        expires: expect.any(Date),
      },
    });
    expect(db.verificationToken.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ token: issued.token }) })
    );
  });

  it("does not replace a token during the resend cooldown", async () => {
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: "stored-hash",
      expires: new Date(Date.now() + 59 * 60 * 1000),
    });

    await expect(issuePasswordResetToken(email)).resolves.toEqual({
      status: "cooldown",
    });
    expect(db.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(db.verificationToken.create).not.toHaveBeenCalled();
  });

  it("replaces an old outstanding token in one transaction", async () => {
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: "old-hash",
      expires: new Date(Date.now() + 30 * 60 * 1000),
    });

    const issued = await issuePasswordResetToken(email);

    expect(issued.status).toBe("issued");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier },
    });
    expect(db.verificationToken.create).toHaveBeenCalledTimes(1);
  });

  it("atomically claims a valid token and verifies the recovered account", async () => {
    const rawToken = "valid-reset-token";
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() + 60_000),
    });

    await expect(
      consumePasswordResetToken(rawToken, email, "new-password-hash")
    ).resolves.toEqual({ ok: true, email });

    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier, token: hashToken(rawToken) },
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { email },
      data: {
        hashedPassword: "new-password-hash",
        emailVerified: expect.any(Date),
      },
    });
  });

  it("inspects a valid token without consuming it so reuse can be checked safely", async () => {
    const rawToken = "inspect-valid-token";
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() + 60_000),
    });

    await expect(inspectPasswordResetToken(rawToken, email)).resolves.toEqual({
      ok: true,
      email,
      currentPasswordHash: "current-password-hash",
    });

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email },
      select: { hashedPassword: true },
    });
    expect(db.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects expired tokens without changing the password", async () => {
    const rawToken = "expired-token";
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() - 1),
    });

    await expect(
      consumePasswordResetToken(rawToken, email, "new-password-hash")
    ).resolves.toEqual({ ok: false, reason: "expired" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("does not update when another request already claimed the token", async () => {
    const rawToken = "claimed-token";
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() + 60_000),
    });
    (db.verificationToken.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(
      consumePasswordResetToken(rawToken, email, "new-password-hash")
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
