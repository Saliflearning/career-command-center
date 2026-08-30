/**
 * POST /api/auth/register
 * Creates a new user with an email + hashed password.
 * Returns 201 on success, 409 if email already taken, 400 on bad input,
 * 429 when rate limited.
 *
 * Accounts are created UNVERIFIED and a real, expiring verification token is
 * issued (QUALITY_AUDIT F1). Sign-in is only gated on verification when
 * REQUIRE_EMAIL_VERIFICATION=true — see lib/auth/verification.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";
import { hit, clientIp } from "@/lib/rate-limit";
import {
  issueEmailVerificationToken,
  deliverVerificationEmail,
  isEmailVerificationRequired,
} from "@/lib/auth/verification";
import { isTransactionalEmailConfigured } from "@/lib/email/transactional";
import { evaluatePassword } from "@/lib/auth/password-policy";

const INVALID_REQUEST_MESSAGE = "Invalid registration request.";
const DUPLICATE_EMAIL_MESSAGE = "An account with this email already exists.";
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

// F2: two budgets, deliberately.
//
// A single counter over ALL requests would mean five typos (weak password, bad
// email) lock an honest user out for 15 minutes. So cheap rejects are bounded
// generously, while the tight budget applies only once a request is valid
// enough to reach bcrypt + the database — the part that actually costs us and
// the only path that can create accounts.
const BURST_LIMIT = 30; // any request, valid or not
const ACCOUNT_LIMIT = 5; // requests that reach hashing/persistence
const RATE_WINDOW_MS = 15 * 60 * 1000;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidEmailSyntax(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  // Cheap flood guard: bounds raw request volume before any work happens.
  const burst = hit(`register-burst:${ip}`, BURST_LIMIT, RATE_WINDOW_MS);
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(INVALID_REQUEST_MESSAGE, 400);
  }

  if (!isRecord(body)) {
    return errorResponse(INVALID_REQUEST_MESSAGE, 400);
  }

  const { name, email, password } = body;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    (name !== undefined && typeof name !== "string")
  ) {
    return errorResponse(INVALID_REQUEST_MESSAGE, 400);
  }

  const verificationRequired = isEmailVerificationRequired(new Date());
  if (verificationRequired && !isTransactionalEmailConfigured()) {
    // Never create an account that cannot pass its mandatory ownership gate.
    return errorResponse("Account creation is temporarily unavailable.", 503);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name?.trim() || null;

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > MAX_EMAIL_LENGTH ||
    !hasValidEmailSyntax(normalizedEmail) ||
    (normalizedName !== null && normalizedName.length > MAX_NAME_LENGTH) ||
    !evaluatePassword(password).valid
  ) {
    return errorResponse(INVALID_REQUEST_MESSAGE, 400);
  }

  // The request is well-formed: only now does it count against the tight
  // account-creation budget (this is the path that hashes and persists).
  const account = hit(`register-account:${ip}`, ACCOUNT_LIMIT, RATE_WINDOW_MS);
  if (!account.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(account.retryAfterSeconds) } }
    );
  }

  try {
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return errorResponse(DUPLICATE_EMAIL_MESSAGE, 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Commit the account and its first verification token together. A token
    // persistence failure rolls the account creation back, so the user can
    // retry instead of being stranded behind a duplicate-account response.
    const issued = await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email: normalizedEmail,
          name: normalizedName,
          hashedPassword,
          // The account has NOT been verified. Say so rather than asserting a
          // verification that never happened.
          emailVerified: null,
        },
        select: { id: true },
      });

      return issueEmailVerificationToken(normalizedEmail, tx);
    });

    // Delivery is deliberately outside the database transaction. Transport
    // failure must not roll back a valid account and token.
    let delivery: { delivered: boolean; url?: string } = { delivered: false };
    try {
      delivery = await deliverVerificationEmail(normalizedEmail, issued.url);
    } catch {
      // Swallow: never leak transport diagnostics or fail a committed account.
    }

    return NextResponse.json(
      {
        success: true,
        emailVerified: false,
        verificationRequired,
        verificationSent: delivery.delivered,
        // Only present outside production, where no mail transport exists yet.
        ...(delivery.url ? { verificationUrl: delivery.url } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return errorResponse(DUPLICATE_EMAIL_MESSAGE, 409);
    }

    return errorResponse("Account registration failed.", 500);
  }
}
