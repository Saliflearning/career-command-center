// ---------------------------------------------------------------------------
// Resume Strategy Agent
//
// Generates the resume strategy plan — section order, emphasis points,
// keyword matching, and gap analysis — before the Bullet Writer runs.
//
// Canonical types: lib/types/resume-strategy.ts, lib/types/jd-analysis.ts
// No type definitions in this file — all contracts live in lib/types/.
//
// Rules (CLAUDE.md §7, §8.2, §13):
//  - tier3 via central router (heavy task — best model required)
//  - Max 800 output tokens (cost governance)
//  - MUST NOT run until BOTH CareerMemory AND JDAnalysis are resolved
//  - NEVER fabricates gaps — gaps are informational only
//  - QUALIFIER RULE: never suggest adding skills the user has not mentioned
//  - NO imports from other agents — all types come from lib/types
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";
import type {
  JDAnalysis,
  CareerMemory,
  ResumeStrategy,
  SectionDecision,
  SectionName,
  WorkHistoryInScope,
  KeywordStrategy,
  RoleType,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Section order rules per RoleType (CLAUDE.md §8.2)
// ---------------------------------------------------------------------------

const SECTION_ORDER_BY_ROLE: Record<RoleType, SectionName[]> = {
  TECHNICAL:  ["summary", "technical_skills", "experience", "projects", "education", "certifications"],
  OPERATIONS: ["summary", "core_skills", "experience", "education"],
  BUSINESS:   ["summary", "core_skills", "experience", "education"],
  DATA:       ["summary", "technical_skills", "experience", "projects", "education"],
  FINANCE:    ["summary", "experience", "education", "core_skills"],
  ACADEMIC:   ["summary", "education", "experience", "publications", "core_skills"],
  FEDERAL:    ["summary", "experience", "education", "core_skills", "certifications", "achievements"],
  CREATIVE:   ["summary", "core_skills", "experience", "projects", "education"],
};

// ---------------------------------------------------------------------------
// Internal LLM output shape — private, never exported
// ---------------------------------------------------------------------------

interface _LLMStrategyOutput {
  sectionOrder: string[];
  emphasisPoints: string[];
  keywordsMatched: string[];
  keywordsPresent: string[];
  gaps: string[];
  structureRationale: string;
  roleType: string;
  workHistoryIncluded?: string[];  // job titles to include (optional enrichment)
  summaryGuidance?: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the Resume Strategy agent for Career Command Center.

You receive two inputs:
1. A user's career profile (CareerMemory JSON)
2. A JD analysis (JDAnalysis JSON)

Return ONLY valid JSON — no markdown, no explanation.

Output schema:
{
  "sectionOrder": string[],       // ordered section names for this role type
  "emphasisPoints": string[],     // exactly 3 experience highlights to lead with
  "keywordsMatched": string[],    // JD keywords genuinely found in career profile
  "keywordsPresent": string[],    // profile keywords not yet emphasized (gray)
  "gaps": string[],               // JD keywords NOT in profile — informational ONLY
  "structureRationale": string,   // one sentence (max 20 words) explaining structure
  "roleType": string,             // carry forward from JD analysis
  "summaryGuidance": string       // 1–2 sentences guiding summary generation
}

ABSOLUTE RULES — violating any is a critical failure:
1. NEVER add skills, tools, or qualifiers the user has not mentioned.
2. NEVER upgrade a user's self-assessed skill level ("basic SQL" stays "basic SQL").
3. gaps is INFORMATIONAL ONLY — it tells the user what is missing. NEVER suggest fabricating it.
4. emphasisPoints must come from verified career profile data — never invented.
5. keywordsMatched must only list keywords that genuinely appear in the career profile.
6. structureRationale: single sentence, max 20 words.
7. Return ONLY the JSON object.`;

// ---------------------------------------------------------------------------
// LLM output parser + mapper to canonical ResumeStrategy
// ---------------------------------------------------------------------------

function _parseAndMap(
  raw: string,
  resumeId: string,
  userId: string,
  jdAnalysis: JDAnalysis,
  careerMemory: CareerMemory,
  provider: string
): ResumeStrategy {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: _LLMStrategyOutput;
  try {
    parsed = JSON.parse(cleaned) as _LLMStrategyOutput;
  } catch {
    throw new Error(`Strategy agent returned non-JSON. Raw: ${raw.slice(0, 300)}`);
  }

  if (
    !Array.isArray(parsed.sectionOrder) || !Array.isArray(parsed.emphasisPoints) ||
    !Array.isArray(parsed.keywordsMatched) || !Array.isArray(parsed.gaps) ||
    typeof parsed.structureRationale !== "string" || typeof parsed.roleType !== "string"
  ) {
    throw new Error(`Strategy output missing required fields. Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }

  const roleType = parsed.roleType as RoleType;

  // Map sectionOrder strings → canonical SectionDecision[]
  // ALWAYS include all canonical sections for this role type — the LLM's sectionOrder
  // output is advisory only. Using fragile string matching to gate inclusion caused
  // Education and Skills to silently disappear when the LLM returned slightly different
  // names (e.g. "Skills" instead of "Core Skills"). The canonicalOrder already encodes
  // the correct sections for each RoleType — trust it, not the LLM string output.
  const canonicalOrder = SECTION_ORDER_BY_ROLE[roleType] ?? SECTION_ORDER_BY_ROLE.BUSINESS;
  const sectionOrder: SectionDecision[] = canonicalOrder.map((section, idx) => ({
    section,
    include: true, // Always include all role-canonical sections
    position: idx + 1,
    rationale: idx === 0 ? parsed.structureRationale : `Standard ${section} placement for ${roleType} roles`,
    emphasize: idx < 2,
  }));

  // Map work history entries → canonical WorkHistoryInScope[]
  // Bullet count is position-based: most recent role gets 5–6 bullets, older roles
  // get progressively fewer so the resume stays focused. This prevents over-expansion
  // of less-relevant older or tangential roles.
  const workHistoryInScope: WorkHistoryInScope[] = careerMemory.jobs.map((job, idx) => {
    const denseBusinessTrack = ["OPERATIONS", "BUSINESS", "FINANCE", "DATA", "CREATIVE"].includes(roleType);
    const bulletCountTarget = denseBusinessTrack
      ? (idx === 0 ? 3 : idx === 1 ? 2 : 1)
      : (idx === 0 ? 4 : idx === 1 ? 2 : 1);
    const include = denseBusinessTrack ? idx < 2 : idx < 3;
    return {
      workHistoryId:    job.id,
      company:          job.company,
      title:            job.title,
      include,
      bulletCountTarget,
      emphasisKeywords:  parsed.keywordsMatched.slice(0, 5),
      rationale:        include ? "Within focused target-role scope" : "Outside one-page target scope",
    };
  });

  // Map keywords → canonical KeywordStrategy[]
  const keywordStrategy: KeywordStrategy[] = parsed.keywordsMatched.map((kw) => ({
    keyword:          kw,
    targetSection:    "experience" as SectionName,
    targetWorkHistoryId: careerMemory.jobs[0]?.id ?? null,
  }));

  // Calculate match score
  const allJDKeywords = jdAnalysis.topKeywords.map((k) => k.term);
  const matchScore = allJDKeywords.length > 0
    ? Math.round((parsed.keywordsMatched.length / allJDKeywords.length) * 100)
    : 0;

  return {
    resumeId,
    userId,
    strategyVersion: 1,
    generatedAt:        new Date().toISOString(),
    agentVersion:       "strategy@2.0.0",
    provider,
    careerMemoryVersion: careerMemory.version,
    jdHash:             jdAnalysis.jdHash,
    roleType,
    sectionOrder,
    workHistoryInScope,
    keywordStrategy,
    summaryGuidance:    parsed.summaryGuidance ?? `Write a 3-sentence summary emphasizing ${(parsed.emphasisPoints[0] ?? "core strengths")}.`,
    topEmphases:        (parsed.emphasisPoints ?? []).slice(0, 3),
    keywordsMatched:    parsed.keywordsMatched,
    keywordsUnmatched:  parsed.gaps,
    matchScore,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate a resume strategy for a specific job description.
 *
 * PRECONDITION: Both careerMemory (Normalizer output) AND jdAnalysis
 * (JD Analyst output) must be fully resolved before calling this.
 * The orchestrator is responsible for this sequencing.
 *
 * All types come from lib/types — no cross-agent imports.
 *
 * @param resumeId      Resume ID — for logging.
 * @param jdAnalysis    Canonical JDAnalysis from lib/types.
 * @param careerMemory  Canonical CareerMemory from lib/types.
 * @returns             Canonical ResumeStrategy from lib/types.
 */
export async function runStrategy(
  resumeId: string,
  jdAnalysis: JDAnalysis,
  careerMemory: CareerMemory
): Promise<ResumeStrategy> {
  const userId = careerMemory.userId;

  const userContent = `
Career Profile (CareerMemory):
${JSON.stringify({
    jobs: careerMemory.jobs.map((j) => ({
      company: j.company, title: j.title,
      current: j.current, startDate: j.startDate, endDate: j.endDate,
      bulletCount: j.bullets.length,
      sampleBullets: j.bullets.slice(0, 2).map((b) => b.content),
    })),
    skills: careerMemory.skills.map((s) => ({
      name: s.name,
      proficiencyLabel: s.proficiencyLabel, // QUALIFIER — never upgrade
    })),
    education: careerMemory.education.map((e) => ({
      degree: e.degree, institution: e.institution, inProgress: e.inProgress,
    })),
    certifications: careerMemory.certifications.map((c) => c.name),
  }, null, 2)}

JD Analysis:
${JSON.stringify({
    tone: jdAnalysis.tone,
    topKeywords: jdAnalysis.topKeywords.map((k) => ({ term: k.term, required: k.required })),
    requirements: jdAnalysis.requirements.map((r) => ({ text: r.text, type: r.type })),
    summaryForUser: jdAnalysis.summaryForUser,
    seniorityLevel: jdAnalysis.seniorityLevel,
  }, null, 2)}

Target Role: ${jdAnalysis.targetRole}
Target Company: ${jdAnalysis.targetCompany ?? "not specified"}

Generate the resume strategy JSON now.
`.trim();

  const result = await route({
    tier: "tier3",
    agent: "strategy",
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 800,
  });

  const strategy = _parseAndMap(
    result.content, resumeId, userId, jdAnalysis, careerMemory, result.provider
  );

  console.log(JSON.stringify({
    event:           "strategy_completed",
    resumeId,
    roleType:        strategy.roleType,
    sectionsCount:   strategy.sectionOrder.length,
    keywordsMatched: strategy.keywordsMatched.length,
    gaps:            strategy.keywordsUnmatched.length,
    matchScore:      strategy.matchScore,
    provider:        result.provider,
    tokensUsed:      result.tokensUsed,
    usedFallback:    result.usedFallback,
    timestamp:       new Date().toISOString(),
  }));

  return strategy;
}
