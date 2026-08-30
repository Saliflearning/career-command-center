import { db } from "@/lib/db/client";
import { fetchCareerMemoryFromDB } from "@/lib/db/mappers/career-memory.mapper";
import { fetchResumeSourceProfile } from "@/lib/db/resume-source-profile";
import {
  type ResumeRoleType,
  type StructuredResumeExportInput,
} from "@/lib/export/structured-resume-pdf";
import { normalizeResumeSummaryText } from "@/lib/resume/content-contract";
import {
  normalizeCandidateName,
  resolveCandidateName,
} from "@/lib/resume/candidate-identity";
import {
  projectGroundedJdSkillGaps,
  projectGroundedTargetHeadline,
  projectLinkedWorkHistory,
  projectResumeProjects,
  projectResumeSkillsWithKeywords,
  restoreSourceWorkHistory,
} from "@/lib/resume/content-projection";
import {
  DEFAULT_RESUME_PRESENTATION,
  parseResumePresentation,
  RESUME_PRESENTATION_SECTION,
} from "@/lib/resume/presentation";
import {
  QUICK_RESUME_ARTIFACT_SECTION,
  isQuickResumeStrategy,
  parseQuickResumeArtifact,
} from "@/lib/resume/quick-resume-artifact";

export interface StructuredResumeSource {
  id: string;
  userId: string;
  state: string;
  /** Pipeline-generated LaTeX document, when the generation run produced one. */
  latexSource: string | null;
  input: StructuredResumeExportInput;
}

export class InvalidQuickResumeArtifactError extends Error {
  constructor() {
    super("The saved Quick Resume artifact is invalid.");
    this.name = "InvalidQuickResumeArtifactError";
  }
}

/**
 * Load the canonical structured payload used by preview QA and final export.
 * Keeping this mapping in one place prevents the screenshot gate and the
 * downloaded PDF from silently rendering different facts.
 */
