// ---------------------------------------------------------------------------
// Bullet-Writer Agent
//
// Generates high-quality resume bullets for a work history entry.
//
// Canonical types: lib/types/generated-bullet.ts
// No type definitions in this file — all contracts live in lib/types/.
//
// Writing rules (strictly enforced):
//  - Strong action verbs, past tense for previous roles
//  - 3–6 bullets per role, 1–2 lines max per bullet
//  - NEVER use forbidden words
//  - NEVER use em dashes
//  - NEVER use first person
//  - NEVER use passive voice
//  - QUALIFIER RULE: never upgrade a self-assessed skill level (§8 CRITICAL)
//
// Rules (CLAUDE.md §8.3):
//  - tier3 via central router (quality generation — best model required)
//  - Max 500 output tokens per work history entry
//  - Returns canonical BulletWriterOutput from lib/types
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";
import { db } from "@/lib/db/client";
import { fetchResumeSourceProfile } from "@/lib/db/resume-source-profile";
import { retainQuantifiedSourceEvidence } from "@/lib/resume/evidence-retention";
import type { BulletWriterOutput, GeneratedBullet, BulletVerificationStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORBIDDEN_WORDS = [
  "leveraged", "spearheaded", "synergized", "dynamic", "results-driven",
  "passionate", "detail-oriented", "innovative", "strategic thinker", "responsible for",
];

const MAX_OUTPUT_TOKENS = 500;
const AGENT_VERSION = "bullet-writer@2.0.0";

// ---------------------------------------------------------------------------
// Private LLM output shape — never exported
// ---------------------------------------------------------------------------

interface _LLMBulletOutput {
  bullets:               string[];
  metrics_used:          string[];
  keywords_matched:      string[];
  forbidden_words_check: "passed" | "failed";
  qualifier_rule_check:  "passed" | "failed";
  confidence:            number;
  warnings:              string[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an elite resume bullet-point writer. Your task is to write concise, powerful resume bullets.

WRITING RULES (all are mandatory):
1. Begin every bullet with a strong past-tense action verb (e.g., Built, Reduced, Automated, Led, Shipped, Cut, Grew, Designed, Migrated).
2. Use past tense for previous roles. Use present tense ONLY if the role is marked as current.
3. Write 3–6 bullets per role. Each bullet must fit within 1–2 lines (approximately 120 characters max).
4. Quantify achievements wherever the source data supports it (%, $, count, time saved).
5. FORBIDDEN WORDS — never use any of these:
   leveraged, spearheaded, synergized, dynamic, results-driven, passionate,
   detail-oriented, innovative, strategic thinker, responsible for
6. NEVER use em dashes (—). Use commas, semicolons, or periods instead.
7. NEVER use first person (no "I", "my", "me", "we", "our").
8. NEVER use passive voice ("was built", "were managed", "is handled" etc.).
9. QUALIFIER RULE: if the source data describes a skill as "familiar" or "beginner", do NOT
   upgrade it to "proficient" or "expert" in the bullet.
10. AUTHORITY CALIBRATION: do not upgrade support/coordination experience into ownership.
   Use "owned", "directed", "accountable for", or "full accountability" only when the
   original bullets explicitly prove that authority.
11. Never claim ownership-level scope of any kind (budgets or P&L, system or
   platform implementations, regulated/clinical authority, headcount ownership,
   executive accountability) unless those exact responsibilities appear in the source data.
12. For a stretch senior role, bridge honestly with adjacent evidence: team size,
   KPIs, operations reviews, workflow coordination, safety, reporting, process
   improvement, and cross-functional work. Do not fabricate missing executive scope.

OUTPUT FORMAT:
Return a single valid JSON object with these keys:
  bullets            (string[])     — the generated bullet strings, each starting with a verb
  metrics_used       (string[])     — list of quantitative metrics you included
  keywords_matched   (string[])     — important keywords from the job/role context used
  forbidden_words_check ("passed"|"failed") — "passed" if none of the forbidden words appear
  qualifier_rule_check  ("passed"|"failed") — "passed" if no skill qualifiers were upgraded
  confidence         (number 0–1)   — your confidence that all rules are satisfied
  warnings           (string[])     — any caveats, e.g. missing metrics, ambiguous dates

Return ONLY the JSON object. No markdown fences. No explanation.`;

// ---------------------------------------------------------------------------
// Per-bullet quality checks (belt-and-suspenders after LLM generation)
// ---------------------------------------------------------------------------

function _checkForbiddenWords(bullet: string): "passed" | "failed" {
  const lower = bullet.toLowerCase();
  return FORBIDDEN_WORDS.some((w) => lower.includes(w.toLowerCase())) ? "failed" : "passed";
}

function _checkEmDash(bullet: string): "passed" | "failed" {
  return bullet.includes("—") ? "failed" : "passed";
}

function _checkStartsWithActionVerb(bullet: string): boolean {
  // Heuristic: first character is uppercase and followed by lowercase letters (action verb form)
  return /^[A-Z][a-z]/.test(bullet.trim());
}

function _extractMetrics(bullet: string): string[] {
  return bullet.match(/\d+(?:\.\d+)?[%$kKmMbBxX]?(?:\s+(?:million|billion|thousand|percent))?/g) ?? [];
}

/**
 * Normalize numeric tokens for fabrication checks: "1,500" / "1500+" / "98%"
 * all reduce to their bare digit string so formatting differences don't
 * create false positives.
 */
function _numericTokens(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) =>
    n.replace(/,/g, "")
  );
}

function _countLines(bullet: string): number {
  return Math.min(2, bullet.split("\n").length);
}

function toYearMonth(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "not specified" : date.toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// runBulletWriter — public entry-point
// ---------------------------------------------------------------------------

/**
 * Context passed on outer retry — when the Verifier flags failures that
 * internal retries couldn't fix, the orchestrator re-runs the Bullet Writer
 * with the specific correction instructions so the LLM knows what to change.
 */
export interface BulletWriterRetryContext {
  /** The verifier's retryInstructions from the failed VerifierResult */
  instructions: string;
  /** Which outer attempt this is (1 = first retry after initial failure) */
  outerAttempt: number;
}

/**
 * Generate optimized resume bullets for a work history entry.
 *
 * QUALIFIER RULE: The source data is passed verbatim to the LLM. Any skill
 * qualifier the user originally stated (e.g. "basic SQL") must not be upgraded
 * in the generated bullets. The system prompt enforces this; the Verifier
 * checks rule 9 as a safety net.
 *
 * @param workHistoryId  ID of the WorkHistory record
 * @param resumeId       ID of the target Resume (for keyword context)
 * @param retryContext   Optional — provided on outer retry by the orchestrator
 * @param maxBullets     Optional position-based cap from strategy (older roles get fewer)
 * @returns              Canonical BulletWriterOutput (lib/types/generated-bullet.ts)
 */
export async function runBulletWriter(
  workHistoryId: string,
  resumeId: string,
  retryContext?: BulletWriterRetryContext,
  maxBullets?: number,
  teachingContext = ""
): Promise<BulletWriterOutput> {
  const generatedAt = new Date().toISOString();

  // ------------------------------------------------------------------
  // Fetch source data
  // ------------------------------------------------------------------
  const [workHistory, resume, sourceProfile] = await Promise.all([
    db.workHistory.findUnique({
      where: { id: workHistoryId },
      include: { bullets: true },
    }),
    db.resume.findUnique({
      where: { id: resumeId },
      select: { targetRole: true, targetCompany: true, jdText: true, jdKeywords: true },
    }),
    fetchResumeSourceProfile(resumeId),
  ]);

  if (!workHistory) {
    throw new Error(`BulletWriter: WorkHistory not found — ${workHistoryId}`);
  }

  const sourceJob = sourceProfile?.jobs.find((job) => job.id === workHistoryId);
  const sourceBullets = sourceJob?.bullets.length
    ? sourceJob.bullets
    : workHistory.bullets.filter((bullet) => bullet.contentType !== "GENERATED");
  const sourceBulletIds: string[] = sourceBullets.map((bullet) => bullet.id);

  // ------------------------------------------------------------------
  // Build user prompt
  // ------------------------------------------------------------------
  const existingBullets = sourceBullets
    .map((b: { content: string }, i: number) => `  ${i + 1}. ${b.content}`)
    .join("\n");

  const evidenceJob = sourceJob ?? workHistory;
  const isCurrentRole = evidenceJob.current;
  const roleContext = resume
    ? `Target role: ${resume.targetRole}${resume.targetCompany ? ` at ${resume.targetCompany}` : ""}\nJD keywords: ${(resume.jdKeywords ?? []).join(", ")}`
    : "";
  const requestedBulletCount = Math.min(
    maxBullets ?? 6,
    Math.max(3, sourceBullets.length || 4)
  );

  const userPrompt = `
Work history entry:
  Company: ${evidenceJob.company}
  Title: ${evidenceJob.title}
  Start: ${toYearMonth(evidenceJob.startDate)}
  End: ${evidenceJob.endDate ? toYearMonth(evidenceJob.endDate) : isCurrentRole ? "present" : "not specified"}
  Current role: ${isCurrentRole ? "yes" : "no"}
  Location: ${evidenceJob.location ?? "not specified"}
  Employment type: ${evidenceJob.employmentType ?? "not specified"}

Original bullets (preserve factual content — do not invent or upgrade qualifiers):
${existingBullets || "  (none — generate from context)"}

HARD RULE: never invent numbers. Only reuse numbers, percentages, or
quantities that appear verbatim in the original bullets above. If the
original bullets contain no metrics, write strong bullets WITHOUT numbers.

HARD RULE: calibrate authority to the source. If the source says supported,
assisted, monitored, coordinated, or collaborated, do not rewrite it as owned,
directed, controlled, or had full accountability. If the JD asks for ownership-level scope
(budget or P&L, a named system or platform, regulated authority, executive
accountability) and the source does not prove it, omit those claims and
emphasize the strongest adjacent evidence instead.

${roleContext}

${teachingContext}

Generate ${requestedBulletCount} strong resume bullets.
Keep each bullet under 160 characters unless preserving a user-provided metric would make that impossible.
${retryContext ? `
CORRECTION REQUIRED (attempt ${retryContext.outerAttempt + 1}):
A quality check found the following issue in your previous output. Fix it in this generation:
${retryContext.instructions}
` : ""}`.trim();

  // ------------------------------------------------------------------
  // Call the router (tier3 for quality generation)
  // ------------------------------------------------------------------
  const result = await route({
    tier:         "tier3",
    agent:        "bullet-writer",
    systemPrompt: SYSTEM_PROMPT,
    messages:     [{ role: "user", content: userPrompt }],
    maxTokens:    MAX_OUTPUT_TOKENS,
  });

  // ------------------------------------------------------------------
  // Parse LLM output (private shape → canonical mapping)
  // ------------------------------------------------------------------
  let llmOutput: _LLMBulletOutput;
  try {
    const cleaned = result.content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    llmOutput = JSON.parse(cleaned) as _LLMBulletOutput;
  } catch {
    console.log(JSON.stringify({
      event:       "bullet_writer_parse_error",
      workHistoryId, resumeId,
      rawLength:   result.content.length,
      timestamp:   generatedAt,
    }));
    // Graceful fallback: treat response lines as bullets
    llmOutput = {
      bullets:               result.content.split("\n").filter((l) => l.trim().length > 0),
      metrics_used:          [],
      keywords_matched:      [],
      forbidden_words_check: "failed",
      qualifier_rule_check:  "failed",
      confidence:            0.3,
      warnings:              ["JSON parse failed — bullets extracted from raw text"],
    };
  }

  // ------------------------------------------------------------------
  // Deterministic metric-fidelity guardrail (spec: "All numbers and
  // metrics match what the user stated"). A generated bullet may only
  // contain numbers that exist in the user's own source bullets — any
  // bullet with an invented number is dropped outright, never shipped.
  // ------------------------------------------------------------------
  const sourceNumberSet = new Set(
    _numericTokens(sourceBullets.map((bullet) => bullet.content).join("\n"))
  );
  const fabricationWarnings: string[] = [];
  const factualBullets = llmOutput.bullets.filter((content) => {
    const invented = _numericTokens(content).filter((n) => !sourceNumberSet.has(n));
    if (invented.length > 0) {
      fabricationWarnings.push(
        `Dropped bullet with invented number(s) [${invented.join(", ")}]: "${content.slice(0, 80)}"`
      );
      return false;
    }
    return true;
  });

  if (fabricationWarnings.length > 0) {
    console.log(JSON.stringify({
      event: "bullet_writer_fabricated_metrics_dropped",
      workHistoryId, resumeId,
      dropped: llmOutput.bullets.length - factualBullets.length,
      kept: factualBullets.length,
      details: fabricationWarnings,
      timestamp: generatedAt,
    }));
  }

  // If everything was dropped, fall back to the user's own source bullets
  // verbatim — factually safe by definition.
  const safeGeneratedBullets = factualBullets.length > 0
    ? factualBullets
    : sourceBullets.slice(0, 5).map((bullet) => bullet.content);

  // Tailoring must not erase the candidate's strongest measurable proof.
  // Restore only verbatim source bullets, replacing lower-evidence generated
  // wording when needed so the requested bullet budget remains unchanged.
  const retainedEvidence = retainQuantifiedSourceEvidence(
    sourceBullets.map((bullet) => bullet.content),
    safeGeneratedBullets,
    requestedBulletCount,
    resume?.jdText ?? ""
  );
  llmOutput.bullets = retainedEvidence.bullets;
  const retentionWarnings = retainedEvidence.restored.map(
    (bullet) => `Preserved quantified source evidence: "${bullet.slice(0, 100)}"`
  );
  if (retainedEvidence.restored.length > 0) {
    console.log(JSON.stringify({
      event: "bullet_writer_source_evidence_restored",
      workHistoryId,
      resumeId,
      restored: retainedEvidence.restored.length,
      timestamp: generatedAt,
    }));
  }

  // ------------------------------------------------------------------
  // Build canonical GeneratedBullet[] + persist to DB
  // ------------------------------------------------------------------
  const generatedBullets: GeneratedBullet[] = [];
  const globalWarnings: string[] = [
    ...(llmOutput.warnings ?? []),
    ...fabricationWarnings,
    ...retentionWarnings,
  ];

  for (let idx = 0; idx < llmOutput.bullets.length; idx++) {
    const content = llmOutput.bullets[idx];

    // Per-bullet quality checks
    const forbiddenWordsCheck = _checkForbiddenWords(content);
    const emDashCheck         = _checkEmDash(content);
    const startsWithActionVerb = _checkStartsWithActionVerb(content);
    const lineCount           = _countLines(content);
    const metricsUsed         = _extractMetrics(content);

    // Warn on violations (belt-and-suspenders; Verifier catches these too)
    if (forbiddenWordsCheck === "failed") {
      globalWarnings.push(`Bullet ${idx + 1}: forbidden word detected`);
    }
    if (emDashCheck === "failed") {
      globalWarnings.push(`Bullet ${idx + 1}: em dash detected — remove`);
    }
    if (/\b(i|my|me|we|our)\b/i.test(content)) {
      globalWarnings.push(`Bullet ${idx + 1}: first-person pronoun detected`);
    }

    // Persist to DB and get stable ID
    const dbBullet = await db.bullet.create({
      data: {
        workHistoryId,
        content,
        contentType: "GENERATED",
        metrics:     metricsUsed,
        keywords:    llmOutput.keywords_matched,
        locked:      false,
      },
    });

    generatedBullets.push({
      id:                        dbBullet.id,
      workHistoryId,
      resumeId,
      content,
      metricsUsed,
      keywordsMatched:           llmOutput.keywords_matched,
      sourceCareerMemoryBulletIds: sourceBulletIds,
      startsWithActionVerb,
      lineCount,
      forbiddenWordsCheck,
      qualifierRuleCheck:        llmOutput.qualifier_rule_check,
      emDashCheck,
      confidence:                llmOutput.confidence ?? 0.5,
      warnings:                  globalWarnings.slice(), // snapshot at this bullet
      attemptNumber:             retryContext ? retryContext.outerAttempt + 1 : 1,
      verificationStatus:        "pending" as BulletVerificationStatus,
      agentVersion:              AGENT_VERSION,
      provider:                  result.provider,
      generatedAt,
    });
  }

  // ------------------------------------------------------------------
  // Log and return canonical output
  // ------------------------------------------------------------------
  console.log(JSON.stringify({
    event:              "bullet_writer_complete",
    workHistoryId,      resumeId,
    bulletsGenerated:   generatedBullets.length,
    forbiddenCheck:     llmOutput.forbidden_words_check,
    qualifierCheck:     llmOutput.qualifier_rule_check,
    confidence:         llmOutput.confidence,
    warnings:           globalWarnings,
    provider:           result.provider,
    tokensUsed:         result.tokensUsed,
    timestamp:          generatedAt,
  }));

  return {
    workHistoryId,
    resumeId,
    bullets:       generatedBullets,
    totalAttempts: retryContext ? retryContext.outerAttempt + 1 : 1,
    agentVersion:  AGENT_VERSION,
    provider:      result.provider,
    generatedAt,
  };
}
