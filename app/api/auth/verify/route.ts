/**
 * GET /api/auth/verify?token=...&email=...
 *
 * Consumes a single-use email-verification token and marks the account
 * verified (QUALITY_AUDIT F1), then redirects to sign-in with a status flag.
 * Rate limited because it is public and takes attacker-supplied tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { consumeEmailVerificationToken } from "@/lib/auth/verification";
import { hit, clientIp } from "@/lib/rate-limit";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function validEmail(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function redirectTo(req: NextRequest, status: string) {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
  return NextResponse.redirect(`${base}/signin?verify=${status}`);
}

export async function GET(req: NextRequest) {
  const limit = hit(`verify:${clientIp(req.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const token = req.nextUrl.searchParams.get("token");
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  if (!token || !/^[a-f0-9]{64}$/.test(token) || !email || !validEmail(email)) {
    return redirectTo(req, "invalid");
  }

  try {
    const result = await consumeEmailVerificationToken(token, email);
    return redirectTo(req, result.ok ? "success" : result.reason);
  } catch {
    return redirectTo(req, "error");
  }
}
