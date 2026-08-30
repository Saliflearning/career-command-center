import { NextRequest } from "next/server";

jest.mock("@/lib/auth/verification", () => ({
  consumeEmailVerificationToken: jest.fn(),
}));

import { consumeEmailVerificationToken } from "@/lib/auth/verification";
import { __resetRateLimits } from "@/lib/rate-limit";
import { GET } from "@/app/api/auth/verify/route";

function request(query: string, ip = "203.0.113.30") {
  return new NextRequest(`http://localhost/api/auth/verify?${query}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/auth/verify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimits();
    process.env.NEXTAUTH_URL = "http://localhost";
    (consumeEmailVerificationToken as jest.Mock).mockResolvedValue({
      ok: true,
      email: "person@example.com",
    });
  });

  it("rejects malformed tokens before database-backed consumption", async () => {
    const response = await GET(
      request(`token=${"x".repeat(8_000)}&email=person%40example.com`)
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/signin?verify=invalid"
    );
    expect(consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it("rejects malformed email addresses before consumption", async () => {
    const response = await GET(
      request(`token=${"a".repeat(64)}&email=not-an-email`)
    );

    expect(response.status).toBe(307);
    expect(consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it("normalizes valid input and consumes the token", async () => {
    const response = await GET(
      request(`token=${"a".repeat(64)}&email=%20Person%40Example.COM%20`)
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/signin?verify=success"
    );
    expect(consumeEmailVerificationToken).toHaveBeenCalledWith(
      "a".repeat(64),
      "person@example.com"
    );
  });
});
