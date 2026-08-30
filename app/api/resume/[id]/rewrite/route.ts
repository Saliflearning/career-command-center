/**
 * POST /api/resume/[id]/rewrite
 *
 * Rewrites a single bullet point using the central AI router.
 * This is the backend for the AI Rewrite Panel in the workspace.
 *
 * Request body:
 *   bulletText:   string   — the original bullet text to rewrite
 *   instruction:  string   — the rewrite instruction (e.g. "Make more concise")
 *   bulletId?:    string   — optional bullet ID for persistence
 *
 * Response:
 *   original:     string   — the original text echoed back
 *   rewritten:    string   — the rewritten bullet
 *   explanation:  string   — short rationale for the changes
 *   instruction:  string   — the instruction echoed back
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { route } from "@/lib/ai/router";
import { z } from "zod";

// States where rewriting is allowed
const EDITABLE_STATES = new Set([
  "QA_REVIEWED",
  "USER_EDITING",
  "EXPORTED",
  "TRACKED",
]);

const rewriteRequestSchema = z
  .object({
    bulletText: z.string().trim().min(1).max(2_000),
    instruction: z.string().trim().min(1).max(500),
    bulletId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const rewriteResponseSchema = z.object({
  rewritten: z.string().trim().min(1).max(2_000),
  explanation: z.string().trim().min(1).max(500),
});

const SYSTEM_PROMPT = `You are a resume bullet-point rewriter. You receive one resume bullet and a rewrite instruction.

RULES:
1. Begin with a strong past-tense action verb.
2. Keep the bullet to 1–2 lines (approximately 120 characters max).
3. Preserve all factual content — do NOT invent metrics, companies, or qualifications.
4. NEVER use forbidden words: leveraged, spearheaded, synergized, dynamic, results-driven, passionate, detail-oriented, innovative, strategic thinker, responsible for.
5. NEVER use em dashes (—).
6. NEVER use first person or passive voice.
7. QUALIFIER RULE: never upgrade a skill qualifier (e.g. "familiar" → "expert").

OUTPUT FORMAT:
Return a single valid JSON object with these keys:
  rewritten    (string) — the rewritten bullet
  explanation  (string) — 1 sentence explaining what changed and why (15 words max)

Return ONLY the JSON object. No markdown fences. No explanation outside the JSON.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid rewrite request." },
      { status: 400 }
    );
  }

  const requestResult = rewriteRequestSchema.safeParse(rawBody);
  if (!requestResult.success) {
    return NextResponse.json(
      { error: "Invalid rewrite request." },
      { status: 400 }
    );
  }

  const { bulletText, instruction, bulletId } = requestResult.data;

  // Validate resume exists and belongs to user
  const resume = await db.resume.findUnique({
    where: { id },
    select: {
      userId: true,
      state: true,
      targetRole: true,
      targetCompany: true,
      jdKeywords: true,
    },
  });

  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (resume.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!EDITABLE_STATES.has(resume.state)) {
    return NextResponse.json(
      { error: "Resume is not in an editable state" },
      { status: 409 }
    );
  }

  // Build context-aware user prompt
  const roleContext = resume.targetRole
    ? `Target role: ${resume.targetRole}${resume.targetCompany ? ` at ${resume.targetCompany}` : ""}`
    : "";

  const keywordsContext = resume.jdKeywords?.length
    ? `JD keywords to weave in when natural: ${(resume.jdKeywords as string[]).join(", ")}`
    : "";

  const userPrompt = `
Original bullet:
"${bulletText}"

Instruction: ${instruction}

${roleContext}
${keywordsContext}

Rewrite this single bullet following the instruction. Preserve all facts.`.trim();

  try {
    const result = await route({
      tier: "tier2",
      agent: "bullet-rewrite",
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 300,
    });

    let parsedJson: unknown;
    try {
      const cleaned = result.content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      parsedJson = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI returned an invalid rewrite. Please try again." },
        { status: 502 }
      );
    }

    const responseResult = rewriteResponseSchema.safeParse(parsedJson);
    if (!responseResult.success) {
      return NextResponse.json(
        { error: "AI returned an invalid rewrite. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      original: bulletText,
      rewritten: responseResult.data.rewritten,
      explanation: responseResult.data.explanation,
      instruction,
      bulletId: bulletId ?? null,
    });
  } catch (err) {
    console.error("Rewrite API error:", err);
    return NextResponse.json(
      { error: "AI rewrite failed. Please try again." },
      { status: 500 }
    );
  }
}
