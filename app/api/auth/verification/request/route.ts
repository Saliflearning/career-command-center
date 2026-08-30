import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import {
  deliverVerificationEmail,
  issueEmailVerificationToken,
} from "@/lib/auth/verification";
import { isTransactionalEmailConfigured } from "@/lib/email/transactional";
import { clientIp, hit } from "@/lib/rate-limit";

const GENERIC_MESSAGE =
  "If an unverified account exists for that email, a verification link is on its way.";
const RATE_LIMIT = 6;
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
    `verification-request:${clientIp(request.headers)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid verification request." },
      { status: 400 }
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof (body as { email?: unknown }).email !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid verification request." },
      { status: 400 }
    );
  }

  const email = (body as { email: string }).email.trim().toLowerCase();
  if (!validEmail(email)) {
    return NextResponse.json(
      { error: "Invalid verification request." },
      { status: 400 }
    );
  }

  if (!isTransactionalEmailConfigured()) {
    return NextResponse.json(
      { error: "Email verification is temporarily unavailable." },
      { status: 503 }
    );
  }

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    if (user && !user.emailVerified) {
      const issued = await issueEmailVerificationToken(email);
      await deliverVerificationEmail(email, issued.url);
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch {
    console.error(
      JSON.stringify({
        event: "email_verification_request_failed",
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Email verification is temporarily unavailable." },
      { status: 503 }
    );
  }
}
