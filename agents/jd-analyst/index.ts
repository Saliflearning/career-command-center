// ---------------------------------------------------------------------------
// JD Analyst Agent
//
// Analyzes a job description and returns canonical JDAnalysis (lib/types).
// No type definitions live here — all contracts are in lib/types/jd-analysis.ts.
//
// Rules (CLAUDE.md §8.1, §13):
//  - tier2 via central router — never calls provider SDKs directly
//  - Truncates JD input to 2000 tokens max before sending
//  - Results cached 24 hours per SHA-256 hash of jdText
//  - Runs in parallel with Evidence Review — does NOT block on it
// ---------------------------------------------------------------------------

import crypto from "crypto";
import { route } from "@/lib/ai/router";
import type { JDAnalysis, JDKeyword, JDRequirement } from "@/lib/types";

// ---------------------------------------------------------------------------
// Token budget helpers
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;
const MAX_INPUT_TOKENS = 2000;
const MAX_CHARS = MAX_INPUT_TOKENS * CHARS_PER_TOKEN; // 8000 characters

function truncateToTokenBudget(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const truncated = text.slice(0, MAX_CHARS);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > MAX_CHARS * 0.9
    ? truncated.slice(0, lastSpace) + "\n[JD truncated to fit token budget]"
    : truncated + "\n[JD truncated to fit token budget]";
}

// ---------------------------------------------------------------------------
// Cache (in-process, 24-hour TTL — §13)
// ---------------------------------------------------------------------------

interface _CacheEntry {
  result: JDAnalysis;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _cache = new Map<string, _CacheEntry>();

function _hashJD(jdText: string): string {
  return crypto.createHash("sha256").update(jdText).digest("hex");
}

function _getCached(hash: string): JDAnalysis | null {
  const entry = _cache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(hash); return null; }
  return entry.result;
}

