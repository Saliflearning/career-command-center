import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  consumePasswordResetToken,
  inspectPasswordResetToken,
} from "@/lib/auth/password-reset";
import {
  evaluatePassword,
  passwordPolicyMessage,
} from "@/lib/auth/password-policy";
import { clientIp, hit } from "@/lib/rate-limit";

const INVALID_LINK_MESSAGE = "This password reset link is invalid or expired.";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function validEmail(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

export async function POST(request: NextRequest) {
  const rate = hit(
    `password-reset-confirm:${clientIp(request.headers)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
  }

  const { email, token, password } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    typeof token !== "string" ||
    typeof password !== "string"
  ) {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (
    !validEmail(normalizedEmail) ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
  }

  const passwordAssessment = evaluatePassword(password);
  if (!passwordAssessment.valid) {
    return NextResponse.json(
      { error: passwordPolicyMessage(passwordAssessment.reason) },
      { status: 400 }
    );
  }

  try {
    const inspected = await inspectPasswordResetToken(
      token,
      normalizedEmail
    );
    if (!inspected.ok) {
      return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 400 });
    }

    if (
      inspected.currentPasswordHash &&
      (await bcrypt.compare(password, inspected.currentPasswordHash))
    ) {
      return NextResponse.json(
        { error: "Choose a password different from your current password." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await consumePasswordResetToken(
      token,
      normalizedEmail,
      hashedPassword
    );
    if (!result.ok) {
      return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Password reset failed. Please request a new link." },
      { status: 500 }
    );
  }
}
