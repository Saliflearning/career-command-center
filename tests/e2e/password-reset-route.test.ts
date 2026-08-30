import { NextRequest } from "next/server";

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: { compare: jest.fn(), hash: jest.fn() },
}));
jest.mock("@/lib/db/client", () => ({
  db: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    verificationToken: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/email/transactional", () => ({
  isTransactionalEmailConfigured: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import {
  isTransactionalEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/email/transactional";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { POST as confirmReset } from "@/app/api/auth/password-reset/confirm/route";
import { __resetRateLimits } from "@/lib/rate-limit";

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const genericMessage =
  "If an account exists for that email, a password reset link is on its way.";

describe("password reset API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimits();
    process.env.NEXTAUTH_URL = "https://career-command-center.example";
    (isTransactionalEmailConfigured as jest.Mock).mockReturnValue(true);
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-1",
      hashedPassword: "current-password-hash",
    });
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue(null);
    (db.verificationToken.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.verificationToken.create as jest.Mock).mockResolvedValue({});
    (db.user.update as jest.Mock).mockResolvedValue({});
    (db.$transaction as jest.Mock).mockImplementation(
      async (callback: (transaction: typeof db) => unknown) => callback(db)
    );
    (sendPasswordResetEmail as jest.Mock).mockResolvedValue({ delivered: true });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    (bcrypt.hash as jest.Mock).mockResolvedValue("new-password-hash");
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  it("returns the same response for known and unknown accounts", async () => {
    const known = await requestReset(
      post("http://localhost/api/auth/password-reset/request", {
        email: "Person@Example.com",
      })
    );
    (db.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const unknown = await requestReset(
      post("http://localhost/api/auth/password-reset/request", {
        email: "nobody@example.com",
      })
    );

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual({ success: true, message: genericMessage });
    expect(await unknown.json()).toEqual({ success: true, message: genericMessage });
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("reports transport unavailability without looking up an account", async () => {
    (isTransactionalEmailConfigured as jest.Mock).mockReturnValue(false);

    const response = await requestReset(
      post("http://localhost/api/auth/password-reset/request", {
        email: "person@example.com",
      })
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Password recovery is temporarily unavailable.",
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not disclose delivery failure or provider diagnostics", async () => {
    (sendPasswordResetEmail as jest.Mock).mockResolvedValue({ delivered: false });

    const response = await requestReset(
      post("http://localhost/api/auth/password-reset/request", {
        email: "person@example.com",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, message: genericMessage });
    expect(JSON.stringify(payload)).not.toContain("Resend");
    expect(JSON.stringify(payload)).not.toContain("token");
  });

  it("rejects malformed request fields before account lookup", async () => {
    const response = await requestReset(
      post("http://localhost/api/auth/password-reset/request", {
        email: "not-an-email",
      })
    );

    expect(response.status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("hashes a valid new password with bcrypt cost 12 and consumes the token", async () => {
    const token = "a".repeat(64);
    const { createHash } = await import("crypto");
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier: "password-reset:person@example.com",
      token: createHash("sha256").update(token).digest("hex"),
      expires: new Date(Date.now() + 60_000),
    });

    const response = await confirmReset(
      post("http://localhost/api/auth/password-reset/confirm", {
        email: "Person@Example.com",
        token,
        password: "new-secure-password",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "new-secure-password",
      "current-password-hash"
    );
    expect(bcrypt.hash).toHaveBeenCalledWith("new-secure-password", 12);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { email: "person@example.com" },
      data: {
        hashedPassword: "new-password-hash",
        emailVerified: expect.any(Date),
      },
    });
  });

  it("returns one bounded error for invalid or expired reset links", async () => {
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await confirmReset(
      post("http://localhost/api/auth/password-reset/confirm", {
        email: "person@example.com",
        token: "b".repeat(64),
        password: "new-secure-password",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This password reset link is invalid or expired.",
    });
  });

  it("rejects passwords outside bcrypt's safe byte boundary before hashing", async () => {
    const response = await confirmReset(
      post("http://localhost/api/auth/password-reset/confirm", {
        email: "person@example.com",
        token: "c".repeat(64),
        password: "\u00e9".repeat(37),
      })
    );

    expect(response.status).toBe(400);
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("returns an actionable error when the password is shorter than policy", async () => {
    const response = await confirmReset(
      post("http://localhost/api/auth/password-reset/confirm", {
        email: "person@example.com",
        token: "d".repeat(64),
        password: "too-short",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Use at least 15 characters for your password.",
    });
    expect(db.verificationToken.findFirst).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("rejects reusing the current password without consuming the reset token", async () => {
    const token = "e".repeat(64);
    const { createHash } = await import("crypto");
    (db.verificationToken.findFirst as jest.Mock).mockResolvedValue({
      identifier: "password-reset:person@example.com",
      token: createHash("sha256").update(token).digest("hex"),
      expires: new Date(Date.now() + 60_000),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const response = await confirmReset(
      post("http://localhost/api/auth/password-reset/confirm", {
        email: "person@example.com",
        token,
        password: "current-password-phrase",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Choose a password different from your current password.",
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(db.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
