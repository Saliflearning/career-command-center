import { NextRequest } from "next/server";

jest.mock("@/lib/db/client", () => ({
  db: {
    user: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/auth/verification", () => ({
  issueEmailVerificationToken: jest.fn(),
  deliverVerificationEmail: jest.fn(),
}));
jest.mock("@/lib/email/transactional", () => ({
  isTransactionalEmailConfigured: jest.fn(),
}));

import { db } from "@/lib/db/client";
import {
  deliverVerificationEmail,
  issueEmailVerificationToken,
} from "@/lib/auth/verification";
import { isTransactionalEmailConfigured } from "@/lib/email/transactional";
import { __resetRateLimits } from "@/lib/rate-limit";
import { POST } from "@/app/api/auth/verification/request/route";

function request(body: unknown, ip = "203.0.113.20") {
  return new NextRequest("http://localhost/api/auth/verification/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/verification/request", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimits();
    (isTransactionalEmailConfigured as jest.Mock).mockReturnValue(true);
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);
    (issueEmailVerificationToken as jest.Mock).mockResolvedValue({
      token: "a".repeat(64),
      url: "https://example.test/api/auth/verify?private-token",
      expires: new Date("2030-01-01T00:00:00Z"),
    });
    (deliverVerificationEmail as jest.Mock).mockResolvedValue({
      delivered: true,
    });
  });

  it("rejects malformed input before account lookup", async () => {
    const response = await POST(request({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("fails clearly before lookup when delivery is unavailable", async () => {
    (isTransactionalEmailConfigured as jest.Mock).mockReturnValue(false);

    const response = await POST(request({ email: "person@example.com" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Email verification is temporarily unavailable.",
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns the same generic response for unknown and verified accounts", async () => {
    const unknown = await POST(
      request({ email: "unknown@example.com" }, "203.0.113.21")
    );
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "known-user",
      emailVerified: new Date("2026-01-01T00:00:00Z"),
    });
    const verified = await POST(
      request({ email: "known@example.com" }, "203.0.113.22")
    );

    expect(unknown.status).toBe(200);
    expect(verified.status).toBe(200);
    expect(await unknown.json()).toEqual(await verified.json());
    expect(issueEmailVerificationToken).not.toHaveBeenCalled();
  });

  it("issues and delivers a new link only for an unverified account", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "unverified-user",
      emailVerified: null,
    });

    const response = await POST(
      request({ email: "  Person@Example.COM  " }, "203.0.113.23")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      message:
        "If an unverified account exists for that email, a verification link is on its way.",
    });
    expect(issueEmailVerificationToken).toHaveBeenCalledWith(
      "person@example.com"
    );
    expect(deliverVerificationEmail).toHaveBeenCalledWith(
      "person@example.com",
      "https://example.test/api/auth/verify?private-token"
    );
    expect(JSON.stringify(payload)).not.toContain("private-token");
  });

  it("does not expose a provider delivery failure", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "unverified-user",
      emailVerified: null,
    });
    (deliverVerificationEmail as jest.Mock).mockResolvedValue({
      delivered: false,
    });

    const response = await POST(
      request({ email: "person@example.com" }, "203.0.113.24")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message:
        "If an unverified account exists for that email, a verification link is on its way.",
    });
  });

  it("rate limits repeated requests", async () => {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      response = await POST(
        request({ email: "person@example.com" }, "203.0.113.25")
      );
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
  });
});
