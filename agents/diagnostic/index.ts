// ---------------------------------------------------------------------------
// Resume Diagnostic Agent
//
// Runs a multi-check diagnostic on a resume to surface issues before export.
// Checks: keyword density, bullet quality, ATS safety, section completeness,
// and tone match.
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

export interface DiagnosticResult {
  /** Estimated ATS compatibility score (0–100). */
  atsScore: number;
  /** Keyword coverage score relative to the job description (0–100). */
  keywordScore: number;
  /** List of specific issues found (e.g. forbidden words, weak bullets). */
  issues: string[];
  /** Actionable recommendations to improve the resume. */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the Resume Diagnostic agent for Career Command Center.

You receive a resume as structured JSON and optionally a job description for context.
Your job is to run a multi-point diagnostic and return structured JSON.

Return ONLY valid JSON — no markdown, no explanation, no preamble.

Output schema:
{
  "atsScore": number,           // 0–100, ATS compatibility estimate
  "keywordScore": number,       // 0–100, JD keyword coverage (50 if no JD provided)
  "issues": string[],           // specific problems found — be concrete, not generic
  "recommendations": string[]   // actionable fixes — one recommendation per issue
}

Diagnostic checks to run (all five required):

1. KEYWORD DENSITY
   - Are JD keywords present naturally in bullets and summary?
   - Penalise for keyword stuffing (same keyword >3 times) or keyword absence.
   - Score 0–100.

2. BULLET QUALITY
   - Each bullet should start with a strong action verb (past tense for prior roles).
   - Bullets should include metrics, scope, or outcomes where available.
   - Flag: passive voice, "responsible for", em dashes, buzzwords.
   - Forbidden buzzwords: leveraged, spearheaded, synergized, dynamic, results-driven,
     passionate, detail-oriented, innovative, strategic thinker.

3. ATS SAFETY
   - Single-column layout assumed (flag if structure suggests otherwise).
   - Standard section names only: Work Experience, Education, Skills, Certifications.
   - No tables, text boxes, graphics, or headers with critical info.
   - Dates in Month YYYY or MM/YYYY format only.
   - UTF-8 safe characters. No special symbols in section headers.

4. SECTION COMPLETENESS
   - Required sections: Summary (or Objective), Experience, Education, Skills.
   - Flag any missing required section.
   - Flag if bullet count per role is outside 3–6 range.

5. TONE MATCH
   - Does the writing style match the role type and JD tone?
   - Flag first-person language (I, my, we).
   - Flag overly casual or overly stiff language for the target role.

Scoring guide for atsScore:
  90–100: Excellent — passes all ATS checks.
  75–89:  Good — minor issues that should be fixed.
  60–74:  Fair — several issues, will lose points with some ATS systems.
  Below 60: Poor — significant problems that will likely cause rejection.

Rules:
- issues must be specific (e.g. "Bullet 3 under XYZ Corp uses passive voice: was responsible for").
- recommendations must be actionable (e.g. "Rewrite to: Reduced X by Y% by doing Z").
- Do not fabricate issues that are not present — only report what you observe.
- Return ONLY the JSON object.`;

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

function parseOutput(raw: string): DiagnosticResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Diagnostic agent returned non-JSON output. Raw: ${raw.slice(0, 300)}`
    );
  }

  const p = parsed as Record<string, unknown>;

  if (
    typeof p.atsScore !== "number" ||
    typeof p.keywordScore !== "number" ||
    !Array.isArray(p.issues) ||
    !Array.isArray(p.recommendations)
  ) {
    throw new Error(
      `Diagnostic output is missing required fields. Parsed: ${JSON.stringify(parsed).slice(0, 300)}`
    );
  }

  return {
    atsScore: Math.min(100, Math.max(0, Math.round(p.atsScore as number))),
    keywordScore: Math.min(100, Math.max(0, Math.round(p.keywordScore as number))),
    issues: p.issues as string[],
    recommendations: p.recommendations as string[],
  };
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Run a multi-point diagnostic on a resume.
 *
 * @param resumeId     Resume ID — used for logging.
 * @param resumeData   Structured resume content (JSON-serialisable).
 * @param jdText       Optional job description for keyword scoring context.
 * @returns            DiagnosticResult with scores, issues, and recommendations.
 */
export async function runDiagnostic(
  resumeId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumeData: Record<string, any>,
  jdText?: string
): Promise<DiagnosticResult> {
  const jdSection = jdText
    ? `\n\nJob Description (for keyword scoring):\n${jdText.slice(0, 3000)}`
    : "\n\n(No job description provided — keyword score will use 50 as baseline.)";

  const userContent = `
Resume Content:
${JSON.stringify(resumeData, null, 2)}
${jdSection}

Run the five diagnostic checks and return the JSON result.
`.trim();

  const result = await route({
    tier: "tier2",
    agent: "diagnostic",
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 1024,
  });

  const diagnostic = parseOutput(result.content);

  console.log(
    JSON.stringify({
      event: "diagnostic_completed",
      resumeId,
      atsScore: diagnostic.atsScore,
      keywordScore: diagnostic.keywordScore,
      issuesCount: diagnostic.issues.length,
      provider: result.provider,
      tokensUsed: result.tokensUsed,
      usedFallback: result.usedFallback,
      timestamp: new Date().toISOString(),
    })
  );

  return diagnostic;
}
