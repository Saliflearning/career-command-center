// ---------------------------------------------------------------------------
// Quick Resume — the JD-first flow for a user with NO existing resume.
//
// Competitor research (COMPETITIVE_BRIEF.md) is blunt: generating from a JD and
// guided-question intake are TABLE STAKES (Kickresume, Jobscan). What the whole
// field does NOT do — and structurally resists doing — is TRUTHFULNESS. The
// market's fabrication epidemic (Gartner: 1 in 4 fake candidate profiles by
// 2028) is our opening. So this module is built around one guarantee:
//
//   The user's ANSWERS are the only facts. The JD is only the target. The model
//   may reframe, phrase, and align — it may NOT invent a work history, metric,
//   employer, title, date, skill, or seniority the answers do not contain.
//
// The prompts ask for that; `verifyQuickResumeGrounding` ENFORCES the part that
// can be enforced deterministically (numeric claims), and surfaces the rest for
// review. Numbers are the #1 fabrication in AI resumes, so numeric grounding is
// the highest-value hard gate.
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";
import intakePrompt from "@/prompts/quick-resume-intake/v1.1.0.json";
import writerPrompt from "@/prompts/quick-resume-writer/v1.1.0.json";
import {
  parseIntakeResponse,
  parseModelDraft,
  type CandidatePath,
  type IntakeQuestion,
} from "./quick-resume-contract";
import { normalizeEmployerEvidence } from "./employer-evidence";

// ---- Types ----------------------------------------------------------------

export interface QuickResumeExperience {
  title: string;
  company: string;
  location: string;
  dateLabel: string;
  bullets: string[];
}

export interface QuickResumeEducation {
  degree: string;
  institution: string;
  dateLabel: string;
  details: string;
}

export interface QuickResumeProject {
  name: string;
  description: string;
  technologies: string[];
  url: string;
}

export interface QuickResumeCertification {
  name: string;
  issuer: string;
  dateLabel: string;
}

export interface QuickResumeDraft {
  /** The title we present the candidate for — may be BELOW the JD's title. */
  targetTitle: string;
  /** Honest note when the JD title is a stretch above the evidence. Empty if not. */
  honestStretchNote: string;
  summary: string;
  coreSkills: string[];
  experience: QuickResumeExperience[];
  projects: QuickResumeProject[];
  education: QuickResumeEducation[];
  certifications: QuickResumeCertification[];
  /** Things the user still needs to fill (contact, a metric), never invented. */
  placeholdersForUser: string[];
}

// ---- Prompts (exported so they can be unit-tested for their contract) ------

export const INTAKE_SYSTEM_PROMPT = intakePrompt.system_prompt;

export const WRITER_SYSTEM_PROMPT = writerPrompt.system_prompt;

const WRITER_MAX_TOKENS = 4096;
const WRITER_SCHEMA_REPAIR_PROMPT = `SCHEMA REPAIR: Your previous response was not valid for the required JSON schema. Regenerate the entire resume object from the same job description and candidate answers. Return only strict JSON. Follow every field, array cardinality, and string-length limit in the system prompt. Do not trim an invalid object or add commentary.`;

const candidatePathContext: Record<CandidatePath, string> = {
  experienced: "The candidate has relevant work experience. Ask for relevant work experience, scope, tools, and outcomes.",
  "early-career": "The candidate is early-career. Ask for projects, education, or volunteering that proves the job requirements. Do not assume formal employment.",
  "career-change": "The candidate is changing fields. Ask for transferable experience, adjacent tools, and outcomes that map honestly to the target role.",
};

export function buildIntakeUserPrompt(
  jobDescription: string,
  candidatePath: CandidatePath
): string {
  return `CANDIDATE EVIDENCE PATH:\n${candidatePathContext[candidatePath]}\n\nTARGET JOB DESCRIPTION:\n${jobDescription.trim()}`;
}

export function buildWriterUserPrompt(jobDescription: string, answers: string): string {
  return `TARGET JOB DESCRIPTION (the target, NOT a source of the candidate's facts):
${jobDescription.trim()}

CANDIDATE'S ANSWERS (the ONLY facts about them — add nothing that is not here):
${answers.trim()}

Write the strongest TRUTHFUL, JD-aligned one-page resume from these answers.`;
}

// ---- JSON parsing (models sometimes wrap in a code fence) ------------------

