// ---------------------------------------------------------------------------
// Verifier Agent
//
// Verifies resume bullets against all 9 quality rules before the output
// passes downstream. Uses tier1 (fast / cheap) via the central AI router.
//
// Canonical types: lib/types/verifier-result.ts
// No type definitions in this file — all contracts live in lib/types/.
//
// Rules (CLAUDE.md §8.4):
//  - tier1 via central router (fast, cheap — verification is token-light)
//  - Max 100 output tokens (the JSON verdict is small)
//  - Up to 3 retries per work-history entry; on each failure the reason
//    is fed back so Bullet Writer can correct it surgically
//  - After 3 failures: maxRetriesReached=true, surface to user — NEVER
//    block export indefinitely
//  - Returns canonical VerifierResult (lib/types) — no local type exports
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";
import { extractMetricTokens } from "@/lib/resume/evidence-retention";
import type {
  VerifierResult,
  VerifierChecks,
  VerifierCheck,
  CheckStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Input contract — constructed by the orchestrator, NOT the bullet writer
// Exported so the orchestrator can type-check its construction.
// ---------------------------------------------------------------------------

export interface VerifierContext {
  /** The job title the bullets are written for */
  jobTitle: string;
  /** Company name for this work history entry */
  companyName: string;
  /** Employment dates, e.g. "Jan 2020 – Mar 2022" */
  dates: string;
  /** Skills and tools the user actually mentioned — used for Rule 2 */
  userSkills: string[];
  /** Degree status — used for Rule 3 */
  degreeStatus?: "conferred" | "expected";
  /** Numeric metrics the user provided — used for Rule 4 */
  userMetrics: string[];
  /** Verbatim bullets from this source role; the factual boundary for Rule 5. */
  sourceEvidence?: string[];
  /** The job description text — used for Rule 6 (tailoring check) */
  jobDescription: string;
  /** The generated resume bullets to verify */
  bullets: string[];
  /** Qualifier pairs from CareerMemory — used for Rule 9 */
  qualifiers?: Array<{ skill: string; level: string }>;
}

// ---------------------------------------------------------------------------
// Private LLM response types — never exported
// ---------------------------------------------------------------------------

interface _LLMFailedCheck {
  rule: number;
  description: string;
  evidence: string;
}

interface _LLMVerifierResponse {
  passed: boolean;
  failedChecks: _LLMFailedCheck[];
}

// ---------------------------------------------------------------------------
// Rule → canonical VerifierChecks field name mapping
// ---------------------------------------------------------------------------

const RULE_TO_CHECK: Record<number, keyof VerifierChecks> = {
  1: "companyTitleDatesMatch",
  2: "noFabricatedSkills",
  3: "degreeStatusAccurate",
  4: "metricsMatchUserInput",
  5: "noCrossJobContamination",
  6: "tailoredToJD",
  7: "noEmDashes",
  8: "noForbiddenBuzzwords",
  9: "qualifierRuleHeld",
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const AGENT_VERSION = "verifier@2.1.0";
const FORBIDDEN_BUZZWORDS = /\b(?:leveraged|spearheaded|synergized|dynamic|results-driven|passionate|detail-oriented|innovative|strategic thinker|responsible for)\b/i;
const STRONG_SKILL_LEVELS = /\b(?:advanced|expert|expertise|mastery|mastered|proficient|proficiency|extensive|strong command)\b/i;
const EXPERT_SKILL_LEVELS = /\b(?:expert|expertise|mastery|mastered)\b/i;
const FIRST_PERSON_LANGUAGE = /(?:^|[^A-Za-z0-9])(?:I|my|me|mine|we|our|ours|us)(?=$|[^A-Za-z0-9])/i;

// ---------------------------------------------------------------------------
// System prompt (static — eligible for prompt caching)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a strict resume quality-assurance verifier.
You receive a structured JSON payload describing a resume bullet block and must
check it against exactly 9 rules, in order, failing fast on the first violation.

Return ONLY valid JSON matching this exact shape:
{
  "passed": boolean,
  "failedChecks": [
    { "rule": <number 1-9>, "description": "<short human-readable rule name>", "evidence": "<quoted text from bullets proving the violation>" }
  ]
}

If all rules pass, return: { "passed": true, "failedChecks": [] }
If a rule fails, return exactly one entry in failedChecks and stop checking further rules.

Rules (check in this exact order, fail fast):
1. Source-role identity fidelity: sourceCompanyName, sourceJobTitle, and sourceDates describe the user's PAST work-history entry. They are not supposed to match the target job. Pass this rule when the bullets make no company, title, or date claim. Only flag a bullet that explicitly names a company, title, or date that conflicts with the source-role values. NEVER compare source-role identity with targetJobDescription.
2. No invented skills/tools: the bullets must not mention any skill, tool, technology, or framework that does not appear in userSkills.
3. Degree status accuracy: if degreeStatus is present, bullets must use "conferred" for awarded degrees and "expected" for in-progress degrees — never the wrong word.
4. Metric fidelity: every number or metric in the bullets must appear verbatim in userMetrics. No invented percentages, dollar amounts, or multipliers.
5. Source-evidence grounding: judge generated bullets only against currentRoleSourceEvidence. The target job may guide wording but is never evidence that the user did something. Flag a concrete claim only when currentRoleSourceEvidence contradicts it or clearly belongs to another role. Do not speculate when the source uses equivalent wording.
6. Job-description tailoring: at least one bullet must reference a skill, keyword, or responsibility present in jobDescription. If none do, the resume is not tailored.
7. No em dashes: the bullets must contain no em dash character (—) anywhere.
8. No forbidden buzzwords: the bullets must not contain any of these words or phrases (case-insensitive): leveraged, spearheaded, synergized, dynamic, results-driven, passionate, detail-oriented, innovative, strategic thinker, responsible for.
9. No qualifier upgrades: for each entry in qualifiers, the bullets must not describe that skill at a higher level than the user stated (e.g. "basic Python" must not appear as "proficient Python" or "expert Python").`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _buildUserMessage(context: VerifierContext, previousFailure?: _LLMFailedCheck[]): string {
  const payload = JSON.stringify({
    sourceJobTitle:    context.jobTitle,
    sourceCompanyName: context.companyName,
    sourceDates:       context.dates,
    userSkills:    context.userSkills,
    degreeStatus:  context.degreeStatus ?? null,
    userMetrics:   context.userMetrics,
    currentRoleSourceEvidence: context.sourceEvidence ?? [],
    targetJobDescription: context.jobDescription.slice(0, 800), // cap JD length in token budget
    bullets:       context.bullets,
    qualifiers:    context.qualifiers ?? [],
  });

  if (!previousFailure || previousFailure.length === 0) return payload;
  return `${payload}\n\nPrevious verification failure:\n${JSON.stringify(previousFailure)}`;
}

function _extractBalancedJsonObjects(raw: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index++) {
    const character = raw[index];

    if (start === -1) {
      if (character === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
      if (depth === 0) {
        objects.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  if (start !== -1 || inString) {
    throw new Error("Verifier response contains incomplete JSON");
  }

  return objects;
}

function _extractSingleJsonObject(raw: string): string {
  const fences = Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  if (fences.length > 1) {
    throw new Error("Verifier response contains multiple fenced payloads");
  }

  if (fences.length === 1) {
    const fence = fences[0];
    const fencedContent = fence[1].trim();
    const objects = _extractBalancedJsonObjects(fencedContent);
    const outsideFence = `${raw.slice(0, fence.index)}${raw.slice((fence.index ?? 0) + fence[0].length)}`;

    if (objects.length !== 1 || _extractBalancedJsonObjects(outsideFence).length > 0) {
      throw new Error("Verifier response must contain exactly one JSON object");
    }
    if (fencedContent.replace(objects[0], "").trim()) {
      throw new Error("Verifier fenced payload contains non-JSON content");
    }
    return objects[0];
  }

  const objects = _extractBalancedJsonObjects(raw);
  if (objects.length !== 1) {
    throw new Error("Verifier response must contain exactly one JSON object");
  }
  const objectIndex = raw.indexOf(objects[0]);
  const outsideObject = `${raw.slice(0, objectIndex)}${raw.slice(objectIndex + objects[0].length)}`;
  if (/[{}\[\]]/.test(outsideObject)) {
    throw new Error("Verifier response contains ambiguous JSON structure");
  }
  return objects[0];
}

function _isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function _hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function _parseVerifierResponse(raw: string): _LLMVerifierResponse {
  const parsed: unknown = JSON.parse(_extractSingleJsonObject(raw));

  if (!_isRecord(parsed) || !_hasExactKeys(parsed, ["failedChecks", "passed"])) {
    throw new Error("Verifier response does not match the required object shape");
  }
  if (typeof parsed.passed !== "boolean") {
    throw new Error("Verifier response missing 'passed' boolean");
  }
  if (!Array.isArray(parsed.failedChecks)) {
    throw new Error("Verifier response missing 'failedChecks' array");
  }

  const failedChecks = parsed.failedChecks.map((value): _LLMFailedCheck => {
    if (!_isRecord(value) || !_hasExactKeys(value, ["description", "evidence", "rule"])) {
      throw new Error("Verifier failed check does not match the required shape");
    }
    if (!Number.isInteger(value.rule) || Number(value.rule) < 1 || Number(value.rule) > 9) {
      throw new Error("Verifier failed check contains an invalid rule number");
    }
    if (typeof value.description !== "string" || !value.description.trim()) {
      throw new Error("Verifier failed check is missing a description");
    }
    if (typeof value.evidence !== "string" || !value.evidence.trim()) {
      throw new Error("Verifier failed check is missing evidence");
    }

    return {
      rule: Number(value.rule),
      description: value.description.trim(),
      evidence: value.evidence.trim(),
    };
  });

  if (parsed.passed !== (failedChecks.length === 0)) {
    throw new Error("Verifier verdict contradicts its failed checks");
  }
  if (failedChecks.length > 1) {
    throw new Error("Verifier response must fail fast with at most one failed check");
  }

  return { passed: parsed.passed, failedChecks };
}

function _normalizeEvidence(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function _findFirstPersonFailure(context: VerifierContext): _LLMFailedCheck | null {
  const offendingBullet = context.bullets.find((bullet) => FIRST_PERSON_LANGUAGE.test(bullet));
  if (!offendingBullet) return null;

  return {
    rule: 1,
    description: "No first-person language",
    evidence: offendingBullet,
  };
}

/** Accept Rule 1 failures only when the cited contradictory value is in a bullet. */
function _isSpuriousIdentityFailure(
  failure: _LLMFailedCheck,
  context: VerifierContext
) {
  if (failure.rule !== 1) return false;
  const evidence = _normalizeEvidence(failure.evidence);
  if (!evidence) return true;
  if (/\b(source job title|source company name|source dates)\b/.test(evidence)) return true;

  const sourceIdentity = [context.jobTitle, context.companyName, context.dates]
    .map(_normalizeEvidence)
    .filter(Boolean);
  if (sourceIdentity.some((value) => evidence.includes(value))) return true;

  const rawEvidence = failure.evidence.trim();
  const citesDate = /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(rawEvidence);
  const citesIdentityClaim = /\b(?:company|employer|title|role|position|worked at|at [A-Z][\w&.-]+|for [A-Z][\w&.-]+)\b/.test(rawEvidence);
  const isShortNamedValue = evidence.split(/\s+/).length <= 3 && /[A-Z].*[A-Z]|[a-z][A-Z]/.test(rawEvidence);
  if (!citesDate && !citesIdentityClaim && !isShortNamedValue) return true;

  return !context.bullets.some((bullet) =>
    _normalizeEvidence(bullet).includes(evidence)
  );
}

function _isSpuriousDeterministicFailure(
  failure: _LLMFailedCheck,
  context: VerifierContext
) {
  if (failure.rule === 1) return _isSpuriousIdentityFailure(failure, context);

  const generatedText = context.bullets.join("\n");
  if (failure.rule === 4) {
    const allowedMetrics = new Set(
      context.userMetrics.flatMap((metric) => extractMetricTokens(metric))
    );
    return extractMetricTokens(generatedText).every((metric) => allowedMetrics.has(metric));
  }
  if (failure.rule === 7) return !generatedText.includes("—");
  if (failure.rule === 8) return !FORBIDDEN_BUZZWORDS.test(generatedText);
  if (failure.rule === 9) {
    const normalizedText = _normalizeEvidence(generatedText);
    const citedQualifier = (context.qualifiers ?? []).find(({ skill }) =>
      normalizedText.includes(_normalizeEvidence(skill))
    );

    // A qualifier only constrains the claimed proficiency level. Merely using a
    // truthfully listed skill is not an upgrade, even when the model flags it.
    if (!citedQualifier) return true;
    const evidenceWindow = failure.evidence || generatedText;
    const level = citedQualifier.level.toLowerCase();
    if (/\bintermediate\b/.test(level)) return !EXPERT_SKILL_LEVELS.test(evidenceWindow);
    if (/\b(?:basic|beginner|exposure|familiar|some experience)\b/.test(level)) {
      return !STRONG_SKILL_LEVELS.test(evidenceWindow);
    }
  }

  return false;
}

/**
 * Build canonical VerifierChecks from LLM failedChecks array.
 *
 * The LLM fails fast — it returns at most one failed check. All rules before
 * the failing rule are "passed"; all rules after are "skipped".
 * If failedChecks is empty, all 9 checks are "passed".
 */
function _buildChecks(failedChecks: _LLMFailedCheck[]): VerifierChecks {
  const failedRule  = failedChecks.length > 0 ? failedChecks[0].rule   : null;
  const failedDetail = failedChecks.length > 0 ? failedChecks[0].evidence : null;

  const makeCheck = (ruleNum: number): VerifierCheck => {
    const ruleName = RULE_TO_CHECK[ruleNum] ?? `rule_${ruleNum}`;
    let status: CheckStatus;
    let detail: string | null;

    if (failedRule === null) {
      status = "passed"; detail = null;
    } else if (ruleNum < failedRule) {
      status = "passed"; detail = null;
    } else if (ruleNum === failedRule) {
      status = "failed"; detail = failedDetail;
    } else {
      status = "skipped"; detail = null;
    }

    return { rule: String(ruleName), status, detail };
  };

  return {
    companyTitleDatesMatch:  makeCheck(1),
    noFabricatedSkills:      makeCheck(2),
    degreeStatusAccurate:    makeCheck(3),
    metricsMatchUserInput:   makeCheck(4),
    noCrossJobContamination: makeCheck(5),
    tailoredToJD:            makeCheck(6),
    noEmDashes:              makeCheck(7),
    noForbiddenBuzzwords:    makeCheck(8),
    qualifierRuleHeld:       makeCheck(9),
  };
}

/** All-skipped checks — used when the verifier service is unavailable. */
function _buildSkippedChecks(reason: string): VerifierChecks {
  const skipped: VerifierCheck = { rule: "skipped", status: "skipped", detail: reason };
  return {
    companyTitleDatesMatch:  skipped,
    noFabricatedSkills:      skipped,
    degreeStatusAccurate:    skipped,
    metricsMatchUserInput:   skipped,
    noCrossJobContamination: skipped,
    tailoredToJD:            skipped,
    noEmDashes:              skipped,
    noForbiddenBuzzwords:    skipped,
    qualifierRuleHeld:       skipped,
  };
}

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

/**
 * Run all 9 verification rules against a set of generated resume bullets.
 *
 * @param context        Structured input built by the orchestrator
 * @param bulletId       Stable ID for this verification run (may be workHistoryId for batch)
 * @param workHistoryId  ID of the WorkHistory record these bullets belong to
 * @param resumeId       ID of the Resume record being built
 * @returns              Canonical VerifierResult (lib/types/verifier-result.ts)
 */
export async function runVerifier(
  context: VerifierContext,
  bulletId: string,
  workHistoryId: string,
  resumeId: string
): Promise<VerifierResult> {
  let attemptNumber  = 0;
  let lastFailed: _LLMFailedCheck[] = [];
  let lastProvider   = "unknown";

  while (attemptNumber < MAX_RETRIES) {
    attemptNumber++;

    const userContent = _buildUserMessage(
      context,
      attemptNumber > 1 ? lastFailed : undefined
    );

    // ------------------------------------------------------------------
    // Call the router
    // ------------------------------------------------------------------
    let rawResponse: string;
    try {
      const result = await route({
        tier:         "tier1",
        agent:        "verifier",
        systemPrompt: SYSTEM_PROMPT,
        messages:     [{ role: "user", content: userContent }],
        maxTokens:    150, // verdict JSON is small; slightly above 100 for safety
      });
      rawResponse   = result.content;
      lastProvider  = result.provider;
    } catch (err) {
      console.log(JSON.stringify({
        event: "verifier_router_error",
        resumeId, workHistoryId, bulletId, attempt: attemptNumber,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }));

      if (attemptNumber >= MAX_RETRIES) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          bulletId, workHistoryId, resumeId, attemptNumber,
          passed: false,
          checks: _buildSkippedChecks(`Verifier service unavailable: ${reason}`),
          retryInstructions: null,
          maxRetriesReached: true,
          userMessage: "Quality checks could not be completed — the verification service was unavailable. Please review your resume manually before exporting.",
          agentVersion: AGENT_VERSION,
          provider: lastProvider,
          verifiedAt: new Date().toISOString(),
        };
      }
      continue;
    }

    // ------------------------------------------------------------------
    // Parse LLM response
    // ------------------------------------------------------------------
    let parsed: _LLMVerifierResponse;
    try {
      parsed = _parseVerifierResponse(rawResponse);
    } catch (parseErr) {
      console.log(JSON.stringify({
        event: "verifier_parse_error",
        resumeId, workHistoryId, bulletId, attempt: attemptNumber,
        raw: rawResponse.slice(0, 200),
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        timestamp: new Date().toISOString(),
      }));

      if (attemptNumber >= MAX_RETRIES) {
        return {
          bulletId, workHistoryId, resumeId, attemptNumber,
          passed: false,
          checks: _buildSkippedChecks(`Verifier returned unparseable response: ${rawResponse.slice(0, 100)}`),
          retryInstructions: null,
          maxRetriesReached: true,
          userMessage: "Quality checks produced an unexpected result. Please review your resume manually before exporting.",
          agentVersion: AGENT_VERSION,
          provider: lastProvider,
          verifiedAt: new Date().toISOString(),
        };
      }
      continue;
    }

    const deterministicFirstPersonFailure = _findFirstPersonFailure(context);
    if (deterministicFirstPersonFailure) {
      parsed = { passed: false, failedChecks: [deterministicFirstPersonFailure] };
    }

    const firstFailure = parsed.failedChecks[0];
    if (
      firstFailure &&
      !deterministicFirstPersonFailure &&
      _isSpuriousDeterministicFailure(firstFailure, context)
    ) {
      console.log(JSON.stringify({
        event: "verifier_spurious_failure_ignored",
        rule: firstFailure.rule,
        resumeId, workHistoryId, bulletId, attempt: attemptNumber,
        timestamp: new Date().toISOString(),
      }));
      parsed = { passed: true, failedChecks: [] };
    }

    // ------------------------------------------------------------------
    // Log result
    // ------------------------------------------------------------------
    console.log(JSON.stringify({
      event:       "verifier_result",
      resumeId, workHistoryId, bulletId, attempt: attemptNumber,
      passed:      parsed.passed,
      failedRules: parsed.failedChecks.map((c) => c.rule),
      provider:    lastProvider,
      timestamp:   new Date().toISOString(),
    }));

    // ------------------------------------------------------------------
    // Passed — return canonical success result
    // ------------------------------------------------------------------
    if (parsed.passed) {
      return {
        bulletId, workHistoryId, resumeId, attemptNumber,
        passed: true,
        checks: _buildChecks([]),
        retryInstructions: null,
        maxRetriesReached: false,
        userMessage: null,
        agentVersion: AGENT_VERSION,
        provider: lastProvider,
        verifiedAt: new Date().toISOString(),
      };
    }

    // ------------------------------------------------------------------
    // Failed — prepare for retry or final result
    // ------------------------------------------------------------------
    lastFailed = parsed.failedChecks;

    if (attemptNumber >= MAX_RETRIES) {
      console.log(JSON.stringify({
        event: "verifier_max_retries_exceeded",
        resumeId, workHistoryId, bulletId,
        lastFailedChecks: lastFailed,
        timestamp: new Date().toISOString(),
      }));

      const failedCheck   = lastFailed[0];
      const retryMsg      = failedCheck
        ? `Rule ${failedCheck.rule} failed: ${failedCheck.description}. Evidence: ${failedCheck.evidence}`
        : "Verification failed — no specific rule identified.";

      return {
        bulletId, workHistoryId, resumeId, attemptNumber,
        passed: false,
        checks: _buildChecks(lastFailed),
        retryInstructions: retryMsg,
        maxRetriesReached: true,
        userMessage: `One or more quality checks failed after ${MAX_RETRIES} attempts. Please review the flagged bullets before exporting.`,
        agentVersion: AGENT_VERSION,
        provider: lastProvider,
        verifiedAt: new Date().toISOString(),
      };
    }

    // Loop for retry — on next iteration, _buildUserMessage appends lastFailed
  }

  // Should be unreachable — the loop above always returns inside
  /* istanbul ignore next */
  throw new Error(`Verifier: retry loop exited without returning — resumeId=${resumeId}`);
}
