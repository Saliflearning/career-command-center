import type { ProjectEntry, SkillEntry, WorkHistoryEntry } from "@/lib/types";
import { analyzeResumeAgainstJob, extractJobTermDetails } from "./scan-analysis";

export type ProjectedBullet = {
  bulletId: string;
  content: string;
  contentType: string;
};

export type ProjectedWorkHistory = {
  workHistoryId: string;
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  current: boolean;
  dateLabel?: string;
  sortOrder: number;
  bullets: ProjectedBullet[];
};

export type LinkedResumeBullet = {
  bulletId: string;
  bullet: {
    content: string;
    contentType: string;
    workHistory: {
      id: string;
      company: string;
      title: string;
      startDate: string | Date;
      endDate: string | Date | null;
      current: boolean;
      location: string | null;
      sortOrder: number;
    };
  };
};

export type ProjectedSkill = {
  name: string;
  category: string | null;
};

export type ProjectedProject = {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  url: string | null;
  startDate: string | null;
  endDate: string | null;
};

const PROJECT_ROLE_TYPES = new Set(["TECHNICAL", "DATA", "CREATIVE"]);

/**
 * Build the document-scoped work history once for every renderer. This keeps
 * bullet order, date serialization, and stale-current handling identical in
 * the workspace and exported artifact.
 */
export function projectLinkedWorkHistory(
  links: LinkedResumeBullet[]
): ProjectedWorkHistory[] {
  const byJob = new Map<string, ProjectedWorkHistory>();

  links.forEach((link) => {
    const job = link.bullet.workHistory;
    const endDate = toIsoDate(job.endDate);
    if (!byJob.has(job.id)) {
      byJob.set(job.id, {
        workHistoryId: job.id,
        company: job.company,
        title: job.title,
        location: job.location,
        startDate: toIsoDate(job.startDate) ?? "",
        endDate,
        current: endDate ? false : job.current,
        sortOrder: job.sortOrder,
        bullets: [],
      });
    }
    byJob.get(job.id)!.bullets.push({
      bulletId: link.bulletId,
      content: link.bullet.content,
      contentType: link.bullet.contentType,
    });
  });

  return Array.from(byJob.values()).sort(
    (left, right) => left.sortOrder - right.sortOrder
  );
}

export function roleSupportsProjects(roleType: string | null | undefined) {
  return typeof roleType === "string" && PROJECT_ROLE_TYPES.has(roleType);
}

/**
 * Projects are optional evidence, not universal resume filler. Only explicitly
 * vouched projects are eligible, and only for tracks whose approved section
 * order includes a project section.
 */
export function projectResumeProjects(
  sourceProjects: ProjectEntry[],
  roleType: string | null | undefined
): ProjectedProject[] {
  if (!roleSupportsProjects(roleType)) return [];

  const seen = new Set<string>();
  return sourceProjects.flatMap((project) => {
    const key = project.name.trim().toLowerCase();
    if (!project.verified || !key || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: project.id,
      name: project.name.trim(),
      description: project.description.trim(),
      technologies: Array.from(new Set(
        project.technologies.map((technology) => technology.trim()).filter(Boolean)
      )),
      url: project.url?.trim() || null,
      startDate: project.startDate,
      endDate: project.endDate,
    }];
  });
}

/**
 * Older completed resumes can predate ResumeBullet links. In that case the
 * immutable source profile is the only truthful document-scoped fallback.
 */