function parseModelJson(raw: string, errorMessage: string): unknown {
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(errorMessage);
  }
}

export function parseIntakeModelOutput(raw: string): IntakeQuestion[] {
  return parseIntakeResponse(
    parseModelJson(raw, "Invalid Quick Resume intake response.")
  );
}

export function parseQuickResumeModelOutput(raw: string): QuickResumeDraft {
  return parseModelDraft(
    parseModelJson(raw, "Invalid Quick Resume draft response.")
  );
}

// ---- Prose sanitizer (deterministic house-style enforcement) ---------------
//
// The writer prompt forbids em dashes, but models still emit them (a live run
// put them straight into bullets). Section 8 of the product spec makes "no em
// dashes in bullets" a hard rule, and the em dash is a well-known AI-writing
// tell. So we ENFORCE it deterministically rather than trusting the model to
// comply every time. This touches ONLY punctuation: no number, name, date, or
// claim is added or removed, so it cannot change the grounding verdict.
//
// We target U+2014 (—) exclusively. Date ranges use U+2013 (–) or a hyphen and
// are left intact, so "2020 – 2024" survives untouched.
const EM_DASH = /\s*—\s*/g;
const LEADING_SUCCESS_CLAIM = /(^|[.!?]\s+)successfully\s+([a-z])/gi;

export function sanitizeProse(text: string): string {
  return text
    .replace(
      LEADING_SUCCESS_CLAIM,
      (_match, prefix: string, firstLetter: string) => `${prefix}${firstLetter.toUpperCase()}`
    )
    .replace(EM_DASH, ", ")   // "KPIs — incl. X — to mgr" -> "KPIs, incl. X, to mgr"
    .replace(/ {2,}/g, " ")    // collapse doubled spaces
    .replace(/\s+,/g, ",")     // stray space before a comma
    .replace(/,\s*,/g, ",")    // doubled commas from adjacent replacements
    .replace(/,\s*\./g, ".")   // comma landing directly before a period
    .replace(/,\s*$/g, "")     // trailing comma left when an em dash ended the text
    .trim();
}

/** Apply the house-style sanitizer to every human-visible string in a draft. */
export function sanitizeDraft(draft: QuickResumeDraft): QuickResumeDraft {
  return {
    ...draft,
    targetTitle: sanitizeProse(draft.targetTitle),
    honestStretchNote: sanitizeProse(draft.honestStretchNote),
    summary: sanitizeProse(draft.summary),
    coreSkills: draft.coreSkills.map(sanitizeProse),
    experience: draft.experience.map((e) => ({
      ...e,
      title: sanitizeProse(e.title),
      company: normalizeEmployerEvidence(sanitizeProse(e.company)),
      location: sanitizeProse(e.location),
      dateLabel: sanitizeProse(e.dateLabel),
      bullets: e.bullets.map(sanitizeProse),
    })),
    projects: draft.projects.map((project) => ({
      name: sanitizeProse(project.name),
      description: sanitizeProse(project.description),
      technologies: project.technologies.map(sanitizeProse),
      url: project.url.trim(),
    })),
    education: draft.education.map((entry) => ({
      degree: sanitizeProse(entry.degree),
      institution: sanitizeProse(entry.institution),
      dateLabel: sanitizeProse(entry.dateLabel),
      details: sanitizeProse(entry.details),
    })),
    certifications: draft.certifications.map((entry) => ({
      name: sanitizeProse(entry.name),
      issuer: sanitizeProse(entry.issuer),
      dateLabel: sanitizeProse(entry.dateLabel),
    })),
    // Placeholders keep their brackets; sanitize only the prose around them.
    placeholdersForUser: draft.placeholdersForUser.map(sanitizeProse),
  };
}

// ---- Model-backed operations ----------------------------------------------

/** Generate the plain-language intake questions for a JD. */
export async function generateIntakeQuestions(
  jobDescription: string,
  candidatePath: CandidatePath
): Promise<IntakeQuestion[]> {
  const result = await route({
    tier: "tier2",
    agent: "quick-resume-intake",
    systemPrompt: INTAKE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildIntakeUserPrompt(jobDescription, candidatePath) }],
    maxTokens: 700,
  });
  return parseIntakeModelOutput(result.content);
}

