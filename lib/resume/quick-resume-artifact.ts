import { randomUUID } from "crypto";
import { z } from "zod";
import type { QuickResumeModelDraft } from "./quick-resume-contract";
import { MAX_EDITOR_BULLET_LENGTH } from "./editor-patch";
import { normalizeEmployerEvidence } from "./employer-evidence";

// Keep the persisted section name stable while the JSON payload evolves by version.
export const QUICK_RESUME_ARTIFACT_SECTION = "quick_resume_draft_v1";
export const QUICK_RESUME_ENGINE = "quick_resume_v1";

export function quickResumeStrategyMarker() {
  return { engine: QUICK_RESUME_ENGINE, artifactVersion: 3 } as const;
}

export function isQuickResumeStrategy(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return marker.engine === QUICK_RESUME_ENGINE &&
    (marker.artifactVersion === 2 || marker.artifactVersion === 3);
}

const text = (maximum: number) => z.string().trim().max(maximum);
const requiredText = (maximum: number) => text(maximum).min(2);
const contentTypeSchema = z.enum(["GENERATED", "USER_EDITED"]);

const legacyBulletSchema = z.object({
  id: requiredText(100),
  content: requiredText(360),
}).strict();

const artifactBulletSchema = z.object({
  id: requiredText(100),
  content: requiredText(MAX_EDITOR_BULLET_LENGTH),
  contentType: contentTypeSchema,
}).strict();

const legacyJobSchema = z.object({
  id: requiredText(100),
  title: requiredText(120),
  company: text(160),
  location: text(120),
  dateLabel: text(80),
  bullets: z.array(legacyBulletSchema).min(1).max(5),
}).strict();

const artifactJobSchema = z.object({
  id: requiredText(100),
  title: requiredText(120),
  company: text(160),
  location: text(120),
  dateLabel: text(80),
  bullets: z.array(artifactBulletSchema).min(1).max(5),
}).strict();

const educationSchema = z.object({
  id: requiredText(100),
  degree: requiredText(160),
  institution: requiredText(160),
  dateLabel: text(80),
  details: text(240),
}).strict();

const certificationSchema = z.object({
  id: requiredText(100),
  name: requiredText(160),
  issuer: text(160),
  dateLabel: text(80),
}).strict();

const projectSchema = z.object({
  id: requiredText(100),
  name: requiredText(160),
  description: requiredText(800),
  technologies: z.array(requiredText(80)).max(12),
  url: text(300),
}).strict();

type ArtifactWithIds = {
  jobs: Array<{ id: string; bullets: Array<{ id: string }> }>;
  projects?: Array<{ id: string }>;
  education: Array<{ id: string }>;
  certifications: Array<{ id: string }>;
};

function requireUniqueIds(artifact: ArtifactWithIds, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  const ids = [
    ...artifact.jobs.flatMap((job) => [job.id, ...job.bullets.map((bullet) => bullet.id)]),
    ...(artifact.projects ?? []).map((project) => project.id),
    ...artifact.education.map((entry) => entry.id),
    ...artifact.certifications.map((entry) => entry.id),
  ];

  for (const id of ids) {
    if (seen.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quick Resume artifact IDs must be unique.",
      });
      return;
    }
    seen.add(id);
  }
}

const legacyArtifactSchema = z.object({
  version: z.literal(1),
  coreSkills: z.array(requiredText(80)).min(3).max(18),
  jobs: z.array(legacyJobSchema).min(1).max(6),
  education: z.array(educationSchema).max(6),
  certifications: z.array(certificationSchema).max(10),
}).strict().superRefine(requireUniqueIds);

const legacyV2ArtifactSchema = z.object({
  version: z.literal(2),
  revision: z.number().int().positive(),
  targetTitle: requiredText(120),
  honestStretchNote: text(500),
  coreSkills: z.array(requiredText(80)).min(3).max(18),
  jobs: z.array(artifactJobSchema).min(1).max(6),
  education: z.array(educationSchema).max(6),
  certifications: z.array(certificationSchema).max(10),
}).strict().superRefine(requireUniqueIds);

