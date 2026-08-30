import type { CareerMemory } from "@/lib/types";
import { z } from "zod";
import { normalizeCandidateName } from "@/lib/resume/candidate-identity";

export type SavedSourceHeader = {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  website: string | null;
  location: string | null;
};

const EMPTY_HEADER: SavedSourceHeader = {
  name: null,
  email: null,
  phone: null,
  linkedin: null,
  website: null,
  location: null,
};

const nonEmptyText = z.string().trim().min(1);
const nullableText = z.string().nullable();

const careerMemoryBulletSchema = z.object({
  id: nonEmptyText,
  content: nonEmptyText,
  contentType: z.enum(["VERIFIED", "GENERATED", "USER_EDITED"]),
  metrics: z.array(z.string()),
  keywords: z.array(z.string()),
  locked: z.boolean(),
  usedInResumeCount: z.number().int().nonnegative(),
});

const workHistorySchema = z.object({
  id: nonEmptyText,
  company: nonEmptyText,
  title: nonEmptyText,
  startDate: z.string(),
  endDate: nullableText,
  current: z.boolean(),
  location: nullableText,
  employmentType: nullableText,
  bullets: z.array(careerMemoryBulletSchema),
  sourceType: z.enum(["UPLOADED", "MANUAL", "GENERATED"]),
  verified: z.boolean(),
  locked: z.boolean(),
  sortOrder: z.number().int(),
});

const educationSchema = z.object({
  id: nonEmptyText,
  degree: nonEmptyText,
  institution: nonEmptyText,
  graduationDate: nullableText,
  expectedDate: nullableText,
  inProgress: z.boolean(),
  gpa: nullableText,
  location: nullableText,
  verified: z.boolean(),
});

const skillSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
  category: nullableText,
  proficiencyLabel: nullableText,
  verified: z.boolean(),
});

const certificationSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
  issuingBody: nullableText,
  issueDate: nullableText,
  expiryDate: nullableText,
  credentialId: nullableText,
  verified: z.boolean(),
});

const projectSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
  description: z.string(),
  technologies: z.array(z.string()),
  url: nullableText,
  startDate: nullableText,
  endDate: nullableText,
  verified: z.boolean(),
});

const achievementSchema = z.object({
  id: nonEmptyText,
  title: nonEmptyText,
  description: z.string(),
  date: nullableText,
  verified: z.boolean(),
});