/** Generate a truthful, JD-aligned resume from the user's answers. */
export async function generateQuickResume(
  jobDescription: string,
  answers: string
): Promise<QuickResumeDraft> {
  const userPrompt = buildWriterUserPrompt(jobDescription, answers);
  const writerRequest = {
    tier: "tier3",
    agent: "quick-resume-writer",
    systemPrompt: WRITER_SYSTEM_PROMPT,
    maxTokens: WRITER_MAX_TOKENS,
  } as const;
  const result = await route({
    ...writerRequest,
    messages: [{ role: "user", content: userPrompt }],
  });

  try {
    return parseQuickResumeModelOutput(result.content);
  } catch {
    // One bounded regeneration gives a provider a chance to correct JSON or
    // schema cardinality mistakes. Response text is deliberately not logged.
    const repaired = await route({
      ...writerRequest,
      messages: [
        { role: "user", content: userPrompt },
        { role: "user", content: WRITER_SCHEMA_REPAIR_PROMPT },
      ],
    });
    return parseQuickResumeModelOutput(repaired.content);
  }
}

// ---- The grounding guarantee (deterministic, no model) --------------------

export interface GroundingResult {
  /** True only when every numeric claim in the draft is present in the answers. */
  grounded: boolean;
  /** Numeric claims in the draft that do NOT appear in the answers. */
  ungroundedNumbers: string[];
  /** Bracketed placeholders are honest gaps, not fabrication — reported, not failed. */
  placeholderCount: number;
}

/** Flatten a draft to the text a reader would see, for grounding checks. */
export function draftToText(draft: QuickResumeDraft): string {
  return [
    draft.targetTitle,
    draft.honestStretchNote,
    draft.summary,
    draft.coreSkills.join(" "),
    ...draft.experience.flatMap((e) => [
      e.title,
      e.company,
      e.location,
      e.dateLabel,
      ...e.bullets,
    ]),
    ...draft.projects.flatMap((project) => [
      project.name,
      project.description,
      ...project.technologies,
      project.url,
    ]),
    ...draft.education.flatMap((entry) => [
      entry.degree,
      entry.institution,
      entry.dateLabel,
      entry.details,
    ]),
    ...draft.certifications.flatMap((entry) => [
      entry.name,
      entry.issuer,
      entry.dateLabel,
    ]),
    ...draft.placeholdersForUser,
  ].join("\n");
}

// A bracketed placeholder like "[add number, e.g. 15]" is the user's to fill —
// its digits must NOT be treated as a fabricated claim.
const EXPLICIT_PLACEHOLDER = /^(?:add|enter|provide|insert|confirm|verify|specify)\b/i;

function isExplicitPlaceholder(value: string): boolean {
  return EXPLICIT_PLACEHOLDER.test(value.trim());
}

// Only instruction-shaped brackets are placeholders. Arbitrary brackets such
// as "[by 37%]" remain candidate claims and must pass grounding.
function stripPlaceholders(text: string): string {
  return text.replace(/\[([^\]]*)\]/g, (whole, content: string) =>
    isExplicitPlaceholder(content) ? " " : whole
  );
}

function placeholderKey(value: string): string {
  return value
    .replace(/^\s*\[/, "")
    .replace(/\]\s*$/, "")
    .replace(EXPLICIT_PLACEHOLDER, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countPlaceholders(draft: QuickResumeDraft): number {
  const placeholders = new Set<string>();
  const visibleText = draftToText(draft);

  for (const match of Array.from(visibleText.matchAll(/\[([^\]]*)\]/g))) {
    const content = match[1] ?? "";
    if (!isExplicitPlaceholder(content)) continue;
    const key = placeholderKey(content);
    if (key) placeholders.add(key);
  }

  for (const value of draft.placeholdersForUser) {
    if (typeof value !== "string" || !value.trim()) continue;
    const key = placeholderKey(value);
    if (key) placeholders.add(key);
  }

  return placeholders.size;
}

interface NumericClaim {
  canonical: string;
  display: string;
}

const NUMERIC_CLAIM_PATTERN =
  /\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|million|thousand|bn|mm|[kmb]))?(?:\s*(?:usd|dollars?))?(?:\s*(?:percentage\s+points?|percent(?:age)?|%|\+|x|years?|months?|weeks?|days?|hours?|people|persons?|employees?|associates?|staff|users?|customers?|team\s+members?|members?))?/gi;

