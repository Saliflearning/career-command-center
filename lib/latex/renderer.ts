/**
 * lib/latex/renderer.ts
 *
 * Client that calls the isolated XeLaTeX Docker worker.
 * This is the ONLY place in the codebase that is allowed to invoke the
 * latex-renderer service.
 *
 * Fallback strategy:
 *   Level 1 – Retry up to MAX_RETRIES times with exponential back-off on
 *              transient network / HTTP errors.
 *   Level 2 – After all retries are exhausted, throw a typed LatexRenderError
 *              so callers can surface a meaningful message to the user.
 */

import { cleanEnv } from "@/lib/env";

const LATEX_WORKER_URL =
  cleanEnv("LATEX_WORKER_URL") ?? "http://localhost:4000";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 300; // first retry waits ~300 ms

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class LatexRenderError extends Error {
  /** Which stage of the pipeline failed (validation / write / compile / read) */
  public readonly stage: string;
  /** Number of attempts made before giving up */
  public readonly attempts: number;

  constructor(message: string, stage: string, attempts: number) {
    super(message);
    this.name = "LatexRenderError";
    this.stage = stage;
    this.attempts = attempts;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for errors that are worth retrying (network/transient). */
function isRetryable(err: unknown): boolean {
  if (err instanceof LatexRenderError) {
    // A 422 from the worker means the LaTeX itself is bad – no point retrying.
    return false;
  }
  // TypeError covers fetch failures (ECONNREFUSED, ENOTFOUND, etc.)
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const retryableMessages = [
      "fetch failed",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "network",
      "socket",
    ];
    return retryableMessages.some((m) =>
      err.message.toLowerCase().includes(m.toLowerCase())
    );
  }
  return false;
}

/** Resolves after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Computes exponential back-off with full jitter. */
function backoffMs(attempt: number): number {
  // attempt is 1-indexed (first retry → attempt 1)
  const cap = 10_000; // max 10 s
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  return Math.min(cap, Math.random() * base);
}

// ---------------------------------------------------------------------------
// Core rendering function
// ---------------------------------------------------------------------------

/**
 * Renders a LaTeX document string to a PDF using the isolated Docker worker.
 *
 * @param latexSource - Full LaTeX document (must include \documentclass etc.)
 * @returns A Buffer containing the raw PDF bytes.
 * @throws {LatexRenderError} When all retries are exhausted or the LaTeX is invalid.
 */
export async function renderLatex(latexSource: string): Promise<Buffer> {
  const url = `${LATEX_WORKER_URL}/render`;

  let lastError: unknown = new Error("No attempts made");
  let lastStage = "unknown";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: latexSource }),
        // Generous timeout – full TeX compilation can take several seconds
        signal: AbortSignal.timeout(120_000),
      });

      if (response.ok) {
        // Success – return the raw PDF buffer
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      // Non-2xx response from the worker
      let errorMessage = `Worker returned HTTP ${response.status}`;
      let stage = "unknown";

      try {
        const body = (await response.json()) as {
          error?: string;
          stage?: string;
        };
        if (body.error) errorMessage = body.error;
        if (body.stage) stage = body.stage;
      } catch {
        // Response body was not JSON – keep the generic message
      }

      lastStage = stage;
      lastError = new LatexRenderError(errorMessage, stage, attempt);

      // 422 = invalid LaTeX; no point retrying
      if (response.status === 422) {
        throw lastError;
      }

      // Other HTTP errors (5xx, etc.) – treat as retryable
    } catch (err) {
      if (err instanceof LatexRenderError) {
        // Propagate typed errors immediately (includes the 422 case above)
        throw err;
      }

      lastError = err;
      lastStage = "network";

      if (!isRetryable(err)) {
        // Non-retryable error (e.g. programming mistake) – bail immediately
        throw new LatexRenderError(
          err instanceof Error ? err.message : String(err),
          lastStage,
          attempt
        );
      }
    }

    // Wait before next retry (no wait after the final attempt)
    if (attempt < MAX_RETRIES) {
      await sleep(backoffMs(attempt));
    }
  }

  // All retries exhausted
  throw new LatexRenderError(
    lastError instanceof Error
      ? lastError.message
      : "All render attempts failed",
    lastStage,
    MAX_RETRIES
  );
}
