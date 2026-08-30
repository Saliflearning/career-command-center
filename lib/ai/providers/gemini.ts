// ---------------------------------------------------------------------------
// Google Gemini Provider
//
// Models:
//   Tier 1  →  gemini-1.5-flash  (fast, cheap)
//   Tier 2  →  gemini-1.5-pro    (balanced)
//   Tier 3  →  gemini-1.5-pro    (quality)
// ---------------------------------------------------------------------------

import { GoogleGenerativeAI } from "@google/generative-ai";
import { cleanEnv } from "@/lib/env";
import type { Tier, Message } from "@/lib/ai/router";

const MODEL_MAP: Record<Tier, string> = {
  tier1: "gemini-1.5-flash",
  tier2: "gemini-1.5-pro",
  tier3: "gemini-1.5-pro",
};

let _sdk: GoogleGenerativeAI | null = null;

function getSDK(): GoogleGenerativeAI {
  if (!_sdk) {
    const apiKey = cleanEnv("GEMINI_API_KEY") ?? cleanEnv("GOOGLE_AI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY (or GOOGLE_AI_API_KEY) is not set");
    }
    _sdk = new GoogleGenerativeAI(apiKey);
  }
  return _sdk;
}

export async function callGemini(
  messages: Message[],
  tier: Tier,
  maxTokens: number
): Promise<{ content: string; tokensUsed: number }> {
  const sdk = getSDK();
  const modelName = MODEL_MAP[tier];

  // Extract system instruction (Gemini treats it separately)
  const systemMessages = messages.filter((m) => m.role === "system");
  const systemInstruction = systemMessages.map((m) => m.content).join("\n\n");

  const model = sdk.getGenerativeModel({
    model: modelName,
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  });

  // Build Gemini-format history from non-system messages
  // Gemini roles are "user" | "model"
  const turnMessages = messages.filter((m) => m.role !== "system");

  // All but the last message become history; the last is the current prompt
  const historyMessages = turnMessages.slice(0, -1);
  const lastMessage = turnMessages[turnMessages.length - 1];

  const history = historyMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });

  const result = await chat.sendMessage(
    lastMessage?.content ?? ""
  );

  const response = result.response;
  const content = response.text();

  // Gemini usage metadata — may be undefined on older SDK versions
  const usageMeta = response.usageMetadata;
  const tokensUsed =
    (usageMeta?.promptTokenCount ?? 0) +
    (usageMeta?.candidatesTokenCount ?? 0);

  return { content, tokensUsed };
}
