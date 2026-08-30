// ---------------------------------------------------------------------------
// Lightweight in-process rate limiter (QUALITY_AUDIT F2).
//
// Protects public, unauthenticated endpoints (/api/auth/register, /api/waitlist)
// from spam and email-enumeration bursts.
//
// HONEST LIMITATION: this counter lives in process memory. On serverless
// (Vercel) each instance has its own map, and instances recycle, so a
// determined attacker spreading requests across cold starts gets more than the
// nominal budget. It is a real mitigation against naive/accidental floods, NOT
// a distributed guarantee. Swap `hit()` for a Redis/Upstash-backed counter when
// a shared store exists — the call sites do not change.
// ---------------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Bound memory: drop expired buckets whenever the map grows past this.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
  // Array.from rather than direct Map iteration: the tsconfig target predates
  // downlevelIteration, and snapshotting avoids mutating while iterating.
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Expiry alone does not bound anything: a burst of distinct, still-live keys
  // grows the map without limit, so "bounded" was a false claim (Codex review
  // finding). Evict oldest-first — Map preserves insertion order — until the
  // cap holds. Evicting a live counter only grants that key a fresh budget,
  // which is the correct failure direction for a availability-preserving
  // limiter.
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  const overflow = buckets.size - MAX_TRACKED_KEYS;
  let removed = 0;
  for (const key of Array.from(buckets.keys())) {
    if (removed >= overflow) break;
    buckets.delete(key);
    removed++;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. Use for the Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limit check. Records a hit and reports whether it is
 * allowed.
 *
 * @param key      Caller identity, e.g. `register:1.2.3.4`
 * @param limit    Max requests per window
 * @param windowMs Window length in milliseconds
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    // Reinsert expired keys at the end so oldest-first eviction does not
    // immediately discard the fresh window for a key that happened to be old.
    if (existing) buckets.delete(key);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_TRACKED_KEYS) sweep(now);
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}

/**
 * Best-effort client IP from proxy headers. Vercel sets x-forwarded-for.
 * Falls back to a constant so a missing header degrades to a shared bucket
 * (fail-closed-ish) rather than granting everyone an unlimited private bucket.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Test-only: clear all counters. */
export function __resetRateLimits(): void {
  buckets.clear();
}

/** Test-only: how many keys are currently tracked (memory-bound assertions). */
export function __trackedKeyCount(): number {
  return buckets.size;
}

/** Test-only: the cap the sweep enforces. */
export const __MAX_TRACKED_KEYS = MAX_TRACKED_KEYS;
