// ---------------------------------------------------------------------------
// Summary Writer Agent
//
// Generates the career summary paragraph — the first thing a recruiter reads.
// This is calibrated to the specific JD being targeted, not a generic summary.
//
// Canonical types: lib/types/summary-writer-output.ts
//
// Rules:
//  - tier2 via central router (quality over speed for the most-read section)
//  - Max 150 output tokens (2–3 sentences; brevity is quality here)
//  - QUALIFIER RULE: never upgrade self-assessed skill levels in the summary
//  - NEVER invent roles, companies, or experiences not in CareerMemory
//  - Language: calm, human, professional — no buzzwords, no em dashes
//  - Must run AFTER strategy (summaryGuidance from ResumeStrategy is the brief)
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";
import type {
  CareerMemory,
  JDAnalysis,
  ResumeStrategy,
  SummaryWriterOutput,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_VERSION = "summary-writer@1.0.0";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the career summary writer for a premium AI resume platform.
You write the 2–3 sentence professional summary that appears at the very top of a resume.

This summary is the first thing a recruiter reads. It must feel human, specific, and confident.

WRITING RULES (all mandatory):
1. Exactly 2–3 sentences. No more. Brevity is quality.
2. Lead with the candidate's most relevant seniority and role identity for THIS specific job.
3. Reference 1–2 concrete accomplishments or strengths from their actual experience.
4. End with source-grounded value relevant to the target role. Do not state career intent or use "looking to", "seeking to", "eager to", or "poised to apply".
5. NEVER use: leveraged, spearheaded, synergized, dynamic, passionate, results-driven, detail-oriented, innovative, strategic thinker, responsible for.
6. NEVER use em dashes (—).
7. NEVER use first person (no "I", "my", "me").
8. NEVER invent roles, companies, or experiences not in the career profile.
9. QUALIFIER RULE: if a skill is described as "basic" or "some experience", do NOT present it as a strength.
10. Tone: calm, grounded, direct. The candidate sounds like someone who knows what they're doing.
11. AUTHORITY CALIBRATION: do not claim the candidate owns ownership-level scope of any kind (budgets or P&L, named system or platform implementations, regulated or clinical authority, executive accountability) unless the career profile explicitly proves it.
12. If the target role requires responsibilities beyond the current evidence, frame the candidate as bringing adjacent strengths, not as already owning that exact scope.

Return ONLY the summary text — no JSON, no markdown, no explanation. Just the paragraph.`;

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

/**
 * Generate the career summary for the top of the resume.
 *
 * Must be called AFTER runStrategy — the strategy's summaryGuidance is
 * the human-readable brief that scopes this generation.
 *
 * @param resumeId        Resume record ID
 * @param careerMemory    Canonical CareerMemory (normalizer output)
 * @param jdAnalysis      Canonical JDAnalysis (JD analyst output)
 * @param strategy        Canonical ResumeStrategy (strategy agent output)
 * @returns               SummaryWriterOutput (lib/types/summary-writer-output.ts)
 */
export async function runSummaryWriter(
  resumeId: string,
  careerMemory: CareerMemory,
  jdAnalysis: JDAnalysis,
  strategy: ResumeStrategy,
  teachingContext = ""
): Promise<SummaryWriterOutput> {
  const generatedAt = new Date().toISOString();

  // ------------------------------------------------------------------
  // Build the context brief
  // ------------------------------------------------------------------
  const mostRecentJob = careerMemory.jobs[0];
  const topSkills = careerMemory.skills
    .filter((s) => !s.proficiencyLabel || !["basic", "some experience", "beginner", "familiar"].includes(s.proficiencyLabel.toLowerCase()))
    .slice(0, 5)
    .map((s) => s.name)
    .join(", ");

  const topAchievements = careerMemory.jobs
    .slice(0, 2)
    .flatMap((j) => j.bullets.slice(0, 2).map((b) => b.content))
    .slice(0, 3)
    .join("\n");

  const userContent = `
SUMMARY GUIDANCE (from Strategy Agent):
${strategy.summaryGuidance}

CANDIDATE'S CURRENT / MOST RECENT ROLE:
${mostRecentJob ? `${mostRecentJob.title} at ${mostRecentJob.company} (${mostRecentJob.current ? "current" : "most recent"})` : "Not specified"}

STRONGEST SKILLS (excluding basic/familiar):
${topSkills || "See experience below"}

TOP ACHIEVEMENTS FROM THEIR CAREER:
${topAchievements || "See experience below"}

TARGET ROLE: ${jdAnalysis.targetRole}
TARGET COMPANY: ${jdAnalysis.targetCompany ?? "not specified"}
SENIORITY LEVEL: ${jdAnalysis.seniorityLevel ?? "not specified"}
WHAT THIS ROLE NEEDS (from JD analysis): ${jdAnalysis.summaryForUser}

ACCURACY NOTE:
Do not overstate authority. If the career profile shows support, coordination,
team leadership, KPI tracking, process improvement, or reporting, describe those
strengths directly. Do not say the candidate has ownership-level authority
(budget or P&L ownership, a named system or platform implementation, regulated
authority, or executive accountability) unless that exact evidence appears above.

${teachingContext ? `${teachingContext}\n` : ""}

Write the 2–3 sentence career summary now.
`.trim();

  // ------------------------------------------------------------------
  // Generate
  // ------------------------------------------------------------------
  const result = await route({
    tier:         "tier2",
    agent:        "summary-writer",
    systemPrompt: SYSTEM_PROMPT,
    messages:     [{ role: "user", content: userContent }],
    maxTokens:    150,
  });

  // Strip any accidental markdown or quotes
  const summaryText = sanitizeSummaryText(result.content
    .replace(/^["']|["']$/g, "")
    .replace(/^#+\s*/gm, "")
    .trim());

  const wordCount = summaryText.split(/\s+/).filter(Boolean).length;

  console.log(JSON.stringify({
    event:        "summary_writer_complete",
    resumeId,
    wordCount,
    provider:     result.provider,
    tokensUsed:   result.tokensUsed,
    timestamp:    generatedAt,
  }));

  return {
    resumeId,
    summaryText,
    wordCount,
    agentVersion: AGENT_VERSION,
    provider:     result.provider,
    generatedAt,
  };
}

const SUMMARY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bresults-driven\b\s*,?\s*/gi, ""],
  [/\bdetail-oriented\b\s*,?\s*/gi, ""],
  [/\bstrategic thinker\b/gi, ""],
  [/\bresponsible for\b/gi, "managing"],
  [/\bleveraged\b/gi, "used"],
  [/\bspearheaded\b/gi, "led"],
  [/\bsynergized\b/gi, "coordinated"],
  [/\bdynamic\b\s*,?\s*/gi, ""],
  [/\bpassionate\b/gi, "committed"],
  [/\binnovative\b/gi, "practical"],
  [/\b(?:looking|seeking|eager|poised|ready|prepared) to (?:leverage|apply|bring)\b/gi, "Brings"],
];

/** Deterministic final guard for model wording that violates product rules. */
export function sanitizeSummaryText(value: string): string {
  const sanitized = SUMMARY_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value.replace(/\u2014/g, "-")
  );
  return sanitized
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*([,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
