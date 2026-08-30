// ---------------------------------------------------------------------------
// Normalizer Agent
//
// Transforms raw intake text into structured CareerMemory records
// that match the Prisma schema, then returns the canonical CareerMemory
// wire-format for the orchestrator to validate before transitioning state.
//
// Processing:
//  - Runs four block parsers in PARALLEL (header, experience, education, skills)
//  - Uses tier1 for each call
//  - Upserts the results into the CareerMemory table
//  - Returns canonical CareerMemory — orchestrator validates jobs.length > 0
// ---------------------------------------------------------------------------

import { route, AIRouterError } from "@/lib/ai/router";
import { db } from "@/lib/db/client";
import { persistResumeSourceProfile } from "@/lib/db/resume-source-profile";
import { fetchCareerMemoryFromDB } from "@/lib/db/mappers/career-memory.mapper";
import { mergeUserVouchedProfileFacts } from "@/lib/resume/profile-merge";
import { normalizeCandidateName } from "@/lib/resume/candidate-identity";
import {
  reconcileCertificationFacts,
  reconcileEducationFacts,
} from "@/lib/resume/source-fact-reconciliation";
import { reconcileExperienceEntries } from "@/lib/resume/experience-reconciliation";
import { placeConfirmedEvidence } from "@/lib/resume/evidence-placement";
import type { ConfirmedEvidence } from "@/lib/resume/evidence-draft";
import type {
  CareerMemory,
  WorkHistoryEntry,
  CareerMemoryBullet,
  EducationEntry,
  SkillEntry,
  CertificationEntry,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Internal LLM output shapes — private to this agent
// These are what the model produces; runNormalizer maps them to canonical types.
// ---------------------------------------------------------------------------

interface _LLMHeader {
  name: string | null;
  email: string;
  phone?: string | null;
  linkedin?: string | null;
  website?: string | null;
  github?: string | null;
  location?: string | null;
}

interface _LLMJob {
  company: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  current: boolean;
  location?: string | null;
  employmentType?: string | null;
  bullets: string[];
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableTrimmedString(value: unknown): string | null {
  const trimmed = trimmedString(value);
  return trimmed || null;
}

export function sanitizeHeaderOutput(value: unknown): _LLMHeader | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = normalizeCandidateName(record.name);
  const email = trimmedString(record.email);
  if (!name && !email) return null;
  return {
    name,
    email,
    phone: nullableTrimmedString(record.phone),
    linkedin: nullableTrimmedString(record.linkedin),
    website: nullableTrimmedString(record.website),
    github: nullableTrimmedString(record.github),
    location: nullableTrimmedString(record.location),
  };
}

export function sanitizeExperienceOutput(value: unknown): _LLMJob[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const company = trimmedString(record.company);
    const title = trimmedString(record.title);
    if (!company || !title) return [];

    const bullets = Array.isArray(record.bullets)
      ? record.bullets.map(trimmedString).filter(Boolean)
      : [];

    return [{
      company,
      title,
      startDate: trimmedString(record.startDate),
      endDate: nullableTrimmedString(record.endDate),
      current: record.current === true,
      location: nullableTrimmedString(record.location),
      employmentType: nullableTrimmedString(record.employmentType),
      bullets,
    }];
  });
}

function canonicalNumericToken(value: string): string {
  return value.toLowerCase().replace(/[\s,]/g, "");
}

function numericTokens(value: string): string[] {
  return (
    value.match(
      /\$?\d[\d,]*(?:\.\d+)?\s*(?:%|percent|percentage points?|\+|x|k|m|b|hours?|days?|people|users?|customers?|associates?|dollars?)?/gi
    ) ?? []
  ).map(canonicalNumericToken);
}

/**
 * A model-parsed bullet is not source evidence merely because the normalizer
 * returned it. Reject any parsed bullet whose numeric claims do not occur in
 * the uploaded resume before that bullet can be persisted as VERIFIED.
 */
