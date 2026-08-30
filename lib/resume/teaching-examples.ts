import { db } from "@/lib/db/client";

export const TEACHING_EXAMPLE_SECTION = "teaching_example_v1";
export const TEACHING_EXAMPLE_SCHEMA_VERSION = 1;

export interface TeachingExampleJob {
  title: string;
  company: string;
  bullets: string[];
}

export interface TeachingExamplePayload {
  schemaVersion: 1;
  resumeId: string;
  userId: string;
  approvedAt: string;
  targetRole: string;
  targetCompany: string | null;
  jdText: string;
  jobKeywords: string[];
  sourceSnapshot: unknown;
  finalResume: {
    summary: string | null;
    experience: TeachingExampleJob[];
    skills: Array<{ name: string; category: string | null }>;
    education: Array<{ degree: string; institution: string }>;
    certifications: string[];
  };
  engine: {
    resumeVersion: number;
    state: string;
  };
}

export interface RankedTeachingExample {
  example: TeachingExamplePayload;
  score: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function stringArray(value: unknown, limit = 80): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function parseTeachingExample(content: string | null | undefined): TeachingExamplePayload | null {
  if (!content) return null;
  try {
    const parsed = record(JSON.parse(content));
    const finalResume = record(parsed?.finalResume);
    const engine = record(parsed?.engine);
    if (
      parsed?.schemaVersion !== TEACHING_EXAMPLE_SCHEMA_VERSION ||
      !text(parsed.resumeId) ||
      !text(parsed.userId) ||
      !text(parsed.approvedAt) ||
      !text(parsed.targetRole) ||
      !text(parsed.jdText) ||
      !finalResume ||
      !engine
    ) return null;

    const experience = Array.isArray(finalResume.experience)
      ? finalResume.experience.map(record).filter((job): job is Record<string, unknown> => Boolean(job)).map((job) => ({
          title: text(job.title),
          company: text(job.company),
          bullets: stringArray(job.bullets, 8),
        })).filter((job) => job.title && job.company && job.bullets.length > 0).slice(0, 8)
      : [];
    const skills = Array.isArray(finalResume.skills)
      ? finalResume.skills.map(record).filter((skill): skill is Record<string, unknown> => Boolean(skill)).map((skill) => ({
          name: text(skill.name),
          category: nullableText(skill.category),
        })).filter((skill) => skill.name).slice(0, 60)
      : [];
    const education = Array.isArray(finalResume.education)
      ? finalResume.education.map(record).filter((entry): entry is Record<string, unknown> => Boolean(entry)).map((entry) => ({
          degree: text(entry.degree),
          institution: text(entry.institution),
        })).filter((entry) => entry.degree && entry.institution).slice(0, 12)
      : [];

    return {
      schemaVersion: 1,
      resumeId: text(parsed.resumeId),
      userId: text(parsed.userId),
      approvedAt: text(parsed.approvedAt),
      targetRole: text(parsed.targetRole),
      targetCompany: nullableText(parsed.targetCompany),
      jdText: text(parsed.jdText),
      jobKeywords: stringArray(parsed.jobKeywords),
      sourceSnapshot: parsed.sourceSnapshot ?? null,
      finalResume: {
        summary: nullableText(finalResume.summary),
        experience,
        skills,
        education,
        certifications: stringArray(finalResume.certifications, 30),
      },
      engine: {
        resumeVersion: typeof engine.resumeVersion === "number" ? engine.resumeVersion : 1,
        state: text(engine.state),
      },
    };
  } catch {
    return null;
  }
}

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "into", "this", "that", "job", "role",
  "senior", "junior", "lead", "manager", "specialist", "associate", "full", "time",
]);

export function tokenizeTeachingTarget(targetRole: string, keywords: string[]): Set<string> {
  return new Set(
    `${targetRole} ${keywords.join(" ")}`
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  );
}

export function rankTeachingExamples(
  examples: TeachingExamplePayload[],
  targetRole: string,
  jobKeywords: string[],
  limit = 2
): RankedTeachingExample[] {
  const targetTokens = tokenizeTeachingTarget(targetRole, jobKeywords);
  if (targetTokens.size === 0) return [];

  return examples
    .map((example) => {
      const exampleTokens = tokenizeTeachingTarget(example.targetRole, example.jobKeywords);
      const overlap = Array.from(targetTokens).filter((token) => exampleTokens.has(token)).length;
      const union = new Set(Array.from(targetTokens).concat(Array.from(exampleTokens))).size;
      const roleExact = example.targetRole.localeCompare(targetRole, undefined, { sensitivity: "base" }) === 0;
      const score = Math.min(1, (union ? overlap / union : 0) + (roleExact ? 0.35 : 0));
      return { example, score };
    })
    .filter((item) => item.score >= 0.12)
    .sort((a, b) => b.score - a.score || b.example.approvedAt.localeCompare(a.example.approvedAt))
    .slice(0, Math.max(0, Math.min(limit, 2)));
}

export function formatTeachingContext(ranked: RankedTeachingExample[]): string {
  if (ranked.length === 0) return "";
  const examples = ranked.map(({ example }, index) => {
    const jobs = example.finalResume.experience.map((job) => [
      `${job.title} at ${job.company}`,
      ...job.bullets.map((bullet) => `- ${bullet}`),
    ].join("\n")).join("\n");
    return [
      `APPROVED EXAMPLE ${index + 1}: ${example.targetRole}${example.targetCompany ? ` at ${example.targetCompany}` : ""}`,
      example.finalResume.summary ? `Approved summary:\n${example.finalResume.summary}` : "",
      jobs ? `Approved experience style:\n${jobs}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `
PERSONAL STYLE REFERENCES FROM THIS USER'S APPROVED RESUMES:
Use these examples only to learn cadence, density, section emphasis, and phrasing preferences.
They are NOT evidence for this resume. Never copy a fact, metric, skill, title, employer, or date
unless it is independently present in the current source evidence supplied elsewhere in this prompt.

${examples}
`.trim();
}

export async function loadTeachingContext(
  userId: string,
  targetRole: string,
  jobKeywords: string[],
  excludeResumeId?: string
): Promise<string> {
  try {
    const resumes = await db.resume.findMany({
      where: {
        userId,
        ...(excludeResumeId ? { id: { not: excludeResumeId } } : {}),
        sections: { some: { name: TEACHING_EXAMPLE_SECTION } },
      },
      select: {
        sections: {
          where: { name: TEACHING_EXAMPLE_SECTION },
          select: { content: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    });

    const examples = resumes
      .map((resume) => parseTeachingExample(resume.sections[0]?.content))
      .filter((example): example is TeachingExamplePayload => Boolean(example && example.userId === userId));
    return formatTeachingContext(rankTeachingExamples(examples, targetRole, jobKeywords));
  } catch (error) {
    console.warn(JSON.stringify({
      event: "teaching_context_unavailable",
      resumeId: excludeResumeId ?? null,
      error: error instanceof Error ? error.message : "unknown error",
    }));
    return "";
  }
}
