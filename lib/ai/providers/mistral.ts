// ---------------------------------------------------------------------------
// Mistral Provider
//
// Uses fetch directly (no official SDK dependency).
//
// Models:
//   Tier 1  →  mistral-small   (fast, cheap)
//   Tier 2  →  mistral-large   (balanced)
//   Tier 3  →  mistral-large   (quality)
// ---------------------------------------------------------------------------

import { cleanEnv } from "@/lib/env";
import type { Tier, Message } from "@/lib/ai/router";

const MODEL_MAP: Record<Tier, string> = {
  tier1: "mistral-small",
  tier2: "mistral-large",
  tier3: "mistral-large",
};

const MISTRAL_API_BASE = "https://api.mistral.ai/v1";

interface MistralMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MistralRequestBody {
  model: string;
  messages: MistralMessage[];
  max_tokens: number;
}

interface MistralResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getApiKey(): string {
  const apiKey = cleanEnv("MISTRAL_API_KEY");
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not set");
  }
  return apiKey;
}

export async function callMistral(
  messages: Message[],
  tier: Tier,
  maxTokens: number
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = getApiKey();
  const model = MODEL_MAP[tier];

  const body: MistralRequestBody = {
    model,
    max_tokens: maxTokens,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  const response = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "<unreadable>");
    throw new Error(
      `Mistral API error: ${response.status} ${response.statusText} — ${errorText}`
    );
  }

  const data = (await response.json()) as MistralResponse;
  const content = data.choices[0]?.message?.content ?? "";
  const tokensUsed = data.usage?.total_tokens ?? 0;

  return { content, tokensUsed };
}
