// ---------------------------------------------------------------------------
// Central AI Router
//
// ALL LLM calls in the system go through this file. No agent ever imports a
// provider SDK directly.
//
// Features:
//  - Per-agent provider lookup via ROUTING_CONFIG
//  - Level-1 retry: 3 attempts with exponential back-off
//  - Level-2 fallback: switches to secondary provider on persistent failure
//  - Structured console logging (DB wiring by E1)
//  - Custom AIRouterError for upstream catch-all handling
// ---------------------------------------------------------------------------

import { ROUTING_CONFIG } from "@/lib/ai/routing-config";
import type { Tier as TierFromConfig } from "@/lib/ai/routing-config";
import { callAnthropic } from "@/lib/ai/providers/anthropic";
import { callOpenAI } from "@/lib/ai/providers/openai";
import { callGemini } from "@/lib/ai/providers/gemini";
import { callMistral } from "@/lib/ai/providers/mistral";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Tier is defined in routing-config.ts (no circular dep); re-exported here
// so callers can import everything from "@/lib/ai/router".
export type Tier = TierFromConfig;

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RouterOptions {
  tier: Tier;
  agent: string;
  messages: Message[];
  maxTokens?: number;
  systemPrompt?: string;
}

export interface RouterResult {
  content: string;
  provider: string;
  tokensUsed: number;
  usedFallback: boolean;
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class AIRouterError extends Error {
  constructor(
    message: string,
    public readonly agent: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AIRouterError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TOKENS = 1024;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

// How long a provider stays circuit-broken after a non-retryable failure
// (billing, auth, missing key). Within this window the router skips it
// entirely instead of burning retries on every pipeline step.
const UNHEALTHY_COOLDOWN_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Non-retryable error detection + provider circuit breaker
//
// Retrying only helps for transient failures (rate limits, overload, network).
// Billing and auth errors will fail identically on every attempt — retrying
// them turns a 1-second failure into a minute-long stall per pipeline step.
// ---------------------------------------------------------------------------

const NON_RETRYABLE_PATTERNS = [
  /credit balance/i, // Anthropic: out of API credits
  /billing/i,
  /insufficient[_ ]quota/i, // OpenAI: out of quota
  /exceeded your current quota/i,
  /invalid x-api-key/i,
  /incorrect api key/i,
  /invalid api key/i,
  /authentication/i,
  /unauthorized/i,
  /is not set/i, // our own "X_API_KEY is not set" errors
  /model.*not.*found/i,
  /permission/i,
];

function isNonRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return NON_RETRYABLE_PATTERNS.some((p) => p.test(message));
}

// provider name -> timestamp until which it is considered down
const providerUnhealthyUntil = new Map<string, number>();

function isProviderHealthy(provider: string): boolean {
  const until = providerUnhealthyUntil.get(provider);
  if (until === undefined) return true;
  if (Date.now() >= until) {
    providerUnhealthyUntil.delete(provider);
    return true;
  }
  return false;
}

function markProviderUnhealthy(provider: string, reason: string): void {
  providerUnhealthyUntil.set(provider, Date.now() + UNHEALTHY_COOLDOWN_MS);
  console.log(
    JSON.stringify({
      event: "ai_router_provider_unhealthy",
      provider,
      cooldownMs: UNHEALTHY_COOLDOWN_MS,
      reason,
      timestamp: new Date().toISOString(),
    })
  );
}

type ProviderCall = (
  messages: Message[],
  tier: Tier,
  maxTokens: number
) => Promise<{ content: string; tokensUsed: number }>;

function getProviderFn(provider: string): ProviderCall {
  switch (provider) {
    case "anthropic":
      return callAnthropic;
    case "openai":
      return callOpenAI;
    case "gemini":
      return callGemini;
    case "mistral":
      return callMistral;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Attempt a single provider call with up to MAX_ATTEMPTS retries (exp back-off).
 * Returns null if all attempts fail (so the caller can try the fallback).
 */
async function attemptWithRetry(
  providerName: string,
  messages: Message[],
  tier: Tier,
  maxTokens: number,
  agent: string
): Promise<{ content: string; tokensUsed: number } | null> {
  const fn = getProviderFn(providerName);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fn(messages, tier, maxTokens);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nonRetryable = isNonRetryable(err);
      const isLastAttempt = attempt === MAX_ATTEMPTS || nonRetryable;
      console.log(
        JSON.stringify({
          event: "ai_router_retry",
          agent,
          provider: providerName,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          error: message,
          nonRetryable,
          willRetry: !isLastAttempt,
          timestamp: new Date().toISOString(),
        })
      );

      if (nonRetryable) {
        // Billing/auth failures won't recover on retry — circuit-break the
        // provider so subsequent pipeline steps skip it instantly.
        markProviderUnhealthy(providerName, message);
        return null;
      }

      if (isLastAttempt) {
        return null;
      }

      // Exponential back-off: 500ms, 1000ms, 2000ms …
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

export async function route(options: RouterOptions): Promise<RouterResult> {
  const { tier, agent, messages, maxTokens = DEFAULT_MAX_TOKENS, systemPrompt } = options;

  // Look up per-agent config
  const config = ROUTING_CONFIG[agent];
  if (!config) {
    throw new AIRouterError(
      `No routing config found for agent: "${agent}"`,
      agent,
      "none"
    );
  }

  // Prepend system prompt to the message list if provided
  const fullMessages: Message[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const startTime = Date.now();

  // ------------------------------------------------------------------
  // Level 1: Try primary provider with retry
  // (skipped instantly if circuit-broken by a recent billing/auth failure)
  // ------------------------------------------------------------------
  let result: { content: string; tokensUsed: number } | null = null;

  if (isProviderHealthy(config.primary)) {
    result = await attemptWithRetry(
      config.primary,
      fullMessages,
      tier,
      maxTokens,
      agent
    );
  } else {
    console.log(
      JSON.stringify({
        event: "ai_router_skip_unhealthy",
        agent,
        provider: config.primary,
        timestamp: new Date().toISOString(),
      })
    );
  }

  let usedFallback = false;
  let activeProvider = config.primary;

  // ------------------------------------------------------------------
  // Level 2: Fallback to secondary provider
  // ------------------------------------------------------------------
  if (!result) {
    console.log(
      JSON.stringify({
        event: "ai_router_fallback",
        agent,
        primaryProvider: config.primary,
        fallbackProvider: config.secondary,
        timestamp: new Date().toISOString(),
      })
    );

    result = await attemptWithRetry(
      config.secondary,
      fullMessages,
      tier,
      maxTokens,
      agent
    );

    usedFallback = true;
    activeProvider = config.secondary;
  }

  // ------------------------------------------------------------------
  // Both providers exhausted — surface a clean error
  // ------------------------------------------------------------------
  if (!result) {
    const err = new AIRouterError(
      `All providers exhausted for agent "${agent}" (primary: ${config.primary}, secondary: ${config.secondary})`,
      agent,
      activeProvider
    );
    console.log(
      JSON.stringify({
        event: "ai_router_error",
        agent,
        primary: config.primary,
        secondary: config.secondary,
        error: err.message,
        timestamp: new Date().toISOString(),
      })
    );
    throw err;
  }

  // ------------------------------------------------------------------
  // Success — log usage and return
  // ------------------------------------------------------------------
  const durationMs = Date.now() - startTime;
  console.log(
    JSON.stringify({
      event: "ai_router_usage",
      agent,
      provider: activeProvider,
      tier,
      tokensUsed: result.tokensUsed,
      maxTokens,
      usedFallback,
      durationMs,
      timestamp: new Date().toISOString(),
    })
  );

  return {
    content: result.content,
    provider: activeProvider,
    tokensUsed: result.tokensUsed,
    usedFallback,
  };
}
