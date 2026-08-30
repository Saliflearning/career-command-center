// ---------------------------------------------------------------------------
// Anthropic Claude Provider
//
// Models:
//   Tier 1  →  claude-haiku-4-5-20251001   (fast, cheap)
//   Tier 2  →  claude-sonnet-4-6            (balanced)
//   Tier 3  →  claude-sonnet-4-6            (quality)
//
// Implements prompt caching on system messages via cache_control: "ephemeral"
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import { cleanEnv } from "@/lib/env";
import { getConfig } from "@/lib/config/server";
import type { Tier, Message } from "@/lib/ai/router";

const MODEL_MAP: Record<Tier, string> = {
  tier1: "claude-haiku-4-5-20251001",
  tier2: "claude-sonnet-4-6",
  tier3: "claude-sonnet-4-6",
};

// Client is re-created when the key changes (DB-sourced keys rotate the client).
let _client: Anthropic | null = null;
let _clientKey: string | null = null;

async function getClient(): Promise<Anthropic> {
  // Check DB first, fall back to env (via getConfig priority chain)
  const apiKey = await getConfig("ANTHROPIC_API_KEY") ?? cleanEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  // Rotate client if key changed (e.g. updated via admin page)
  if (!_client || _clientKey !== apiKey) {
    _client = new Anthropic({ apiKey });
    _clientKey = apiKey;
  }
  return _client;
}

export async function callAnthropic(
  messages: Message[],
  tier: Tier,
  maxTokens: number
): Promise<{ content: string; tokensUsed: number }> {
  const client = await getClient();
  const model = MODEL_MAP[tier];

  // Separate system messages from conversation turns.
  // System messages get cache_control so the SDK can reuse the prompt cache.
  const systemMessages = messages.filter((m) => m.role === "system");
  const turnMessages = messages.filter((m) => m.role !== "system");

  // Build the system param with cache_control on the last system block
  // (Anthropic's recommended pattern for caching the full system prompt)
  const systemBlocks: Anthropic.Messages.TextBlockParam[] = systemMessages.map(
    (m, idx) => {
      const isLast = idx === systemMessages.length - 1;
      return isLast
        ? {
            type: "text",
            text: m.content,
            cache_control: { type: "ephemeral" },
          }
        : { type: "text", text: m.content };
    }
  );

  const apiMessages: Anthropic.Messages.MessageParam[] = turnMessages.map(
    (m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })
  );

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
    messages: apiMessages,
  });

  const content =
    response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("") ?? "";

  const tokensUsed =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  return { content, tokensUsed };
}
