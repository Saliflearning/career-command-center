/**
 * GET /api/resume/[id]/content
 *
 * Returns the full workspace content for a completed resume:
 * - Summary text (from Summary Writer agent)
 * - Work history with generated bullets (GENERATED > VERIFIED fallback)
 * - Section metadata
 * - Candidate name + contact for the resume header
 *
 * Only available once state is QA_REVIEWED or beyond.
 * Returns 202 Accepted if the resume is still generating.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { fetchCareerMemoryFromDB } from "@/lib/db/mappers/career-memory.mapper";
import { fetchResumeSourceProfile } from "@/lib/db/resume-source-profile";
import {
  projectResumeProjects,
  projectGroundedJdSkillGaps,
  projectGroundedTargetHeadline,
  projectLinkedWorkHistory,
  restoreSourceWorkHistory,
  projectResumeSkillsWithKeywords,
} from "@/lib/resume/content-projection";
import {
  extractEditorMetrics,
  parseResumeEditorPatch,
  ResumeEditorPatchError,
} from "@/lib/resume/editor-patch";
import { TEACHING_EXAMPLE_SECTION } from "@/lib/resume/teaching-examples";
import {
  normalizeCandidateName,
  resolveCandidateName,
} from "@/lib/resume/candidate-identity";
import {
  DEFAULT_RESUME_PRESENTATION,
  parseResumePresentation,
  RESUME_PRESENTATION_SECTION,
  serializeResumePresentation,
} from "@/lib/resume/presentation";
import {
  QUICK_RESUME_ARTIFACT_SECTION,
  isQuickResumeStrategy,
  parseQuickResumeArtifact,
  updateQuickResumeArtifactBullet,
} from "@/lib/resume/quick-resume-artifact";

// States where content is ready
const READY_STATES = new Set([
  "QA_REVIEWED",
  "USER_EDITING",
  "EXPORTED",
  "TRACKED",
]);

const SOURCE_RESUME_SECTION = "source_resume";
const STALE_ANALYSIS_SECTIONS = [TEACHING_EXAMPLE_SECTION, "visual_qa", "diagnostic"];
const EDIT_CONFLICT_MESSAGE = "Resume changed elsewhere. Reload before saving.";

class EditConflictError extends Error {}

function conflictResponse() {
  return NextResponse.json(
    { error: EDIT_CONFLICT_MESSAGE, code: "EDIT_CONFLICT" },
    { status: 409 }
  );
}

function editResumeData(state: string) {
  return {
    version: { increment: 1 },
    ...(["QA_REVIEWED", "EXPORTED"].includes(state) ? { state: "USER_EDITING" as const } : {}),
    pdfUrl: null,
    latexSource: null,
    exportedAt: null,
    pageCount: null,
    visualScore: null,
    atsScore: null,
    keywordScore: null,
  };
}

async function advanceDocumentRevision(
  transaction: typeof db,
  resumeId: string,
  expectedRevision: number,
  state: string,
  extraData: Record<string, unknown> = {}
) {
  const updated = await transaction.resume.updateMany({
    where: { id: resumeId, version: expectedRevision },
    data: { ...editResumeData(state), ...extraData },
  });
  if (updated.count !== 1) throw new EditConflictError();
  await transaction.resumeSection.deleteMany({
    where: { resumeId, name: { in: STALE_ANALYSIS_SECTIONS } },
  });
}
const INTERNAL_SECTION_NAMES = new Set([
  "source_profile",
  "source_origin",
  "pipeline_error",
  "diagnostic",
  "user_evidence",
  "resume_header",
  RESUME_PRESENTATION_SECTION,
  TEACHING_EXAMPLE_SECTION,
  QUICK_RESUME_ARTIFACT_SECTION,
  "visual_qa",
]);

function isClientSafeSection(section: { name: string; visible: boolean }) {
  const name = section.name.trim().toLowerCase();
  if (name === SOURCE_RESUME_SECTION) return true;
  return section.visible && !INTERNAL_SECTION_NAMES.has(name);
}

function parseResumeHeader(content: string | null | undefined) {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      name: normalizeCandidateName(parsed.name),
      email: typeof parsed.email === "string" ? parsed.email : null,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      linkedin: typeof parsed.linkedin === "string" ? parsed.linkedin : null,
      location: typeof parsed.location === "string" ? parsed.location : null,
      website: typeof parsed.website === "string" ? parsed.website : null,
      github: typeof parsed.github === "string" ? parsed.github : null,
    };
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const resume = await db.resume.findUnique({
    where: { id },
    include: {
      user: {
        select: { name: true, email: true },
      },
      sections: {
        orderBy: { sortOrder: "asc" },
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

  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (resume.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Still generating — tell client to keep polling
  if (!READY_STATES.has(resume.state)) {
    return NextResponse.json(
      {
        state: resume.state,
        message: "Resume is still being generated. Keep polling /status.",
      },
      { status: 202 }
    );
  }

  // Sort work history by sortOrder (most recent first)
  // Fetch education from career memory (deduped — repeated pipeline runs
  // append duplicate rows until career-memory dedupe lands)
  const quickResumeSection = resume.sections.find(
    (section) => section.name === QUICK_RESUME_ARTIFACT_SECTION
  );
  const markedQuickResume = isQuickResumeStrategy(resume.strategyJson);
  const quickResumeArtifact = parseQuickResumeArtifact(
    quickResumeSection?.content,
    resume.targetRole
  );
  if ((markedQuickResume || quickResumeSection) && !quickResumeArtifact) {
    return NextResponse.json(
      { error: "This saved Quick Resume is damaged and cannot be opened safely." },
      { status: 422 }
    );
  }
  const careerMemory = quickResumeArtifact
    ? null
    : (await fetchResumeSourceProfile(resume.id)) ??
      (await fetchCareerMemoryFromDB(resume.userId));

  const workHistory = quickResumeArtifact
    ? quickResumeArtifact.jobs.map((job, sortOrder) => ({
        workHistoryId: job.id,
        company: job.company,
        title: job.title,
        location: job.location || null,
        startDate: "",
        endDate: null,
        current: false,
        dateLabel: job.dateLabel,
        sortOrder,
        bullets: job.bullets.map((bullet) => ({
          bulletId: bullet.id,
          content: bullet.content,
          contentType: bullet.contentType,
        })),
      }))
    : restoreSourceWorkHistory(
        projectLinkedWorkHistory(resume.bullets),
        careerMemory?.jobs ?? []
      );

  const educationSeen = new Set<string>();
  const education = quickResumeArtifact
    ? quickResumeArtifact.education.map((entry) => ({
        degree: entry.degree,
        institution: entry.institution,
        graduationDate: null,
        dateLabel: entry.dateLabel,
        inProgress: false,
        gpa: null,
        details: entry.details,
      }))
    : (careerMemory?.education ?? [])
    .filter((e) => {
      const key = `${e.degree}|${e.institution}`.toLowerCase();
      if (educationSeen.has(key)) return false;
      educationSeen.add(key);
      return true;
    })
    .map((e) => ({
      degree: e.degree,
      institution: e.institution,
      graduationDate: e.graduationDate,
      inProgress: e.inProgress,
      gpa: e.gpa,
    }));

  const certificationSeen = new Set<string>();
  const certifications = quickResumeArtifact
    ? quickResumeArtifact.certifications.map((entry) => ({
        name: entry.name,
        issuingBody: entry.issuer || null,
        issueDate: null,
        dateLabel: entry.dateLabel,
        expiryDate: null,
      }))
    : (careerMemory?.certifications ?? [])
    .filter((cert) => {
      const key = cert.name.toLowerCase();
      if (certificationSeen.has(key)) return false;
      certificationSeen.add(key);
      return true;
    })
    .map((cert) => ({
      name: cert.name,
      issuingBody: cert.issuingBody,
      issueDate: cert.issueDate,
      expiryDate: cert.expiryDate,
    }));

  const projects = quickResumeArtifact
    ? quickResumeArtifact.projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        technologies: project.technologies,
        url: project.url || null,
        startDate: null,
        endDate: null,
      }))
    : projectResumeProjects(
        careerMemory?.projects ?? [],
        resume.roleType
      );

  // Skills are scoped to THIS resume, but should still preserve the user's
  // verified/source skill taxonomy when it is relevant to this draft.
  const resumeText = [
    resume.jdText,
    resume.summaryText,
    ...resume.bullets.map((rb) => rb.bullet.content),
    ...resume.jdKeywords,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const skills = quickResumeArtifact
    ? quickResumeArtifact.coreSkills.map((name) => ({ name, category: "Core Skills" }))
    : projectResumeSkillsWithKeywords(
        careerMemory?.skills ?? [],
        resumeText,
        resume.bullets.length === 0,
        resume.bullets.flatMap((resumeBullet) => resumeBullet.bullet.keywords ?? [])
      );

  const sourceResumeText = resume.sections.find(
    (section) => section.name === SOURCE_RESUME_SECTION
  )?.content ?? "";
  const actualDraftText = [
    resume.summaryText,
    ...workHistory.flatMap((job) => [
      job.title,
      job.company,
      ...job.bullets.map((bullet) => bullet.content),
    ]),
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
      actualDraftText,
      resume.targetRole,
      skills
    ));
  }

  const diagnosticSection = resume.sections.find((section) => section.name === "diagnostic");
  let diagnostic: {
    atsScore: number;
    keywordScore: number;
    issues: string[];
    recommendations: string[];
    needsReview: boolean;
  } | null = null;
  if (diagnosticSection?.content) {
    try {
      diagnostic = JSON.parse(diagnosticSection.content);
    } catch {
      diagnostic = null;
    }
  }
  const parsedHeader = parseResumeHeader(
    resume.sections.find((section) => section.name === "resume_header")?.content
  );
  const presentationSection = resume.sections.find(
    (section) => section.name === RESUME_PRESENTATION_SECTION
  );
  const presentation = presentationSection?.content
    ? parseResumePresentation(presentationSection.content)
    : { ...DEFAULT_RESUME_PRESENTATION };

  return NextResponse.json({
    resumeId: resume.id,
    documentRevision: resume.version,
    jdText: resume.jdText,
    targetRole: resume.targetRole,
    targetCompany: resume.targetCompany,
    roleType: resume.roleType,
    state: resume.state,

    // Candidate identity (from User record)
    candidateName: resolveCandidateName({
      headerName: parsedHeader?.name,
      sourceResumeText,
      accountName: resume.user.name,
    }),
    candidateEmail: parsedHeader?.email ?? resume.user.email,
    candidatePhone: parsedHeader?.phone ?? null,
    candidateLinkedin: parsedHeader?.linkedin ?? null,
    candidateLocation: parsedHeader?.location ?? null,
    candidateWebsite: parsedHeader?.website ?? parsedHeader?.github ?? null,
    candidateHeadline: quickResumeArtifact?.targetTitle ??
      projectGroundedTargetHeadline(sourceResumeText, resume.targetRole),
    honestStretchNote: quickResumeArtifact?.honestStretchNote ?? null,

    // Generated content
    summaryText: resume.summaryText,
    presentation,

    // Sections (for section nav + ordering)
    sections: resume.sections
      .filter(isClientSafeSection)
      .map((s) => ({
        name: s.name,
        sortOrder: s.sortOrder,
        visible: s.visible,
        content: s.content,
      })),

    // Experience with bullets
    workHistory,

    // Education (from career memory)
    education,

    // Certifications (from career memory)
    certifications,

    // Verified projects, only for tracks whose approved order includes them.
    projects,

    // Skills (from career memory)
    skills,

    // Scores
    atsScore: resume.atsScore,
    keywordScore: resume.keywordScore,
    diagnostic,

    // Export availability
    hasLatex: !!resume.latexSource,
  });
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let patch;
  try {
    patch = parseResumeEditorPatch(await request.json());
  } catch (error) {
    const message = error instanceof ResumeEditorPatchError
      ? error.message
      : "Invalid editor update";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const resume = await db.resume.findUnique({
    where: { id },
    select: {
      userId: true,
      state: true,
      version: true,
      strategyJson: true,
      targetRole: true,
    },
  });
  if (!resume) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (resume.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!READY_STATES.has(resume.state)) {
    return NextResponse.json({ error: "Resume is not editable" }, { status: 409 });
  }
  if (patch.expectedRevision !== resume.version) return conflictResponse();

  const quickResumeSection = await db.resumeSection.findFirst({
    where: { resumeId: id, name: QUICK_RESUME_ARTIFACT_SECTION },
    select: { id: true, content: true },
  });
  const markedQuickResume = isQuickResumeStrategy(resume.strategyJson);
  const quickResumeArtifact = parseQuickResumeArtifact(
    quickResumeSection?.content,
    resume.targetRole
  );
  if ((markedQuickResume || quickResumeSection) && !quickResumeArtifact) {
    return NextResponse.json(
      { error: "This saved Quick Resume is damaged and cannot be edited safely." },
      { status: 422 }
    );
  }

  if (patch.type === "summary") {
    try {
      await db.$transaction(async (transaction) => {
        await advanceDocumentRevision(
          transaction as typeof db,
          id,
          patch.expectedRevision,
          resume.state,
          { summaryText: patch.content }
        );
      });
    } catch (error) {
      if (error instanceof EditConflictError) return conflictResponse();
      throw error;
    }
    return NextResponse.json({
      type: "summary",
      content: patch.content,
      documentRevision: resume.version + 1,
      teachingExampleRevoked: true,
    });
  }

  if (patch.type === "presentation") {
    try {
      await db.$transaction(async (transaction) => {
        const tx = transaction as typeof db;
        await advanceDocumentRevision(
          tx,
          id,
          patch.expectedRevision,
          resume.state
        );
        await tx.resumeSection.deleteMany({
          where: { resumeId: id, name: RESUME_PRESENTATION_SECTION },
        });
        await tx.resumeSection.create({
          data: {
            resumeId: id,
            name: RESUME_PRESENTATION_SECTION,
            visible: false,
            sortOrder: 1_000,
            content: serializeResumePresentation(patch.presentation),
          },
        });
      });
    } catch (error) {
      if (error instanceof EditConflictError) return conflictResponse();
      throw error;
    }
    return NextResponse.json({
      type: "presentation",
      presentation: patch.presentation,
      documentRevision: resume.version + 1,
    });
  }
  if (quickResumeSection && quickResumeArtifact) {
    let updatedArtifact;
    try {
      updatedArtifact = updateQuickResumeArtifactBullet(
        quickResumeArtifact,
        patch.bulletId,
        patch.content,
        quickResumeArtifact.revision
      );
    } catch {
      return NextResponse.json({ error: "Resume bullet not found" }, { status: 404 });
    }
    try {
      await db.$transaction(async (transaction) => {
        const tx = transaction as typeof db;
        const sectionUpdate = await tx.resumeSection.updateMany({
          where: { id: quickResumeSection.id, content: quickResumeSection.content },
          data: { content: JSON.stringify(updatedArtifact) },
        });
        if (sectionUpdate.count !== 1) throw new EditConflictError();
        await advanceDocumentRevision(
          tx,
          id,
          patch.expectedRevision,
          resume.state
        );
      });
    } catch (error) {
      if (error instanceof EditConflictError) return conflictResponse();
      throw error;
    }
    return NextResponse.json({
      type: "bullet",
      previousBulletId: patch.bulletId,
      bulletId: patch.bulletId,
      content: patch.content,
      contentType: "USER_EDITED",
      documentRevision: resume.version + 1,
      teachingExampleRevoked: true,
    });
  }

  const resumeBullet = await db.resumeBullet.findFirst({
    where: { resumeId: id, bulletId: patch.bulletId },
    include: {
      bullet: {
        include: { usedInResumes: { select: { resumeId: true } } },
      },
    },
  });
  if (!resumeBullet) {
    return NextResponse.json({ error: "Resume bullet not found" }, { status: 404 });
  }

  const updatedBullet = await db.$transaction(async (transaction) => {
    const isResumeScopedEdit =
      resumeBullet.bullet.contentType === "USER_EDITED" &&
      resumeBullet.bullet.usedInResumes.length === 1 &&
      resumeBullet.bullet.usedInResumes[0]?.resumeId === id;

    const bullet = isResumeScopedEdit
      ? await transaction.bullet.update({
          where: { id: resumeBullet.bulletId },
          data: {
            content: patch.content,
            metrics: extractEditorMetrics(patch.content),
          },
        })
      : await transaction.bullet.create({
          data: {
            workHistoryId: resumeBullet.bullet.workHistoryId,
            content: patch.content,
            contentType: "USER_EDITED",
            metrics: extractEditorMetrics(patch.content),
            keywords: resumeBullet.bullet.keywords,
            locked: true,
          },
        });

    if (!isResumeScopedEdit) {
      await transaction.resumeBullet.update({
        where: { id: resumeBullet.id },
        data: { bulletId: bullet.id },
      });
    }
    await advanceDocumentRevision(
      transaction as typeof db,
      id,
      patch.expectedRevision,
      resume.state
    );
    return bullet;
  }).catch((error) => {
    if (error instanceof EditConflictError) return null;
    throw error;
  });

  if (!updatedBullet) return conflictResponse();

  return NextResponse.json({
    type: "bullet",
    previousBulletId: patch.bulletId,
    bulletId: updatedBullet.id,
    content: updatedBullet.content,
    contentType: updatedBullet.contentType,
    documentRevision: resume.version + 1,
    teachingExampleRevoked: true,
  });
}