function compactNumber(value: string): string {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? String(parsed) : value.replace(/,/g, "");
}

function magnitude(raw: string): { factor: number; suffix: string } | null {
  const match = raw.match(/(billion|million|thousand|bn|mm|[kmb])\b/i);
  if (!match) return null;

  switch (match[1].toLowerCase()) {
    case "thousand":
    case "k":
      return { factor: 1_000, suffix: "k" };
    case "billion":
    case "bn":
    case "b":
      return { factor: 1_000_000_000, suffix: "b" };
    default:
      return { factor: 1_000_000, suffix: "m" };
  }
}

function claimNumber(raw: string): string | null {
  const number = raw.match(/\d[\d,]*(?:\.\d+)?/);
  return number ? compactNumber(number[0]) : null;
}

function scaledNumber(raw: string, inheritedScale?: { factor: number; suffix: string } | null): string | null {
  const base = claimNumber(raw);
  if (base === null) return null;
  const scale = magnitude(raw) ?? inheritedScale ?? null;
  return scale ? String(Number(base) * scale.factor) : base;
}

function overlaps(
  start: number,
  end: number,
  spans: Array<{ start: number; end: number }>
): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function rangeEndpointKind(raw: string, unit: string): string {
  const combined = `${raw} ${unit}`;
  if (/^\s*\$/.test(raw) || /\b(?:usd|dollars?)\b/.test(raw)) return "currency";
  if (/\bpercentage\s+points?\b/.test(unit)) return "percentage-point";
  if (/%|\bpercent(?:age)?\b/.test(unit)) return "percent";

  const duration = unit.match(/\b(years?|months?|weeks?|days?|hours?)\b/);
  if (duration) return `duration:${duration[1].replace(/s$/, "")}`;
  if (/\b(?:people|persons?|employees?|associates?|staff|users?|customers?|team\s+members?|members?)\b/.test(unit)) {
    return "headcount";
  }
  if (magnitude(combined)) return "magnitude";
  return "number";
}

