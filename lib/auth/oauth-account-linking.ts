const VERIFIED_EMAIL_LINKING_PROVIDERS = new Set(["google"]);

/**
 * Auth.js blocks email-based OAuth account linking by default because an
 * untrusted provider could claim another user's address. Google is the only
 * provider we currently trust for this path because its userinfo email is
 * verified by Google. Every other provider stays fail-closed.
 */
export function shouldAllowVerifiedEmailAccountLinking(
  providerId: string
): boolean {
  return VERIFIED_EMAIL_LINKING_PROVIDERS.has(providerId);
}
