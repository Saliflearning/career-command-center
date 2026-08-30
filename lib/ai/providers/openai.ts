// ---------------------------------------------------------------------------
// OpenAI GPT Provider
//
// Models:
//   Tier 1  →  gpt-4o-mini  (fast, cheap)
//   Tier 2  →  gpt-4o       (balanced)
//   Tier 3  →  gpt-4o       (quality)
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { cleanEnv } from "@/lib/env";
import { getConfig } from "@/lib/config/server";
import type { Tier, Message } from "@/lib/ai/router";

const MODEL_MAP: Record<Tier, string> = {
  tier1: "gpt-4o-mini",
  tier2: "gpt-4o",
  tier3: "gpt-4o",
};

let _client: OpenAI | null = null;
let _clientKey: string | null = null;

async function getClient(): Promise<OpenAI> {
  const apiKey = await getConfig("OPENAI_API_KEY") ?? cleanEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!_client || _clientKey !== apiKey) {
    _client = new OpenAI({ apiKey });
    _clientKey = apiKey;
  }
  return _client;
}

export async function callOpenAI(
  messages: Message[],
  tier: Tier,
  maxTokens: number
): Promise<{ content: string; tokensUsed: number }> {
  const client = await getClient();
  const model = MODEL_MAP[tier];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const content = response.choices[0]?.message?.content ?? "";
  const tokensUsed =
    (response.usage?.prompt_tokens ?? 0) +
    (response.usage?.completion_tokens ?? 0);

  return { content, tokensUsed };
}