export function retainSourceGroundedExperienceMetrics(
  entries: _LLMJob[],
  sourceText: string
): _LLMJob[] {
  const sourceTokens = new Set(numericTokens(sourceText));
  const sourceBareTokens = new Set(
    Array.from(sourceTokens, (token) => token.replace(/[^0-9.]/g, ""))
  );

  return entries.map((entry) => ({
    ...entry,
    bullets: entry.bullets.filter((bullet) =>
      numericTokens(bullet).every((token) =>
        sourceTokens.has(token) ||
        sourceBareTokens.has(token.replace(/[^0-9.]/g, ""))
      )
    ),
  }));
}

interface _LLMEducation {
  degree: string;
  school: string;
  graduationDate?: string | null;
  expected: boolean;
  gpa?: string | null;
}

export function sanitizeEducationOutput(value: unknown): _LLMEducation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];

    const record = entry as Record<string, unknown>;
    const degree = typeof record.degree === "string" ? record.degree.trim() : "";
    const school = typeof record.school === "string" ? record.school.trim() : "";
    if (!degree || !school) return [];

    const graduationDate =
      typeof record.graduationDate === "string" && record.graduationDate.trim()
        ? record.graduationDate.trim()
        : null;
    const gpa =
      typeof record.gpa === "string" && record.gpa.trim()
        ? record.gpa.trim()
        : null;

    return [{
      degree,
      school,
      graduationDate,
      expected: record.expected === true,
      gpa,
    }];
  });
}

interface _LLMSkill {
  name: string;
  qualifier?: string | null;
  category?: string | null;
}

export function sanitizeSkillsOutput(value: unknown): _LLMSkill[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const name = trimmedString(record.name);
    if (!name) return [];
    return [{
      name,
      qualifier: nullableTrimmedString(record.qualifier),
      category: nullableTrimmedString(record.category),
    }];
  });
}

const SKILL_SECTION_HEADING = /^(?:core|technical|professional)?\s*skills(?:\s*(?:and|&|\/)\s*(?:tools|technologies))?$/i;
const SKILL_PROSE_PREFIX = /^(?:built|created|developed|delivered|designed|implemented|improved|led|managed|maintained|owned|supported|used|worked)\b/i;
const SKILL_QUALIFIERS = [
  "some experience with",
  "working knowledge of",
  "familiar with",
  "exposure to",
  "beginner",
  "basic",
  "intermediate",
  "advanced",
  "proficient",
  "expert",
] as const;

function parseSkillCandidate(
  rawCandidate: string,
  category: string | null
): _LLMSkill | null {
  const candidate = rawCandidate
    .replace(/^[\s*\-\u2022]+/, "")
    .replace(/[.]+$/, "")
    .trim();
  if (
    !candidate ||
    candidate.length > 80 ||
    candidate.split(/\s+/).length > 8 ||
    SKILL_SECTION_HEADING.test(candidate) ||
    SKILL_PROSE_PREFIX.test(candidate) ||
    /[.!?]\s+\w/.test(candidate)
  ) {
    return null;
  }

  const lower = candidate.toLowerCase();
  const qualifier = SKILL_QUALIFIERS.find((value) =>
    lower.startsWith(`${value} `)
  ) ?? null;
  const name = qualifier ? candidate.slice(qualifier.length).trim() : candidate;
  if (!name || name.length > 60) return null;

  return { name, qualifier, category };
}

/**
 * Source-only safety net for a malformed or empty skills-parser response.
 * Intake has already isolated the resume's Skills block, so this parser only
 * accepts compact labels and delimiter-separated values. It never infers a
 * skill from experience prose and preserves explicit proficiency qualifiers.
 */