function _setCached(hash: string, result: JDAnalysis): void {
  _cache.set(hash, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Internal LLM output shape — private, never exported
// ---------------------------------------------------------------------------

interface _LLMOutput {
  topSkills: string[];
  tone: "formal" | "startup" | "corporate" | "government";
  keywords: string[];
  prioritySections: string[];
  roleType: string;
  seniorityLevel?: string | null;
  remotePolicy?: string | null;
  summaryForUser?: string;
  keyGapsInProfile?: string[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the JD Analyst for Career Command Center.
Analyze the job description and return ONLY valid JSON — no markdown, no explanation.

Output schema:
{
  "topSkills": string[],          // exactly 5 most required skills, ordered by importance
  "tone": "formal" | "startup" | "corporate" | "government",
  "keywords": string[],            // 8–15 keywords that should appear in the resume
  "prioritySections": string[],    // ordered resume sections most relevant to this role
  "roleType": "TECHNICAL" | "OPERATIONS" | "BUSINESS" | "DATA" | "FINANCE" | "ACADEMIC" | "FEDERAL" | "CREATIVE",
  "seniorityLevel": "entry" | "mid" | "senior" | "staff" | "executive" | null,
  "remotePolicy": "remote" | "hybrid" | "onsite" | null,
  "summaryForUser": string,        // 2–3 sentence plain-English summary of what this role needs
  "keyGapsInProfile": string[]     // skills/requirements in JD that are commonly missing — informational only, NEVER fabricated
}

Rules:
1. topSkills: exactly 5 items, most explicitly required first.
2. keywords: terms that appear in or are strongly implied by the JD.
3. roleType: single best fit.
4. tone: "government" if public sector; "formal" if finance/law; "startup" if casual; "corporate" for enterprise.
5. summaryForUser: plain English, no jargon, readable by a job seeker.
6. keyGapsInProfile: informational signals about what's typically needed — do NOT promise to fill these.
7. Return ONLY the JSON object.`;

// ---------------------------------------------------------------------------
// LLM output parser + mapper to canonical JDAnalysis
// ---------------------------------------------------------------------------

function _parseAndMap(
  raw: string,
  resumeId: string,
  jdHash: string,
  rawJdText: string,
  targetRole: string,
  targetCompany: string | null | undefined,
  provider: string
): JDAnalysis {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: _LLMOutput;
  try {
    parsed = JSON.parse(cleaned) as _LLMOutput;
  } catch {
    throw new Error(
      `JD Analyst returned non-JSON output. Raw (first 200 chars): ${raw.slice(0, 200)}`
    );
  }

  if (
    !Array.isArray(parsed.topSkills) ||
    !Array.isArray(parsed.keywords) ||
    typeof parsed.tone !== "string" ||
    typeof parsed.roleType !== "string"
  ) {
    throw new Error(
      `JD Analyst missing required fields. Received: ${JSON.stringify(parsed).slice(0, 200)}`
    );
  }

  // Map topSkills (required) + keywords (preferred) → canonical JDKeyword[]
  const topKeywords: JDKeyword[] = [
    ...parsed.topSkills.slice(0, 5).map((term) => ({
      term,
      frequency: 1,
      required: true,
      category: "domain" as const,
    })),
    ...parsed.keywords
      .filter((k) => !parsed.topSkills.includes(k))
      .map((term) => ({
        term,
        frequency: 1,
        required: false,
        category: "domain" as const,
      })),
  ];

  // Map topSkills → canonical JDRequirement[]
  const requirements: JDRequirement[] = parsed.topSkills.slice(0, 5).map((text) => ({
    text,
    type: "hard" as const,
    matchedInProfile: false, // orchestrator or strategy agent enriches this
    matchedSkillIds: [],
  }));

  return {
    resumeId,
    jdHash,
    analyzedAt: new Date().toISOString(),
    agentVersion: "jd-analyst@2.0.0",
    provider,
    rawJdText,
    targetCompany: targetCompany ?? null,
    targetRole,
    tone: parsed.tone as JDAnalysis["tone"],
    topKeywords,
    requirements,
    sections: [], // section extraction is a future enhancement
    seniorityLevel: (parsed.seniorityLevel as JDAnalysis["seniorityLevel"]) ?? null,
    remotePolicy: (parsed.remotePolicy as JDAnalysis["remotePolicy"]) ?? null,
    teamSize: null,
    industryDomain: null,
    summaryForUser: parsed.summaryForUser ?? `This role requires ${parsed.topSkills.slice(0, 3).join(", ")}.`,
    keyGapsInProfile: parsed.keyGapsInProfile ?? [],
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Analyze a job description and return canonical JDAnalysis.
 *
 * @param jdText        Full text of the JD (truncated if > 2000 tokens).
 * @param resumeId      Resume ID — for logging; not sent to model.
 * @param targetRole    The role title being targeted (from Resume record).
 * @param targetCompany Optional company name (from Resume record).
 * @returns             Canonical JDAnalysis (lib/types/jd-analysis.ts)
 *
 * Results are cached 24h per unique JD hash.
 */
export async function runJDAnalyst(
  jdText: string,
  resumeId: string,
  targetRole: string,
  targetCompany?: string | null
): Promise<JDAnalysis> {
  const rawJdText = truncateToTokenBudget(jdText);
  const jdHash = _hashJD(rawJdText);

  // Cache hit
  const cached = _getCached(jdHash);
  if (cached) {
    console.log(JSON.stringify({
      event: "jd_analyst_cache_hit", resumeId, jdHash,
      timestamp: new Date().toISOString(),
    }));
    return { ...cached, resumeId }; // freshen resumeId on cache hit
  }

  const wasTruncated = rawJdText.length < jdText.length;
  if (wasTruncated) {
    console.log(JSON.stringify({
      event: "jd_analyst_jd_truncated", resumeId,
      originalChars: jdText.length, truncatedChars: rawJdText.length,
      timestamp: new Date().toISOString(),
    }));
  }

  const result = await route({
    tier: "tier2",
    agent: "jd-analyst",
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Analyze this job description:\n\n${rawJdText}` }],
    maxTokens: 600,
  });

  const analysis = _parseAndMap(
    result.content, resumeId, jdHash, rawJdText,
    targetRole, targetCompany, result.provider
  );

  _setCached(jdHash, analysis);

  console.log(JSON.stringify({
    event:          "jd_analyst_completed",
    resumeId,       jdHash,
    roleType:       analysis.topKeywords[0]?.term ?? "unknown",
    tone:           analysis.tone,
    keywordsCount:  analysis.topKeywords.length,
    provider:       result.provider,
    tokensUsed:     result.tokensUsed,
    usedFallback:   result.usedFallback,
    timestamp:      new Date().toISOString(),
  }));

  return analysis;
}
