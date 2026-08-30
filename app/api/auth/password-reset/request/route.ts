import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import {
  issuePasswordResetToken,
  revokePasswordResetToken,
} from "@/lib/auth/password-reset";
import {
  isTransactionalEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/email/transactional";
import { clientIp, hit } from "@/lib/rate-limit";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password reset link is on its way.";
const MAX_EMAIL_LENGTH = 254;
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function validEmail(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

export async function POST(request: NextRequest) {
  const rate = hit(
    `password-reset-request:${clientIp(request.headers)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many recovery attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid recovery request." }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof (body as { email?: unknown }).email !== "string"
  ) {
    return NextResponse.json({ error: "Invalid recovery request." }, { status: 400 });
  }

  const email = (body as { email: string }).email.trim().toLowerCase();
  if (!validEmail(email)) {
    return NextResponse.json({ error: "Invalid recovery request." }, { status: 400 });
  }

  if (!isTransactionalEmailConfigured()) {
    return NextResponse.json(
      { error: "Password recovery is temporarily unavailable." },
      { status: 503 }
    );
  }

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
      const issued = await issuePasswordResetToken(email);
      if (issued.status === "issued") {
        const delivery = await sendPasswordResetEmail({
          to: email,
          resetUrl: issued.url,
        });
        if (!delivery.delivered) {
          await revokePasswordResetToken(issued.token, email).catch(() => undefined);
        }
      }
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch {
    console.error(
      JSON.stringify({
        event: "password_reset_request_failed",
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "Password recovery is temporarily unavailable." },
      { status: 503 }
    );
  }
}