export function parseStructuredSkillsFallback(skillsText: string): _LLMSkill[] {
  const parsed: _LLMSkill[] = [];
  const seen = new Set<string>();

  for (const rawLine of skillsText.split(/\r?\n/)) {
    const line = rawLine.replace(/^[\s*\-\u2022]+/, "").trim();
    if (!line || SKILL_SECTION_HEADING.test(line)) continue;

    const colonIndex = line.indexOf(":");
    const hasCategory = colonIndex > 0 && colonIndex <= 50;
    const category = hasCategory ? line.slice(0, colonIndex).trim() : null;
    const valueText = hasCategory ? line.slice(colonIndex + 1).trim() : line;
    const hasListDelimiter = /[|;,\u2022]/.test(valueText);

    // Unlabelled prose is not a safe skills source. A compact standalone item
    // is accepted because some resumes place one tool per line in this block.
    if (!hasCategory && !hasListDelimiter && valueText.split(/\s+/).length > 4) {
      continue;
    }

    const values = hasListDelimiter
      ? valueText.split(/[|;,\u2022]/)
      : [valueText];
    for (const value of values) {
      const skill = parseSkillCandidate(value, category || null);
      if (!skill) continue;
      const key = skill.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push(skill);
    }
  }

  return parsed;
}

export function mergeParsedSkills(
  modelSkills: _LLMSkill[],
  sourceSkills: _LLMSkill[]
): _LLMSkill[] {
  const merged: _LLMSkill[] = [];
  const seen = new Set<string>();
  for (const skill of [...modelSkills, ...sourceSkills]) {
    const key = skill.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({
      name: skill.name.trim(),
      qualifier: skill.qualifier?.trim() || null,
      category: skill.category?.trim() || "Core Skills",
    });
  }
  return merged;
}

interface _LLMCertification {
  name: string;
  issuingBody?: string | null;
  year?: number | null;
}

export function sanitizeCertificationOutput(value: unknown): _LLMCertification[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const name = trimmedString(record.name);
    if (!name) return [];
    const numericYear = typeof record.year === "number" && Number.isInteger(record.year)
      ? record.year
      : null;
    return [{
      name,
      issuingBody: nullableTrimmedString(record.issuingBody),
      year: numericYear,
    }];
  });
}

// ---------------------------------------------------------------------------
// Block extraction helpers
// ---------------------------------------------------------------------------

