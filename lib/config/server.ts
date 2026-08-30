/**
 * lib/config/server.ts
 *
 * Encrypted server-side configuration store for sensitive values like API keys.
 *
 * Priority order:
 *   1. SystemConfig DB table (written via the admin settings page)
 *   2. Process environment variables (.env / system env)
 *
 * Keys are encrypted with AES-256-GCM using a secret derived from NEXTAUTH_SECRET.
 * The DB table is protected by Supabase RLS (service role only — no user access).
 *
 * Usage:
 *   const key = await getConfig("ANTHROPIC_API_KEY");
 */

import crypto from "crypto";
import { db } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

/** Derive a 32-byte AES key from NEXTAUTH_SECRET via SHA-256. */
function deriveKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET ?? "career-command-center-local-dev-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(plaintext: string): { value: string; iv: string; tag: string } {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    value: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

function decrypt(value: string, iv: string, tag: string): string {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(value, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

// ---------------------------------------------------------------------------
// In-process cache (TTL: 60 seconds) — avoids a DB round-trip on every LLM call
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function _fromCache(key: string): string | null | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined; // cache miss
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return undefined; // expired
  }
  return entry.value; // null = "key not set", string = value
}

function _toCache(key: string, value: string | null): void {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a config value. Returns the decrypted DB value if present,
 * otherwise falls back to the env var of the same name.
 */
export async function getConfig(key: string): Promise<string | null> {
  // 1. Check in-process cache
  const cached = _fromCache(key);
  if (cached !== undefined) return cached;

  // 2. Check DB
  try {
    const rows = await db.$queryRaw<Array<{ value: string; iv: string; tag: string }>>`
      SELECT value, iv, tag FROM "SystemConfig" WHERE key = ${key} LIMIT 1
    `;
    if (rows.length > 0) {
      const row = rows[0];
      const decrypted = decrypt(row.value, row.iv, row.tag);
      _toCache(key, decrypted);
      return decrypted;
    }
  } catch {
    // DB unreachable — fall through to env var
  }

  // 3. Fall back to process.env
  const envVal = process.env[key] ?? null;
  _toCache(key, envVal);
  return envVal;
}

/**
 * Write (upsert) an encrypted config value to the DB.
 * Pass null to delete the key (falls back to env var).
 */
export async function setConfig(key: string, value: string | null): Promise<void> {
  if (value === null || value === "") {
    await db.$executeRaw`DELETE FROM "SystemConfig" WHERE key = ${key}`;
    _cache.delete(key);
    return;
  }

  const { value: enc, iv, tag } = encrypt(value);
  await db.$executeRaw`
    INSERT INTO "SystemConfig" (key, value, iv, tag, "updatedAt")
    VALUES (${key}, ${enc}, ${iv}, ${tag}, now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          iv    = EXCLUDED.iv,
          tag   = EXCLUDED.tag,
          "updatedAt" = now()
  `;
  _toCache(key, value);
}

/**
 * Check whether a key has a value set (DB or env) without revealing the value.
 * Returns: "db" | "env" | "missing"
 */
export async function getConfigSource(
  key: string
): Promise<"db" | "env" | "missing"> {
  try {
    const rows = await db.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM "SystemConfig" WHERE key = ${key} LIMIT 1
    `;
    if (rows.length > 0) return "db";
  } catch {
    // ignore
  }
  const envVal = process.env[key];
  if (envVal && envVal !== "PASTE_YOUR_ANTHROPIC_KEY_HERE" && envVal !== "PASTE_YOUR_OPENAI_KEY_HERE") {
    return "env";
  }
  return "missing";
}

/** Invalidate a single cache entry (call after setConfig if immediate effect needed). */
export function invalidateConfigCache(key: string): void {
  _cache.delete(key);
}