const careerMemorySchema = z.object({
  id: nonEmptyText,
  userId: nonEmptyText,
  version: z.number().int().nonnegative(),
  jobs: z.array(workHistorySchema),
  education: z.array(educationSchema),
  skills: z.array(skillSchema),
  certifications: z.array(certificationSchema),
  projects: z.array(projectSchema),
  achievements: z.array(achievementSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function parseCareerMemorySnapshot(
  content: string | null | undefined
): CareerMemory | null {
  if (!content) return null;

  try {
    const parsed = careerMemorySchema.safeParse(JSON.parse(content));
    return parsed.success ? (parsed.data as CareerMemory) : null;
  } catch {
    return null;
  }
}
export function parseSavedSourceHeader(
  content: string | null | undefined
): SavedSourceHeader {
  if (!content) return EMPTY_HEADER;

  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    return {
      name: normalizeCandidateName(value.name),
      email: readString(value.email),
      phone: readString(value.phone),
      linkedin: readString(value.linkedin),
      website: readString(value.website),
      location: readString(value.location),
    };
  } catch {
    return EMPTY_HEADER;
  }
}

export function formatCareerMemoryAsResumeText(
  profile: CareerMemory,
  header: SavedSourceHeader = EMPTY_HEADER
): string {
  const lines: string[] = [];
  if (header.name) lines.push(header.name);

  const contacts = [
    header.location,
    header.phone,
    header.email,
    header.linkedin,
    header.website,
  ].filter((value): value is string => Boolean(value));
  if (contacts.length > 0) lines.push(contacts.join(" | "));

  if (profile.jobs.length > 0) {
    lines.push("", "PROFESSIONAL EXPERIENCE");
    for (const job of [...profile.jobs].sort((a, b) => a.sortOrder - b.sortOrder)) {
      lines.push(job.company);
      lines.push(
        [
          job.title,
          job.location,
          formatPeriod(job.startDate, job.endDate, job.current),
          job.employmentType,
        ]
          .filter(Boolean)
          .join(" | ")
      );
      for (const bullet of job.bullets) {
        if (bullet.content.trim()) lines.push(`- ${bullet.content.trim()}`);
      }
    }
  }

  if (profile.skills.length > 0) {
    lines.push("", "SKILLS");
    const grouped = new Map<string, string[]>();
    for (const skill of profile.skills) {
      const category = skill.category?.trim() || "Skills";
      const label = skill.proficiencyLabel?.trim()
        ? `${skill.name} (${skill.proficiencyLabel.trim()})`
        : skill.name;
      grouped.set(category, [...(grouped.get(category) ?? []), label]);
    }
    for (const [category, skills] of Array.from(grouped.entries())) {
      lines.push(`${category}: ${skills.join(", ")}`);
    }
  }

  if (profile.education.length > 0) {
    lines.push("", "EDUCATION");
    for (const education of profile.education) {
      lines.push(
        [
          education.degree,
          education.institution,
          education.location,
          education.expectedDate ?? education.graduationDate,
          education.gpa ? `GPA ${education.gpa}` : null,
        ]
          .filter(Boolean)
          .join(" | ")
      );
    }
  }

  if (profile.certifications.length > 0) {
    lines.push("", "CERTIFICATIONS");
    for (const certification of profile.certifications) {
      lines.push(
        [
          certification.name,
          certification.issuingBody,
          certification.issueDate,
          certification.credentialId
            ? `Credential ${certification.credentialId}`
            : null,
        ]
          .filter(Boolean)
          .join(" | ")
      );
    }
  }

  if (profile.projects.length > 0) {
    lines.push("", "PROJECTS");
    for (const project of profile.projects) {
      lines.push(
        [project.name, project.technologies.join(", "), project.url]
          .filter(Boolean)
          .join(" | ")
      );
      if (project.description.trim()) lines.push(project.description.trim());
    }
  }

  if (profile.achievements.length > 0) {
    lines.push("", "ACHIEVEMENTS");
    for (const achievement of profile.achievements) {
      lines.push(
        [achievement.title, achievement.description, achievement.date]
          .filter(Boolean)
          .join(" | ")
      );
    }
  }

  return lines.join("\n").trim();
}

export function getCareerMemoryEvidenceSources(profile: CareerMemory): string[] {
  return Array.from(
    new Set(
      [...profile.jobs]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((job) => [job.company.trim(), job.title.trim()].filter(Boolean).join(" - "))
        .filter(Boolean)
    )
  );
}

export function fingerprintCareerMemory(profile: CareerMemory): string {
  return JSON.stringify({
    jobs: profile.jobs.map((job) => ({
      company: job.company,
      title: job.title,
      startDate: job.startDate,
      endDate: job.endDate,
      current: job.current,
      location: job.location,
      employmentType: job.employmentType,
      bullets: job.bullets.map((bullet) => ({
        content: bullet.content,
        contentType: bullet.contentType,
        metrics: bullet.metrics,
        keywords: bullet.keywords,
        locked: bullet.locked,
      })),
      verified: job.verified,
      locked: job.locked,
      sortOrder: job.sortOrder,
    })),
    education: profile.education.map(withoutId),
    skills: profile.skills.map(withoutId),
    certifications: profile.certifications.map(withoutId),
    projects: profile.projects.map(withoutId),
    achievements: profile.achievements.map(withoutId),
  });
}

function withoutId<T extends { id: string }>(entry: T): Omit<T, "id"> {
  const copy = { ...entry };
  delete (copy as Partial<T>).id;
  return copy;
}

function formatPeriod(
  startDate: string,
  endDate: string | null,
  current: boolean
): string {
  const start = startDate.trim();
  const end = current ? "Present" : endDate?.trim() ?? "";
  return [start, end].filter(Boolean).join(" - ");
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