export function restoreSourceWorkHistory(
  linkedWorkHistory: ProjectedWorkHistory[],
  sourceJobs: WorkHistoryEntry[]
): ProjectedWorkHistory[] {
  if (linkedWorkHistory.length > 0) return linkedWorkHistory;

  return sourceJobs
    .map((job) => ({
      workHistoryId: job.id,
      company: job.company,
      title: job.title,
      location: job.location,
      startDate: job.startDate,
      endDate: job.endDate,
      current: job.current,
      sortOrder: job.sortOrder,
      bullets: job.bullets.map((bullet) => ({
        bulletId: bullet.id,
        content: bullet.content,
        contentType: bullet.contentType,
      })),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Prefer skills used by this tailored draft. If a legacy resume has no linked
 * generated bullets, retain its source-scoped skills instead of presenting an
 * empty or misleading skills section.
 */
export function projectResumeSkills(
  sourceSkills: SkillEntry[],
  resumeText: string,
  useSourceFallback: boolean
): ProjectedSkill[] {
  const normalizedText = resumeText.toLowerCase();
  const seen = new Set<string>();
  const matched = sourceSkills.flatMap((skill) => {
    const key = skill.name.trim().toLowerCase();
    if (!key || seen.has(key) || !normalizedText.includes(key)) return [];
    seen.add(key);
    return [{ name: projectedSkillName(skill), category: skill.category }];
  });

  if (matched.length > 0 || !useSourceFallback) return matched;

  return sourceSkills.flatMap((skill) => {
    const key = skill.name.trim().toLowerCase();
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ name: projectedSkillName(skill), category: skill.category }];
  });
}

export function projectResumeSkillsWithKeywords(
  sourceSkills: SkillEntry[],
  resumeText: string,
  useSourceFallback: boolean,
  generatedKeywords: string[]
): ProjectedSkill[] {
  const skills = projectResumeSkills(
    sourceSkills,
    resumeText,
    useSourceFallback
  );
  const seen = new Set(skills.map((skill) => normalizeProjectedSkill(skill.name)));

  generatedKeywords.forEach((keyword) => {
    const name = keyword.trim();
    const key = normalizeProjectedSkill(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    skills.push({ name, category: null });
  });

  return skills;
}

function toIsoDate(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeCapability(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function projectedSkillName(skill: SkillEntry) {
  const name = skill.name.trim();
  const qualifier = skill.proficiencyLabel?.trim();
  return qualifier ? `${name} (${qualifier})` : name;
}

function normalizeProjectedSkill(value: string) {
  return normalizeCapability(value.replace(/\s+\([^)]{1,40}\)\s*$/, ""));
}

/**
 * A target-role headline is safe only when the uploaded source already names
 * that exact role. This prevents a tailored resume from presenting an
 * aspirational title as prior experience.
 */
export function projectGroundedTargetHeadline(
  sourceResumeText: string,
  targetRole: string
): string | null {
  const source = normalizeCapability(sourceResumeText);
  const role = normalizeCapability(targetRole);
  if (!source || !role || role.split(" ").length > 8) return null;
  return (` ${source} `).includes(` ${role} `) ? targetRole.trim() : null;
}

/**
 * Keep generation from erasing high-signal JD capabilities already proven by
 * the uploaded resume. This is intentionally narrower than keyword stuffing:
 * generic one-word job language and the target title are excluded, and every
 * projected phrase must match both the source resume and the JD.
 */
export function projectGroundedJdSkillGaps(
  sourceResumeText: string,
  jobDescription: string,
  draftText: string,
  targetRole: string,
  existingSkills: ProjectedSkill[],
  limit = 4
): ProjectedSkill[] {
  if (!sourceResumeText.trim() || !jobDescription.trim() || limit < 1) return [];

  const sourceMatches = new Set(
    analyzeResumeAgainstJob(sourceResumeText, jobDescription).matchedKeywords
      .map(normalizeCapability)
  );
  const draftMatches = new Set(
    analyzeResumeAgainstJob(draftText, jobDescription).matchedKeywords
      .map(normalizeCapability)
  );
  const detailByTerm = new Map(
    extractJobTermDetails(jobDescription).map((detail) => [
      normalizeCapability(detail.term),
      detail,
    ])
  );
  const role = normalizeCapability(targetRole);
  const seen = new Set(existingSkills.map((skill) => normalizeProjectedSkill(skill.name)));

  return Array.from(sourceMatches).flatMap((term) => {
    const detail = detailByTerm.get(term);
    const roleOverlap = role && (role.includes(term) || term.includes(role));
    if (
      !detail ||
      detail.category === "Job language" ||
      draftMatches.has(term) ||
      seen.has(term) ||
      roleOverlap ||
      term.split(" ").length > 5 ||
      term.length > 60
    ) {
      return [];
    }
    seen.add(term);
    return [{ name: detail.term, category: "Role-Aligned Capabilities" }];
  }).slice(0, limit);
}