/** Extract claims without allowing equal digits to cross semantic units. */
function numericClaims(text: string): NumericClaim[] {
  const withoutIsoDatePrecision = text
    .replace(/\b(19\d{2}|20\d{2})-\d{2}-\d{2}\b/g, "$1")
    .replace(/\b(19\d{2}|20\d{2})-(?:0[1-9]|1[0-2])\b/g, "$1");
  const claims: NumericClaim[] = [];
  const consumed: Array<{ start: number; end: number }> = [];

  // Ranges are atomic claims. Two unrelated counts in the source must not
  // ground a range invented by the draft merely because both endpoints exist.
  const rangePattern = /(\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|million|thousand|bn|mm|[kmb]))?(?:\s*(?:usd|dollars?))?)(?:\s*(percentage\s+points?|percent(?:age)?|%|years?|months?|weeks?|days?|hours?|people|persons?|employees?|associates?|staff|users?|customers?|team\s+members?|members?))?\s*(?:-|\u2013|\u2014|\bto\b)\s*(\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|million|thousand|bn|mm|[kmb]))?(?:\s*(?:usd|dollars?))?)(?:\s*(percentage\s+points?|percent(?:age)?|%|years?|months?|weeks?|days?|hours?|people|persons?|employees?|associates?|staff|users?|customers?|team\s+members?|members?))?/gi;

  for (const match of Array.from(withoutIsoDatePrecision.matchAll(rangePattern))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const firstRaw = (match[1] ?? "").toLowerCase();
    const firstUnit = (match[2] ?? "").toLowerCase();
    const secondRaw = (match[3] ?? "").toLowerCase();
    const secondUnit = (match[4] ?? "").toLowerCase();
    const inheritedScale = magnitude(secondRaw) ?? magnitude(firstRaw);
    const first = scaledNumber(firstRaw, inheritedScale);
    const second = scaledNumber(secondRaw, inheritedScale);
    if (first === null || second === null) continue;

    const firstKind = rangeEndpointKind(firstRaw, firstUnit);
    const secondKind = rangeEndpointKind(secondRaw, secondUnit);
    const kind = firstKind === "number"
      ? secondKind
      : secondKind === "number" || firstKind === secondKind
        ? firstKind
        : `mixed:${firstKind}:${secondKind}`;
    let display = `${claimNumber(firstRaw)}-${claimNumber(secondRaw)}`;
    if (kind === "currency") {
      const suffix = inheritedScale?.suffix ?? "";
      display = `$${claimNumber(firstRaw)}${suffix}-$${claimNumber(secondRaw)}${suffix}`;
    } else if (kind === "percentage-point") {
      display = `${claimNumber(firstRaw)}-${claimNumber(secondRaw)} percentage points`;
    } else if (kind === "percent") {
      display = `${claimNumber(firstRaw)}-${claimNumber(secondRaw)}%`;
    } else if (kind === "magnitude" && inheritedScale) {
      display = `${claimNumber(firstRaw)}${inheritedScale.suffix}-${claimNumber(secondRaw)}${inheritedScale.suffix}`;
    }

    claims.push({ canonical: `range:${kind}:${first}:${second}`, display });
    consumed.push({ start, end });
  }

  for (const match of Array.from(withoutIsoDatePrecision.matchAll(NUMERIC_CLAIM_PATTERN))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, consumed)) continue;

    const raw = match[0].trim().toLowerCase().replace(/\s+/g, " ");
    const numberMatch = raw.match(/\d[\d,]*(?:\.\d+)?/);
    if (!numberMatch) continue;

    const base = compactNumber(numberMatch[0]);
    const scale = magnitude(raw);
    const scaled = scale ? String(Number(base) * scale.factor) : base;
    const isCurrency = /^\$/.test(raw) || /\b(?:usd|dollars?)\b/.test(raw);

    if (isCurrency) {
      claims.push({
        canonical: `currency:${scaled}`,
        display: `$${base}${scale?.suffix ?? ""}`,
      });
      continue;
    }
    if (/\bpercentage\s+points?\b/.test(raw)) {
      claims.push({ canonical: `percentage-point:${base}`, display: `${base} percentage points` });
      continue;
    }
    if (/%|\bpercent(?:age)?\b/.test(raw)) {
      claims.push({ canonical: `percent:${base}`, display: `${base}%` });
      continue;
    }

    const duration = raw.match(/\b(years?|months?|weeks?|days?|hours?)\b/);
    if (duration) {
      const unit = duration[1].replace(/s$/, "");
      claims.push({ canonical: `duration:${unit}:${base}`, display: base });
      continue;
    }
    if (/\b(?:people|persons?|employees?|associates?|staff|users?|customers?|team\s+members?|members?)\b/.test(raw)) {
      claims.push({ canonical: `headcount:${base}`, display: base });
      continue;
    }
    if (/\+$/.test(raw)) {
      claims.push({ canonical: `at-least:${base}`, display: `${base}+` });
      continue;
    }
    if (/x$/.test(raw)) {
      claims.push({ canonical: `multiple:${base}`, display: `${base}x` });
      continue;
    }
    if (scale) {
      claims.push({ canonical: `magnitude:${scaled}`, display: `${base}${scale.suffix}` });
      continue;
    }

    claims.push({ canonical: `number:${base}`, display: base });
  }

  return claims;
}

/**
 * Enforce the truthfulness guarantee: every numeric claim the draft makes must
 * trace to the user's answers. This is the deterministic core of the product's
 * differentiator. Fails CLOSED — if a number cannot be traced, the draft is not
 * grounded and must not be presented as verified.
 *
 * Numbers are the enforceable, high-precision gate (they are the #1 fabrication
 * in AI resumes). Employer/skill fabrication is constrained by the prompt and
 * belongs to the human review step; asserting a deterministic guarantee there
 * would be a heuristic we cannot stand behind.
 */
export function verifyQuickResumeGrounding(
  draft: QuickResumeDraft,
  answers: string
): GroundingResult {
  // Declared placeholders are missing-input requests, not resume claims. They
  // are counted below and cause the API to hold the draft until resolved.
  const claimText = draftToText({ ...draft, placeholdersForUser: [] });
  const draftClaims = numericClaims(stripPlaceholders(claimText));
  const answerClaims = new Set(numericClaims(answers).map((claim) => claim.canonical));
  const ungrounded = draftClaims
    .filter((claim) => !answerClaims.has(claim.canonical))
    .map((claim) => claim.display);

  const placeholderCount = countPlaceholders(draft);

  return {
    grounded: ungrounded.length === 0,
    ungroundedNumbers: Array.from(new Set(ungrounded)),
    placeholderCount,
  };
}
