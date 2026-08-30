/**
 * Server-side PostHog client.
 *
 * Uses posthog-node to fire events from API routes and Server Components.
 * Never import this module in a Client Component — use the PostHogProvider
 * browser SDK for client-side tracking instead.
 *
 * Usage:
 *   import { captureEvent } from "@/lib/analytics/posthog";
 *   await captureEvent(userId, "resume_exported", { format: "pdf" });
 */

import { PostHog } from "posthog-node";

// ---------------------------------------------------------------------------
// Singleton client
// The PostHog Node client buffers events and flushes in batches, so we keep
// a single instance across the process lifetime.
// ---------------------------------------------------------------------------
let _client: PostHog | null = null;

function getClient(): PostHog {
  if (_client) return _client;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

  if (!apiKey) {
    // Return a no-op shim when the key is missing so analytics never crashes
    // non-analytics code paths (e.g. during local dev without env vars).
    console.warn("[PostHog] NEXT_PUBLIC_POSTHOG_KEY is not set — events will be discarded.");
    _client = {
      capture: () => {},
      identify: () => {},
      flush: async () => {},
      shutdown: async () => {},
    } as unknown as PostHog;
    return _client;
  }

  _client = new PostHog(apiKey, {
    host,
    // Flush events every 30 s or when the batch reaches 20 events.
    flushAt: 20,
    flushInterval: 30_000,
  });

  return _client;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire an analytics event from a server context (API route, Server Component,
 * server action, background job, etc.).
 *
 * @param distinctId  The user's ID (use their DB `id` for authenticated users,
 *                    or a stable anonymous ID for pre-auth flows).
 * @param event       Event name in snake_case, e.g. "resume_exported".
 * @param properties  Optional flat object of event properties.
 */
export async function captureEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const client = getClient();
  client.capture({ distinctId, event, properties: properties ?? {} });
  // Flush immediately so the event isn't lost on short-lived serverless
  // functions that exit before the next batch interval.
  await client.flush();
}

/**
 * Identify / update a user's properties in PostHog.
 * Call this after sign-up or when profile data changes.
 */
export async function identifyUser(
  distinctId: string,
  properties: Record<string, unknown>
): Promise<void> {
  const client = getClient();
  client.identify({ distinctId, properties });
  await client.flush();
}

/**
 * Gracefully shut down the PostHog client (flush pending events).
 * Call this in a process shutdown handler if running a long-lived Node process.
 */
export async function shutdownPostHog(): Promise<void> {
  if (_client) {
    await _client.shutdown();
    _client = null;
  }
}
