// ---------------------------------------------------------------------------
// Environment variable sanitizer
//
// Env vars pasted into dashboards (Vercel, GitHub, etc.) frequently pick up
// invisible characters: BOM (U+FEFF), zero-width spaces, or trailing
// newlines. These break HTTP header serialization with errors like
// "Cannot convert argument to a ByteString because the character at index 0
// has a value of 65279". ALWAYS read secrets through cleanEnv().
// ---------------------------------------------------------------------------

// BOM, zero-width spaces/joiners, word-joiner, non-breaking space.
// Built via RegExp constructor so the source stays pure ASCII.
const INVISIBLE_CHARS = new RegExp(
  "[\\uFEFF\\u200B\\u200C\\u200D\\u2060\\u00A0]",
  "g"
);

/**
 * Read an env var with invisible characters and surrounding whitespace
 * stripped. Returns undefined if the var is unset or empty after cleaning.
 */
export function cleanEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const cleaned = raw.replace(INVISIBLE_CHARS, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Like cleanEnv but throws if the var is missing or empty.
 */
export function requireEnv(name: string): string {
  const value = cleanEnv(name);
  if (!value) {
    throw new Error(`Missing env variable: ${name} must be set`);
  }
  return value;
}
