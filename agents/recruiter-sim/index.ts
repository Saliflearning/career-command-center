// ---------------------------------------------------------------------------
// Recruiter Simulation Agent
//
// Simulates the 6-second glance a recruiter gives a resume before deciding
// to read further or discard. Returns first impressions, red flags, and
// missing signals that a real recruiter would notice.
//
// Rules (from CLAUDE.md §7, §13):
//  - Uses tier2 via the central router
//  - Returns structured JSON only — no free-form text
//  - Safe to run in parallel with other analysis agents
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecruiterSimResult {
  /** The very first thing a recruiter notices — one sentence. */
  firstImpression: string;
  /** Specific red flags that would cause a recruiter to hesitate or discard. */
  redFlags: string[];
  /** Important signals a recruiter would expect but cannot find. */
  missingSignals: string[];
  /** Overall recruiter confidence score (0–100). */
  overallScore: number;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the Recruiter Simulation agent for Career Command Center.

You are simulating the experience of a professional recruiter performing a 6-second resume scan.
This is the initial screening pass before a recruiter decides whether to read the resume in full.

You receive a resume as structured JSON and the target role context.
Return ONLY valid JSON — no markdown, no explanation, no preamble.

Output schema:
{
  "firstImpression": string,    // exactly one sentence: the very first thing that catches the eye
  "redFlags": string[],         // specific items that would make a recruiter pause or reject
  "missingSignals": string[],   // important signals the recruiter would expect but cannot find
  "overallScore": number        // 0–100 recruiter confidence score
}

Recruiter scan simulation rules:

WHAT RECRUITERS SCAN IN 6 SECONDS:
1. Job title and current/most recent employer — immediately visible?
2. Tenure at each company — gaps or very short stints?
3. Career trajectory — is the candidate moving up, sideways, or down?
4. Relevant keywords matching the target role — visible in first third of resume?
5. Education and credentials — present and appropriate for role level?
6. Overall visual clarity — can key information be found without hunting?

RED FLAGS TO SURFACE (if present):
- Employment gaps > 6 months without explanation
- Job-hopping (average tenure < 18 months across multiple roles)
- Title mismatch — applying for a senior role with only junior titles
- Overloaded summary with buzzwords and no concrete facts
- Bullets that use passive voice, "responsible for", or no action verbs
- Skills section lists technologies without demonstrating use
- Missing contact information or professional LinkedIn URL
- Dates inconsistently formatted or missing
- Resume exceeds one page for a candidate with under 10 years experience
- Generic bullets not tailored to the target role

MISSING SIGNALS TO SURFACE (if absent):
- Quantified achievements (numbers, percentages, dollar amounts, scale)
- Progression or growth indicators within or across roles
- Domain-specific keywords the role would expect
- Clear current status (employed vs. open to opportunities)
- Relevant certifications or credentials for the role type
- For technical roles: specific tools, languages, and platforms
- For leadership roles: team size, budget ownership, direct reports

Scoring guide for overallScore:
  85–100: Strong — recruiter would advance to phone screen without hesitation.
  70–84:  Good — recruiter would read the full resume before deciding.
  55–69:  Mixed — recruiter would advance only if volume is low.
  40–54:  Weak — likely skipped unless specifically sourced.
  Below 40: Poor — resume would be discarded in the initial pass.

Rules:
- firstImpression must be one sentence describing what stands out first (positive or negative).
- redFlags must be specific and observed — do not invent problems that are not present.
- missingSignals must be relevant to the target role — not a generic checklist.
- overallScore reflects a real recruiter's gut reaction, not just technical correctness.
- Return ONLY the JSON object.`;

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

function parseOutput(raw: string): RecruiterSimResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Recruiter sim agent returned non-JSON output. Raw: ${raw.slice(0, 300)}`
    );
  }

  const p = parsed as Record<string, unknown>;

  if (
    typeof p.firstImpression !== "string" ||
    !Array.isArray(p.redFlags) ||
    !Array.isArray(p.missingSignals) ||
    typeof p.overallScore !== "number"
  ) {
    throw new Error(
      `Recruiter sim output is missing required fields. Parsed: ${JSON.stringify(parsed).slice(0, 300)}`
    );
  }

  return {
    firstImpression: p.firstImpression as string,
    redFlags: p.redFlags as string[],
    missingSignals: p.missingSignals as string[],
    overallScore: Math.min(100, Math.max(0, Math.round(p.overallScore as number))),
  };
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Simulate a recruiter's 6-second resume scan.
 *
 * @param resumeId     Resume ID — used for logging.
 * @param resumeData   Structured resume content (JSON-serialisable).
 * @param targetRole   Target role title (e.g. "Senior Software Engineer").
 * @param targetCompany Optional target company name for context.
 * @returns            RecruiterSimResult with first impression, red flags, and score.
 */
export async function runRecruiterSim(
  resumeId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumeData: Record<string, any>,
  targetRole: string,
  targetCompany?: string
): Promise<RecruiterSimResult> {
  const companyCtx = targetCompany ? ` at ${targetCompany}` : "";

  const userContent = `
Target Role: ${targetRole}${companyCtx}

Resume Content:
${JSON.stringify(resumeData, null, 2)}

Simulate the 6-second recruiter scan and return the JSON result.
`.trim();

  const result = await route({
    tier: "tier2",
    agent: "recruiter-sim",
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 1024,
  });

  const simResult = parseOutput(result.content);

  console.log(
    JSON.stringify({
      event: "recruiter_sim_completed",
      resumeId,
      overallScore: simResult.overallScore,
      redFlagsCount: simResult.redFlags.length,
      missingSignalsCount: simResult.missingSignals.length,
      provider: result.provider,
      tokensUsed: result.tokensUsed,
      usedFallback: result.usedFallback,
      timestamp: new Date().toISOString(),
    })
  );

  return simResult;
}