export async function loadStructuredResumeSource(
  resumeId: string,
  allowedUserId?: string
): Promise<StructuredResumeSource | null> {
  const resume = await db.resume.findUnique({
    where: allowedUserId
      ? { id: resumeId, userId: allowedUserId }
      : { id: resumeId },
    select: {
      id: true,
      userId: true,
      state: true,
      latexSource: true,
      roleType: true,
      targetRole: true,
      strategyJson: true,
      targetCompany: true,
      jdText: true,
      jdKeywords: true,
      summaryText: true,
      user: {
        select: {
          name: true,
          email: true,
          location: true,
          linkedinUrl: true,
        },
      },
      sections: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, content: true },
      },
      bullets: {
        orderBy: { id: "asc" },
        include: {
          bullet: {
            include: {
              workHistory: {
                select: {
                  id: true,
                  company: true,
                  title: true,
                  startDate: true,
                  endDate: true,
                  current: true,
                  location: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!resume) return null;

  const quickResumeSection = resume.sections.find(
    (section) => section.name === QUICK_RESUME_ARTIFACT_SECTION
  );
  const markedQuickResume = isQuickResumeStrategy(resume.strategyJson);
  const quickResumeArtifact = parseQuickResumeArtifact(
    quickResumeSection?.content,
    resume.targetRole
  );
  if ((markedQuickResume || quickResumeSection) && !quickResumeArtifact) {
    throw new InvalidQuickResumeArtifactError();
  }
  const careerMemory = quickResumeArtifact
    ? null
    : (await fetchResumeSourceProfile(resume.id)) ??
      (await fetchCareerMemoryFromDB(resume.userId));
  const header = parseResumeHeader(
    resume.sections.find((section) => section.name === "resume_header")?.content
  );
  const presentationContent = resume.sections.find(
    (section) => section.name === RESUME_PRESENTATION_SECTION
  )?.content;
  const jobs: StructuredResumeExportInput["jobs"] = quickResumeArtifact
    ? quickResumeArtifact.jobs.map((job, sortOrder) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location || null,
        startDate: "",
        endDate: null,
        current: false,
        dateLabel: job.dateLabel,
        sortOrder,
        bullets: job.bullets.map((bullet) => bullet.content),
      }))
    : restoreSourceWorkHistory(
        projectLinkedWorkHistory(resume.bullets),
        careerMemory?.jobs ?? []
      ).map((job) => ({
      id: job.workHistoryId,
      title: job.title,
      company: job.company,
      location: job.location,
      startDate: job.startDate,
      endDate: job.endDate,
      current: job.current,
      sortOrder: job.sortOrder,
      bullets: job.bullets.map((bullet) => bullet.content),
    }));
  const education: StructuredResumeExportInput["education"] = quickResumeArtifact
    ? quickResumeArtifact.education.map((entry) => ({
        degree: entry.degree,
        institution: entry.institution,
        graduationDate: null,
        inProgress: false,
        dateLabel: entry.dateLabel,
        details: entry.details || null,
      }))
    : dedupeBy(
      (careerMemory?.education ?? []).map((entry) => ({
      degree: entry.degree,
      institution: entry.institution,
      graduationDate: entry.graduationDate,
      inProgress: entry.inProgress,
    })),
    (entry) => `${entry.degree}|${entry.institution}`.toLowerCase()
    );
  const certifications: StructuredResumeExportInput["certifications"] = quickResumeArtifact
    ? quickResumeArtifact.certifications.map((certification) => ({
        name: certification.name,
        issuingBody: certification.issuer || null,
        issueDate: null,
        dateLabel: certification.dateLabel,
      }))
    : dedupeBy(
      (careerMemory?.certifications ?? []).map((certification) => ({
      name: certification.name,
      issuingBody: certification.issuingBody,
      issueDate: certification.issueDate,
    })),
    (certification) => certification.name.toLowerCase()
    );
  const resumeText = [
    resume.jdText,
    resume.summaryText,
    ...resume.bullets.map((resumeBullet) => resumeBullet.bullet.content),
    ...resume.jdKeywords,
  ].filter(Boolean).join(" ").toLowerCase();
  const skills: StructuredResumeExportInput["skills"] = quickResumeArtifact
    ? quickResumeArtifact.coreSkills.map((name) => ({
        name,
        category: "Core Skills",
      }))
    : projectResumeSkillsWithKeywords(
        careerMemory?.skills ?? [],
        resumeText,
        resume.bullets.length === 0,
        resume.bullets.flatMap((resumeBullet) => resumeBullet.bullet.keywords ?? [])
      );
  const sourceResumeText = resume.sections.find(
    (section) => section.name === "source_resume"
  )?.content ?? "";
  const draftText = [
    resume.summaryText,
    ...jobs.flatMap((job) => [job.title, job.company, ...job.bullets]),
    ...skills.map((skill) => skill.name),
    ...education.flatMap((entry) => [entry.degree, entry.institution]),
    ...certifications.flatMap((certification) => [
      certification.name,
      certification.issuingBody,
    ]),
  ].filter(Boolean).join("\n");
  if (!quickResumeArtifact) {
    skills.push(...projectGroundedJdSkillGaps(
      sourceResumeText,
      resume.jdText ?? "",
      draftText,
      resume.targetRole,
      skills
    ));
  }

  return {
    id: resume.id,
    userId: resume.userId,
    state: resume.state,
    latexSource: resume.latexSource,
    input: {
      targetRole: resume.targetRole,
      targetCompany: resume.targetCompany,
      roleType: resume.roleType as ResumeRoleType,
      headline: quickResumeArtifact
        ? quickResumeArtifact.targetTitle
        : projectGroundedTargetHeadline(sourceResumeText, resume.targetRole),
      candidate: quickResumeArtifact
        ? {
            name: resolveCandidateName({
              headerName: header?.name,
              sourceResumeText,
              accountName: resume.user.name,
            }),
            email: header?.email ?? null,
            phone: header?.phone ?? null,
            linkedin: header?.linkedin ?? null,
            location: header?.location ?? null,
            website: header?.website ?? header?.github ?? null,
          }
        : {
            name: resolveCandidateName({
              headerName: header?.name,
              sourceResumeText,
              accountName: resume.user.name,
            }),
            email: header?.email ?? resume.user.email,
            phone: header?.phone ?? null,
            linkedin: header?.linkedin ?? resume.user.linkedinUrl,
            location: header?.location ?? resume.user.location,
            website: header?.website ?? header?.github ?? null,
          },
      summary:
        normalizeResumeSummaryText(resume.summaryText) ??
        resume.sections.find((section) =>
          section.name.toLowerCase().includes("summary")
        )?.content ??
        null,
      presentation: presentationContent
        ? parseResumePresentation(presentationContent)
        : DEFAULT_RESUME_PRESENTATION,
      jobs,
      projects: quickResumeArtifact
        ? quickResumeArtifact.projects.map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
            technologies: project.technologies,
            url: project.url || null,
            startDate: null,
            endDate: null,
          }))
        : projectResumeProjects(careerMemory?.projects ?? [], resume.roleType),
      education,
      skills,
      certifications,
    },
  };
}

export function parseResumeHeader(content: string | null | undefined) {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      name: normalizeCandidateName(parsed.name),
      email: stringValue(parsed.email),
      phone: stringValue(parsed.phone),
      linkedin: stringValue(parsed.linkedin),
      location: stringValue(parsed.location),
      website: stringValue(parsed.website),
      github: stringValue(parsed.github),
    };
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
