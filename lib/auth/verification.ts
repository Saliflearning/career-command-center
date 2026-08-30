// ---------------------------------------------------------------------------
// Email verification (QUALITY_AUDIT F1).
//
// Before this module, registration stamped `emailVerified: new Date()` with the
// comment "treat registration as email-verified" — i.e. the system asserted a
// verification that never happened, so anyone could register an address they do
// not own.
//
// This module issues a real, expiring, single-use token and consumes it. New
// accounts are now created UNVERIFIED (emailVerified: null), which is simply
// the truth.
//
// ENFORCEMENT IS OPT-IN. Blocking sign-in requires a working mail transport;
// turning it on without one would lock every new user out. So sign-in is only
// gated when REQUIRE_EMAIL_VERIFICATION=true. Default (false) = today's
// behaviour, minus the false verification claim.
// ---------------------------------------------------------------------------

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import {
  isTransactionalEmailConfigured,
  sendVerificationEmail,
} from "@/lib/email/transactional";

/** How long a verification link stays valid. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Prefix stored in VerificationToken.identifier to namespace these tokens. */
const IDENTIFIER_PREFIX = "email-verify:";

/**
 * Is sign-in gated on a verified email? Opt-in, because enforcing it without a
 * mail transport configured would lock users out of their own accounts.
 */
export function isEmailVerificationRequired(accountCreatedAt?: Date | null): boolean {
  if (process.env.REQUIRE_EMAIL_VERIFICATION !== "true") return false;

  const configuredCutoff = process.env.EMAIL_VERIFICATION_ENFORCE_AFTER?.trim();
  if (!configuredCutoff) return true;

  const cutoff = Date.parse(configuredCutoff);
  if (!Number.isFinite(cutoff) || !accountCreatedAt) {
    // A bad production cutoff must not silently let a newly created account
    // bypass ownership verification. Set a valid ISO timestamp before enabling
    // enforcement on an existing deployment.
    return true;
  }

  return accountCreatedAt.getTime() >= cutoff;
}

/** Tokens are stored hashed so a database read cannot mint valid links. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedVerification {
  /** Raw token — only ever sent to the address being verified. */
  token: string;
  /** Absolute URL the user clicks. */
  url: string;
  expires: Date;
}

type VerificationTokenStore = Pick<
  Prisma.TransactionClient,
  "verificationToken"
>;

async function persistVerificationToken(
  store: VerificationTokenStore,
  identifier: string,
  tokenHash: string,
  expires: Date
): Promise<void> {
  await store.verificationToken.deleteMany({ where: { identifier } });
  await store.verificationToken.create({
    data: { identifier, token: tokenHash, expires },
  });
}

/**
 * Create a single-use verification token for an email address, replacing any
 * outstanding one for that address. Replacement is transactional so a failed
 * create cannot destroy the previous valid token.
 *
 * A caller already inside a transaction may pass that transaction client. The
 * registration route uses this to commit the account and its first token as
 * one state transition.
 */
export async function issueEmailVerificationToken(
  email: string,
  transaction?: VerificationTokenStore
): Promise<IssuedVerification> {
  const identifier = `${IDENTIFIER_PREFIX}${email}`;
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS);
  const tokenHash = hashToken(token);

  if (transaction) {
    await persistVerificationToken(transaction, identifier, tokenHash, expires);
  } else {
    await db.$transaction((tx) =>
      persistVerificationToken(tx, identifier, tokenHash, expires)
    );
  }

  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return {
    token,
    url: `${base}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`,
    expires,
  };
}

export type ConsumeResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Validate and consume a verification token, marking the user verified.
 * Single-use: the token row is deleted whether it was valid or expired.
 */
export async function consumeEmailVerificationToken(
  token: string,
  email: string
): Promise<ConsumeResult> {
  const identifier = `${IDENTIFIER_PREFIX}${email}`;
  return db.$transaction(async (tx) => {
    const record = await tx.verificationToken.findFirst({
      where: { identifier },
    });

    if (!record) return { ok: false, reason: "invalid" } as const;

    // Constant-time compare of the hashes to avoid leaking match position.
    const provided = Buffer.from(hashToken(token), "hex");
    const stored = Buffer.from(record.token, "hex");
    const matches =
      provided.length === stored.length && timingSafeEqual(provided, stored);

    if (!matches) return { ok: false, reason: "invalid" } as const;

    if (record.expires.getTime() <= Date.now()) {
      await tx.verificationToken.deleteMany({
        where: { identifier, token: record.token },
      });
      return { ok: false, reason: "expired" } as const;
    }

    // Claim the exact token before updating the user. Both operations live in
    // one transaction: an update failure rolls the deletion back, while two
    // concurrent clicks cannot both claim the same single-use token.
    const claimed = await tx.verificationToken.deleteMany({
      where: { identifier, token: record.token },
    });
    if (claimed.count !== 1) {
      return { ok: false, reason: "invalid" } as const;
    }

    await tx.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });

    return { ok: true, email } as const;
  });
}

export interface DeliveryOutcome {
  delivered: boolean;
  /** Present only when delivery is unavailable AND exposing it is safe. */
  url?: string;
}

/** Deliver a verification link without ever exposing it in production. */
export async function deliverVerificationEmail(
  email: string,
  url: string
): Promise<DeliveryOutcome> {
  if (isTransactionalEmailConfigured()) {
    return sendVerificationEmail({ to: email, verificationUrl: url });
  }

  return process.env.NODE_ENV !== "production"
    ? { delivered: false, url }
    : { delivered: false };
}
