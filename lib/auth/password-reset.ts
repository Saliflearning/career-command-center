import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const IDENTIFIER_PREFIX = "password-reset:";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type PasswordResetStore = Pick<
  Prisma.TransactionClient,
  "user" | "verificationToken"
>;

export type IssuePasswordResetResult =
  | {
      status: "issued";
      token: string;
      url: string;
      expires: Date;
    }
  | { status: "cooldown" };

/**
 * Issue a one-hour, single-use reset token. The stored value is a SHA-256 hash,
 * so a database read cannot be turned into an account-recovery link.
 */
export async function issuePasswordResetToken(
  email: string
): Promise<IssuePasswordResetResult> {
  const normalizedEmail = normalizeEmail(email);
  const identifier = `${IDENTIFIER_PREFIX}${normalizedEmail}`;

  return db.$transaction(async (tx) => {
    const existing = await tx.verificationToken.findFirst({
      where: { identifier },
    });
    const now = Date.now();

    // VerificationToken has no createdAt column. Because every reset token has
    // the same TTL, expires - TTL is its issue time.
    if (
      existing &&
      existing.expires.getTime() - TOKEN_TTL_MS + RESEND_COOLDOWN_MS > now
    ) {
      return { status: "cooldown" } as const;
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(now + TOKEN_TTL_MS);

    await tx.verificationToken.deleteMany({ where: { identifier } });
    await tx.verificationToken.create({
      data: {
        identifier,
        token: hashToken(token),
        expires,
      },
    });

    const base =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

    return {
      status: "issued",
      token,
      url: `${base}/reset-password?token=${token}&email=${encodeURIComponent(
        normalizedEmail
      )}`,
      expires,
    } as const;
  });
}

export async function revokePasswordResetToken(
  token: string,
  email: string
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  await db.verificationToken.deleteMany({
    where: {
      identifier: `${IDENTIFIER_PREFIX}${normalizedEmail}`,
      token: hashToken(token),
    },
  });
}

export type ConsumePasswordResetResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" };

export type InspectPasswordResetResult =
  | { ok: true; email: string; currentPasswordHash: string | null }
  | { ok: false; reason: "invalid" | "expired" };

async function findValidResetRecord(
  store: PasswordResetStore,
  token: string,
  normalizedEmail: string
) {
  const identifier = `${IDENTIFIER_PREFIX}${normalizedEmail}`;
  const record = await store.verificationToken.findFirst({
    where: { identifier },
  });
  if (!record) return { ok: false, reason: "invalid" } as const;

  const provided = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(record.token, "hex");
  const matches =
    provided.length === stored.length && timingSafeEqual(provided, stored);
  if (!matches) return { ok: false, reason: "invalid" } as const;

  if (record.expires.getTime() <= Date.now()) {
    await store.verificationToken.deleteMany({
      where: { identifier, token: record.token },
    });
    return { ok: false, reason: "expired" } as const;
  }

  return { ok: true, identifier, record } as const;
}

/**
 * Validate a reset link before comparing the proposed password with the
 * account's current bcrypt hash. The token remains usable after inspection so
 * a same-password rejection does not strand the account owner.
 */
export async function inspectPasswordResetToken(
  token: string,
  email: string
): Promise<InspectPasswordResetResult> {
  const normalizedEmail = normalizeEmail(email);

  return db.$transaction(async (tx: PasswordResetStore) => {
    const inspected = await findValidResetRecord(tx, token, normalizedEmail);
    if (!inspected.ok) return inspected;

    const user = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: { hashedPassword: true },
    });
    if (!user) return { ok: false, reason: "invalid" } as const;

    return {
      ok: true,
      email: normalizedEmail,
      currentPasswordHash: user.hashedPassword,
    } as const;
  });
}

/**
 * Consume exactly one reset token and replace the password in the same
 * transaction. A successful reset also verifies ownership of the email.
 */
export async function consumePasswordResetToken(
  token: string,
  email: string,
  hashedPassword: string
): Promise<ConsumePasswordResetResult> {
  const normalizedEmail = normalizeEmail(email);

  return db.$transaction(async (tx: PasswordResetStore) => {
    const inspected = await findValidResetRecord(tx, token, normalizedEmail);
    if (!inspected.ok) return inspected;

    const claimed = await tx.verificationToken.deleteMany({
      where: {
        identifier: inspected.identifier,
        token: inspected.record.token,
      },
    });
    if (claimed.count !== 1) {
      return { ok: false, reason: "invalid" } as const;
    }

    await tx.user.update({
      where: { email: normalizedEmail },
      data: {
        hashedPassword,
        emailVerified: new Date(),
      },
    });

    return { ok: true, email: normalizedEmail } as const;
  });
}