function extractBlock(combinedText: string, blockName: string): string {
  const header = `=== ${blockName.toUpperCase()} BLOCK ===`;
  const startIdx = combinedText.indexOf(header);
  if (startIdx === -1) return "";
  const afterHeader = combinedText.slice(startIdx + header.length);
  const nextBlockIdx = afterHeader.indexOf("\n===");
  return (nextBlockIdx === -1 ? afterHeader : afterHeader.slice(0, nextBlockIdx)).trim();
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function parseDate(dateStr?: string | null): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const HEADER_SYSTEM = `You are a resume header parser. Extract the candidate's personal information.
Return valid JSON with keys: name (string), email (string), phone (string|null), linkedin (string|null),
website (string|null), github (string|null), location (string|null).
Output only raw JSON — no markdown, no extra text.`;

const EXPERIENCE_SYSTEM = `You are a resume experience parser. Extract all work history entries.
Return valid JSON array where each element has:
  company (string), title (string), startDate (ISO 8601 string, e.g. "2020-01"),
  endDate (ISO 8601 string | null), current (boolean),
  location (string | null), employmentType (string | null, e.g. "Full-Time" | "Contract"),
  bullets (string[])
Rules:
- Set current: true ONLY when the source explicitly says "Present", "Current", "Now", or equivalent.
- If the source gives an end year/date, current MUST be false and endDate MUST be populated.
- If no end date is visible, set current: false unless the source explicitly marks the role as current.
- Preserve dates exactly from the source resume. Do not infer, round, expand, or invent month/year ranges.
- If the source only gives years, return the year only (for example "2017" and "2024"). Never add month precision that is absent from the source.
- If a role has nested titles under one employer, preserve each nested title and its own date range when the source provides it.
- Preserve bullet text EXACTLY as written — do not paraphrase or edit
- Output only raw JSON — no markdown, no extra text.`;

const EDUCATION_SYSTEM = `You are a resume education parser. Extract all education entries.
Return valid JSON array where each element has:
  degree (string), school (string), graduationDate (ISO 8601 string | null),
  expected (boolean — true if graduation date is in the future or marked "expected"),
  gpa (string | null)
Output only raw JSON — no markdown, no extra text.`;

const SKILLS_SYSTEM = `You are a resume skills parser. Extract all skills, tools, and technologies.
Return valid JSON array where each element has:
  name (string),
  qualifier (string | null — preserve the EXACT qualifier the candidate used, e.g. "basic", "some experience", "proficient", "expert"),
  category (string | null — e.g. "Programming Languages", "Cloud Platforms", "Analytics")

CRITICAL QUALIFIER RULE: Copy the qualifier EXACTLY as the user wrote it.
  - "basic SQL" → { name: "SQL", qualifier: "basic" }
  - "some experience with Amplitude" → { name: "Amplitude", qualifier: "some experience" }
  - "Figma" with no qualifier → { name: "Figma", qualifier: null }
  NEVER invent, upgrade, or normalize qualifiers.
Output only raw JSON — no markdown, no extra text.`;

const CERTIFICATIONS_SYSTEM = `You are a resume certifications parser. Extract professional certifications, licenses, and credentials ONLY.
Do NOT extract academic degrees (Bachelor's, Master's, MBA, PhD, etc.) — those belong in education.
Return valid JSON array where each element has:
  name (string — full certification name, e.g. "AWS Certified Solutions Architect – Associate"),
  issuingBody (string | null — e.g. "Amazon Web Services", "Google", "PMI", "CompTIA"),
  year (number | null — the year issued or most recently renewed, e.g. 2022)

Rules:
- Include: AWS, GCP, Azure certs; PMP, Scrum Master, Six Sigma, Lean; CPA, CFA, SHRM; CompTIA; Salesforce; Google Analytics; industry licenses
- Exclude: degrees, diplomas, academic honors, coursework
- If you find no certifications, return an empty array []
Output only raw JSON — no markdown, no extra text.`;

// ---------------------------------------------------------------------------
// Per-block normalizers
// ---------------------------------------------------------------------------

async function normalizeHeader(headerText: string): Promise<_LLMHeader | null> {
  if (!headerText.trim()) return null;
  const result = await route({
    tier: "tier1", agent: "normalizer",
    systemPrompt: HEADER_SYSTEM,
    messages: [{ role: "user", content: headerText }],
    maxTokens: 512,
  });
  return sanitizeHeaderOutput(JSON.parse(stripFences(result.content)));
}

async function normalizeExperience(experienceText: string): Promise<_LLMJob[]> {
  if (!experienceText.trim()) return [];
  const result = await route({
    tier: "tier1", agent: "normalizer",
    systemPrompt: EXPERIENCE_SYSTEM,
    messages: [{ role: "user", content: experienceText }],
    maxTokens: 4096,
  });
  const parsed: unknown = JSON.parse(stripFences(result.content));
  return sanitizeExperienceOutput(parsed);
}

async function normalizeEducation(educationText: string): Promise<_LLMEducation[]> {
  if (!educationText.trim()) return [];
  const result = await route({
    tier: "tier1", agent: "normalizer",
    systemPrompt: EDUCATION_SYSTEM,
    messages: [{ role: "user", content: educationText }],
    maxTokens: 1024,
  });
  const parsed: unknown = JSON.parse(stripFences(result.content));
  const sanitized = sanitizeEducationOutput(parsed);
  const receivedCount = Array.isArray(parsed) ? parsed.length : 0;
  if (!Array.isArray(parsed) || sanitized.length !== receivedCount) {
    console.warn(JSON.stringify({
      event: "normalizer_education_entries_discarded",
      receivedCount,
      acceptedCount: sanitized.length,
      timestamp: new Date().toISOString(),
    }));
  }
  return sanitized;
}

async function normalizeSkills(skillsText: string): Promise<_LLMSkill[]> {
  if (!skillsText.trim()) return [];
  const result = await route({
    tier: "tier1", agent: "normalizer",
    systemPrompt: SKILLS_SYSTEM,
    messages: [{ role: "user", content: skillsText }],
    maxTokens: 1024,
  });
  return sanitizeSkillsOutput(JSON.parse(stripFences(result.content)));
}

async function normalizeCertifications(certText: string): Promise<_LLMCertification[]> {
  if (!certText.trim()) return [];
  const result = await route({
    tier: "tier1", agent: "normalizer",
    systemPrompt: CERTIFICATIONS_SYSTEM,
    messages: [{ role: "user", content: certText }],
    maxTokens: 512,
  });
  return sanitizeCertificationOutput(JSON.parse(stripFences(result.content)));
}

// ---------------------------------------------------------------------------
// runNormalizer — public entry point
// ---------------------------------------------------------------------------

/**
 * Normalize raw intake text into CareerMemory records stored in the DB.
 *
 * Returns the canonical CareerMemory wire format.
 * The orchestrator MUST validate that jobs.length > 0 before transitioning.
 * An empty jobs array means the parser failed silently — this must not proceed.
 *
 * @param rawText  - Combined block text from the intake agent
 * @param userId   - The user who owns this CareerMemory
 * @returns        Canonical CareerMemory (from lib/types)
 */
export async function runNormalizer(
  rawText: string,
  userId: string,
  resumeId?: string,
  userEvidence: ConfirmedEvidence[] = []
): Promise<CareerMemory> {
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({
    event: "normalizer_start", userId,
    rawTextLength: rawText.length, timestamp: startedAt,
  }));

  // Extract blocks. Uploaded files pass through intake first, which creates
  // labelled blocks. Pasted resumes can arrive as plain resume text, so fall
  // back to the full source for each parser instead of silently returning no
  // work history.
  const extractedHeader     = extractBlock(rawText, "HEADER");
  const extractedExperience = extractBlock(rawText, "EXPERIENCE");
  const extractedEducation  = extractBlock(rawText, "EDUCATION");
  const extractedSkills     = extractBlock(rawText, "SKILLS");
  const hasStructuredBlocks = Boolean(
    extractedHeader || extractedExperience || extractedEducation || extractedSkills
  );

  const headerText     = hasStructuredBlocks ? extractedHeader : rawText;
  const experienceText = hasStructuredBlocks ? extractedExperience : rawText;
  const educationText  = hasStructuredBlocks ? extractedEducation : rawText;
  const skillsText     = hasStructuredBlocks ? extractedSkills : rawText;
  // Certifications live in the EDUCATION block per intake design (no separate block).
  // If no structured blocks, fall back to full text so we still catch certs in plain-text resumes.
  const certText       = hasStructuredBlocks ? extractedEducation : rawText;

  if (!hasStructuredBlocks) {
    console.log(JSON.stringify({
      event: "normalizer_plain_text_fallback",
      userId,
      rawTextLength: rawText.length,
      timestamp: new Date().toISOString(),
    }));
  }

  // Run all five parsers in parallel; failed blocks degrade gracefully
  const [header, jobs, eduEntries, skills, certEntries] = await Promise.all([
    normalizeHeader(headerText).catch((e) => {
      console.log(JSON.stringify({ event: "normalizer_header_fail", error: String(e) }));
      return null;
    }),
    normalizeExperience(experienceText).catch((e) => {
      // AIRouterError = all AI providers failed (e.g. missing API key, billing).
      // Re-throw so the orchestrator surfaces the real root cause instead of
      // reporting "no work experience found" (which would be misleading).
      if (e instanceof AIRouterError) throw e;
      console.log(JSON.stringify({ event: "normalizer_experience_fail", error: String(e) }));
      return [] as _LLMJob[];
    }),
    normalizeEducation(educationText).catch((e) => {
      console.log(JSON.stringify({ event: "normalizer_education_fail", error: String(e) }));
      return [] as _LLMEducation[];
    }),
    normalizeSkills(skillsText).catch((e) => {
      console.log(JSON.stringify({ event: "normalizer_skills_fail", error: String(e) }));
      return [] as _LLMSkill[];
    }),
    normalizeCertifications(certText).catch((e) => {
      console.log(JSON.stringify({ event: "normalizer_certifications_fail", error: String(e) }));
      return [] as _LLMCertification[];
    }),
  ]);

  const sourceSkills = parseStructuredSkillsFallback(skillsText);
  const effectiveSkills = mergeParsedSkills(skills, sourceSkills);
  if (sourceSkills.some((sourceSkill) =>
    !skills.some((modelSkill) => modelSkill.name.toLowerCase() === sourceSkill.name.toLowerCase())
  )) {
    console.warn(JSON.stringify({
      event: "normalizer_skills_source_reconciled",
      acceptedCount: effectiveSkills.length,
      timestamp: new Date().toISOString(),
    }));
  }

  const reconciledEducation = reconcileEducationFacts(eduEntries ?? [], educationText);
  const reconciledCertifications = reconcileCertificationFacts(certEntries ?? [], certText);

  const reconciledJobs = retainSourceGroundedExperienceMetrics(
    reconcileExperienceEntries(jobs ?? [], experienceText),
    experienceText
  );
  const evidencePlacement = placeConfirmedEvidence(reconciledJobs, userEvidence);
  const jobsWithEvidence = evidencePlacement.jobs;
  if (evidencePlacement.unmatched.length > 0) {
    console.warn(JSON.stringify({
      event: "normalizer_evidence_unmatched",
      resumeId: resumeId ?? null,
      terms: evidencePlacement.unmatched.map((item) => item.term),
      reason: "source_did_not_match_one_unique_work_entry",
      timestamp: new Date().toISOString(),
    }));
  }

  if (resumeId && header) {
    await persistResumeHeader(resumeId, header);
  }

  // Upsert CareerMemory root record
  const careerMemory = await db.careerMemory.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const cmId = careerMemory.id;

  // ------------------------------------------------------------------
  // Merge into durable Career Memory.
  // Existing records are never deleted here: prior resumes and manual facts
  // remain reusable. Each section deduplicates before adding new evidence.
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Persist work history + bullets
  // ------------------------------------------------------------------
  const writtenJobs: WorkHistoryEntry[] = [];

  for (let i = 0; i < jobsWithEvidence.length; i++) {
    const job = jobsWithEvidence[i];
    const startDate = parseDate(job.startDate) ?? new Date();
    const endDate   = parseDate(job.endDate ?? undefined);
    const current = endDate ? false : Boolean(job.current);

    const matchingJobs = await db.workHistory.findMany({
      where: {
        careerMemoryId: cmId,
        company: { equals: job.company, mode: "insensitive" },
        title: { equals: job.title, mode: "insensitive" },
      },
      include: { bullets: true },
    });
    const existingJob = matchingJobs.find(
      (entry) => entry.startDate.getUTCFullYear() === startDate.getUTCFullYear()
    ) ?? (matchingJobs.length === 1 ? matchingJobs[0] : null);

    const wh = existingJob
      ? existingJob.locked
        ? existingJob
        : await db.workHistory.update({
            where: { id: existingJob.id },
            data: {
              endDate: endDate ?? existingJob.endDate,
              current,
              location: job.location ?? existingJob.location,
              employmentType: job.employmentType ?? existingJob.employmentType,
              sortOrder: Math.min(existingJob.sortOrder, i),
            },
          })
      : await db.workHistory.create({
          data: {
            careerMemoryId: cmId,
            company: job.company,
            title: job.title,
            startDate,
            endDate: endDate ?? null,
            current,
            location: job.location ?? null,
            employmentType: job.employmentType ?? null,
            sourceType: "UPLOADED",
            verified: false,
            locked: false,
            sortOrder: i,
          },
        });

    const existingBulletContent = new Set(
      (existingJob?.bullets ?? []).map((bullet) => bullet.content.trim().toLowerCase())
    );
    for (const bulletContent of job.bullets) {
      const normalizedBullet = bulletContent.trim().toLowerCase();
      if (!normalizedBullet || existingBulletContent.has(normalizedBullet)) continue;
      const sourceMetrics = bulletContent.match(/\d+(?:[.,]\d+)*[%$kKmMbBxX+]?/g) ?? [];
      await db.bullet.create({
        data: {
          workHistoryId: wh.id,
          content: bulletContent,
          contentType: evidencePlacement.evidenceBulletKeys.has(normalizedBullet)
            ? "USER_EDITED"
            : "VERIFIED",
          metrics: sourceMetrics,
          keywords: [],
          locked: false,
        },
      });
      existingBulletContent.add(normalizedBullet);
    }

    const mergedBullets = await db.bullet.findMany({
      where: { workHistoryId: wh.id },
      orderBy: { id: "asc" },
    });
    const sourceBulletContent = new Set(
      job.bullets.map((bullet) => bullet.trim().toLowerCase())
    );
    const writtenBullets: CareerMemoryBullet[] = mergedBullets
      .filter((bullet) =>
        bullet.contentType !== "GENERATED" &&
        sourceBulletContent.has(bullet.content.trim().toLowerCase())
      )
      .map((bullet) => ({
      id: bullet.id,
      content: bullet.content,
      contentType: bullet.contentType,
      metrics: bullet.metrics,
      keywords: bullet.keywords,
      locked: bullet.locked,
      usedInResumeCount: 0,
      }));

    writtenJobs.push({
      id:             wh.id,
      company:        wh.company,
      title:          wh.title,
      startDate:      wh.startDate.toISOString(),
      endDate:        wh.endDate ? wh.endDate.toISOString() : null,
      current:         wh.current,
      location:        wh.location,
      employmentType:  wh.employmentType,
      bullets:        writtenBullets,
      sourceType:     wh.sourceType,
      verified:       wh.verified,
      locked:         wh.locked,
      sortOrder:      i,
    });
  }

  // ------------------------------------------------------------------
  // Persist education
  // ------------------------------------------------------------------
  const writtenEdu: EducationEntry[] = [];

  for (const edu of reconciledEducation) {
    const gradDate = parseDate(edu.graduationDate ?? undefined);
    const existingEducation = await db.education.findFirst({
      where: {
        careerMemoryId: cmId,
        degree: { equals: edu.degree, mode: "insensitive" },
        school: { equals: edu.school, mode: "insensitive" },
      },
    });
    const e = existingEducation ?? await db.education.create({
      data: {
        careerMemoryId: cmId,
        degree: edu.degree,
        school: edu.school,
        graduationDate: gradDate ?? null,
        expected: edu.expected,
        gpa: edu.gpa ?? null,
        sourceType: "UPLOADED",
      },
    });
    writtenEdu.push({
      id:             e.id,
      degree:         edu.degree,
      institution:    edu.school,
      graduationDate: gradDate ? gradDate.toISOString() : null,
      expectedDate:   edu.expected && !gradDate ? null : null,
      inProgress:     edu.expected,
      gpa:            edu.gpa ?? null,
      location:       null,
      verified:       false,
    });
  }

  // ------------------------------------------------------------------
  // Persist skills (qualifier preserved exactly as written)
  // ------------------------------------------------------------------
  const writtenSkills: SkillEntry[] = [];

  for (const skill of effectiveSkills) {
    const existingSkill = await db.skill.findFirst({
      where: {
        careerMemoryId: cmId,
        name: { equals: skill.name, mode: "insensitive" },
      },
    });
    const s = existingSkill ?? await db.skill.create({
      data: {
        careerMemoryId: cmId,
        name: skill.name,
        qualifier: skill.qualifier ?? null,
        category: skill.category ?? null,
        sourceType: "UPLOADED",
      },
    });
    writtenSkills.push({
      id:               s.id,
      name:             skill.name,
      category:         skill.category ?? null,
      proficiencyLabel: skill.qualifier ?? null,
      verified:         false,
    });
  }

  // ------------------------------------------------------------------
  // Persist certifications (extracted from education block alongside degrees)
  // ------------------------------------------------------------------
  const writtenCerts: CertificationEntry[] = [];

  for (const cert of reconciledCertifications) {
    if (!cert.name?.trim()) continue; // skip empty/malformed entries
    const existingCertification = await db.certification.findFirst({
      where: {
        careerMemoryId: cmId,
        name: { equals: cert.name.trim(), mode: "insensitive" },
      },
    });
    const c = existingCertification ?? await db.certification.create({
      data: {
        careerMemoryId: cmId,
        name: cert.name.trim(),
        issuer: cert.issuingBody ?? null,
        year: cert.year ?? null,
        sourceType: "UPLOADED",
      },
    });
    writtenCerts.push({
      id:            c.id,
      name:          cert.name.trim(),
      issuingBody:   cert.issuingBody ?? null,
      issueDate:     cert.year ? `${cert.year}-01-01` : null,
      expiryDate:    null,
      credentialId:  null,
      verified:      false,
    });
  }

  const now = new Date().toISOString();

  console.log(JSON.stringify({
    event:                 "normalizer_complete",
    userId,
    careerMemoryId:        cmId,
    jobsWritten:           writtenJobs.length,
    educationWritten:      writtenEdu.length,
    skillsWritten:         writtenSkills.length,
    certificationsWritten: writtenCerts.length,
    headerFound:           header !== null,
    timestamp:             now,
  }));

  const documentProfile: CareerMemory = {
    id: cmId,
    userId,
    version: 1,
    jobs: writtenJobs,
    education: writtenEdu,
    skills: writtenSkills,
    certifications: writtenCerts,
    projects: [],
    achievements: [],
    createdAt: now,
    updatedAt: now,
  };

  // Merge in the user's vouched Career Profile facts (verified/locked jobs,
  // MANUAL education/skills/certs/projects) so memory reaches every new draft.
  // On any failure fall back to the document-scoped snapshot — the merge is
  // strictly additive and must never block generation.
  let sourceProfile = documentProfile;
  try {
    const fullMemory = await fetchCareerMemoryFromDB(userId);
    if (fullMemory) {
      sourceProfile = mergeUserVouchedProfileFacts(documentProfile, fullMemory);
    }
  } catch (mergeError) {
    console.warn(JSON.stringify({
      event: "normalizer_profile_merge_skipped",
      userId,
      reason: mergeError instanceof Error ? mergeError.message : "unknown",
    }));
  }

  if (resumeId) {
    await persistResumeSourceProfile(resumeId, sourceProfile);
  }
  return sourceProfile;
}

async function persistResumeHeader(resumeId: string, header: _LLMHeader): Promise<void> {
  const cleanHeader = {
    name: header.name?.trim() || null,
    email: header.email?.trim() || null,
    phone: header.phone?.trim() || null,
    linkedin: header.linkedin?.trim() || null,
    website: header.website?.trim() || null,
    github: header.github?.trim() || null,
    location: header.location?.trim() || null,
  };

  if (!Object.values(cleanHeader).some(Boolean)) return;

  await db.$transaction([
    db.resumeSection.deleteMany({
      where: { resumeId, name: "resume_header" },
    }),
    db.resumeSection.create({
      data: {
        resumeId,
        name: "resume_header",
        visible: false,
        sortOrder: -10,
        content: JSON.stringify(cleanHeader),
      },
    }),
  ]);
}
