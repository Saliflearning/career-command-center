export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_BYTES = 72;

export type PasswordPolicyReason = "too-short" | "too-long" | null;

export interface PasswordAssessment {
  valid: boolean;
  reason: PasswordPolicyReason;
  characterCount: number;
  byteCount: number;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Password-only accounts use a long-passphrase policy. Spaces and Unicode are
 * allowed, and there is deliberately no special-character composition rule.
 * The byte ceiling prevents bcrypt from silently truncating a password.
 */
export function evaluatePassword(password: string): PasswordAssessment {
  const characterCount = Array.from(password).length;
  const byteCount = utf8ByteLength(password);
  const reason: PasswordPolicyReason =
    characterCount < MIN_PASSWORD_LENGTH
      ? "too-short"
      : byteCount > MAX_PASSWORD_BYTES
        ? "too-long"
        : null;

  return {
    valid: reason === null,
    reason,
    characterCount,
    byteCount,
  };
}

export function passwordPolicyMessage(reason: PasswordPolicyReason): string | null {
  if (reason === "too-short") {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  if (reason === "too-long") {
    return "Password is too long. Use a shorter passphrase.";
  }
  return null;
}