const artifactSchema = z.object({
  version: z.literal(3),
  revision: z.number().int().positive(),
  targetTitle: requiredText(120),
  honestStretchNote: text(500),
  coreSkills: z.array(requiredText(80)).min(3).max(18),
  jobs: z.array(artifactJobSchema).max(6),
  projects: z.array(projectSchema).max(6),
  education: z.array(educationSchema).max(6),
  certifications: z.array(certificationSchema).max(10),
}).strict().superRefine((artifact, context) => {
  requireUniqueIds(artifact, context);
  if (artifact.jobs.length === 0 && artifact.projects.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Quick Resume artifacts require experience or project evidence.",
    });
  }
});

export type QuickResumeArtifact = z.infer<typeof artifactSchema>;

function sanitizeArtifactEmployers(artifact: QuickResumeArtifact): QuickResumeArtifact {
  return {
    ...artifact,
    jobs: artifact.jobs.map((job) => ({
      ...job,
      company: normalizeEmployerEvidence(job.company),
    })),
  };
}

export function buildQuickResumeArtifact(
  draft: QuickResumeModelDraft,
  createId: () => string = randomUUID
): QuickResumeArtifact {
  return artifactSchema.parse({
    version: 3,
    revision: 1,
    targetTitle: draft.targetTitle,
    honestStretchNote: draft.honestStretchNote,
    coreSkills: draft.coreSkills,
    jobs: draft.experience.map((job) => ({
      id: createId(),
      title: job.title,
      company: normalizeEmployerEvidence(job.company),
      location: job.location,
      dateLabel: job.dateLabel,
      bullets: job.bullets.map((content) => ({
        id: createId(),
        content,
        contentType: "GENERATED",
      })),
    })),
    projects: draft.projects.map((project) => ({
      id: createId(),
      ...project,
    })),
    education: draft.education.map((entry) => ({ id: createId(), ...entry })),
    certifications: draft.certifications.map((entry) => ({ id: createId(), ...entry })),
  });
}

export function parseQuickResumeArtifact(
  content: string | null | undefined,
  targetTitleFallback?: string
): QuickResumeArtifact | null {
  if (!content) return null;

  try {
    const value: unknown = JSON.parse(content);
    const current = artifactSchema.safeParse(value);
    if (current.success) return sanitizeArtifactEmployers(current.data);

    const legacyV2 = legacyV2ArtifactSchema.safeParse(value);
    if (legacyV2.success) {
      const migrated = artifactSchema.safeParse({
        ...legacyV2.data,
        version: 3,
        projects: [],
      });
      return migrated.success ? sanitizeArtifactEmployers(migrated.data) : null;
    }

    const legacy = legacyArtifactSchema.safeParse(value);
    const targetTitle = targetTitleFallback?.trim();
    if (!legacy.success || !targetTitle) return null;

    const migrated = artifactSchema.safeParse({
      ...legacy.data,
      version: 3,
      revision: 1,
      targetTitle,
      honestStretchNote: "",
      projects: [],
      jobs: legacy.data.jobs.map((job) => ({
        ...job,
        bullets: job.bullets.map((bullet) => ({
          ...bullet,
          contentType: "GENERATED",
        })),
      })),
    });
    return migrated.success ? sanitizeArtifactEmployers(migrated.data) : null;
  } catch {
    return null;
  }
}

export function updateQuickResumeArtifactBullet(
  artifact: QuickResumeArtifact,
  bulletId: string,
  content: string,
  expectedRevision: number
): QuickResumeArtifact {
  const current = artifactSchema.parse(artifact);
  if (current.revision !== expectedRevision) {
    throw new Error("Quick Resume artifact revision conflict.");
  }

  let found = false;
  const updated = {
    ...current,
    revision: current.revision + 1,
    jobs: current.jobs.map((job) => ({
      ...job,
      bullets: job.bullets.map((bullet) => {
        if (bullet.id !== bulletId) return bullet;
        found = true;
        return { ...bullet, content, contentType: "USER_EDITED" as const };
      }),
    })),
  };

  if (!found) throw new Error("Quick Resume bullet not found.");
  return artifactSchema.parse(updated);
}
