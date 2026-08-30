/**
 * GET /api/resume returns the signed-in user's recent resume library summary.
 * POST /api/resume creates a new UPLOADED resume and can clone an immutable
 * source snapshot from another resume owned by the same user.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { buildResumeLibrarySummary } from "@/lib/resume/library-summary";
import { resolveCandidateName } from "@/lib/resume/candidate-identity";
import {
  formatCareerMemoryAsResumeText,
  parseCareerMemorySnapshot,
  parseSavedSourceHeader,
} from "@/lib/resume/saved-source";

const createResumeSchema = z
  .object({
    targetRole: z.string().max(180).optional(),
    sourceResumeId: z.string().max(100).optional(),
  })
  .strict();

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const [resumes, atsScores, keywordScores, totalResumes, totalApplications] =
    await Promise.all([
      db.resume.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          targetCompany: true,
          targetRole: true,
          state: true,
          atsScore: true,
          keywordScore: true,
          updatedAt: true,
          exportedAt: true,
        },
      }),
      db.resume.aggregate({
        where: { userId, atsScore: { not: null } },
        _avg: { atsScore: true },
        _count: { atsScore: true },
      }),
      db.resume.aggregate({
        where: { userId, atsScore: null, keywordScore: { not: null } },
        _avg: { keywordScore: true },
        _count: { keywordScore: true },
      }),
      db.resume.count({ where: { userId } }),
      db.application.count({ where: { userId } }),
    ]);

  return NextResponse.json(
    {
      resumes: resumes.map((resume) => ({
        ...resume,
        updatedAt: resume.updatedAt.toISOString(),
        exportedAt: resume.exportedAt?.toISOString() ?? null,
      })),
      summary: buildResumeLibrarySummary(
        [
          { average: atsScores._avg.atsScore, count: atsScores._count.atsScore },
          {
            average: keywordScores._avg.keywordScore,
            count: keywordScores._count.keywordScore,
          },
        ],
        totalResumes,
        totalApplications
      ),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown = {};
  try {
    const text = await request.text();
    rawBody = text.trim() ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid resume request." },
      { status: 400 }
    );
  }

  const parsedBody = createResumeSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid resume request." },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const targetRole =
    body.targetRole?.trim()
      ? body.targetRole.trim()
      : "Not yet specified";
  const sourceResumeId = body.sourceResumeId?.trim() ?? "";
  const sourceSections: Array<{
    name: string;
    visible: boolean;
    sortOrder: number;
    content: string;
  }> = [];

  if (sourceResumeId) {
    const source = await db.resume.findFirst({
      where: { id: sourceResumeId, userId: session.user.id },
      select: {
        sections: {
          where: { name: { in: ["source_profile", "resume_header", "source_resume"] } },
          select: { name: true, content: true },
        },
      },
    });
    if (!source) {
      return NextResponse.json({ error: "Saved resume not found." }, { status: 404 });
    }

    const profileSection = source.sections.find(
      (section) => section.name === "source_profile"
    );
    const profile = parseCareerMemorySnapshot(profileSection?.content);
    if (!profileSection?.content || !profile || profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: "This saved resume has no reusable source snapshot." },
        { status: 422 }
      );
    }

    const headerSection = source.sections.find(
      (section) => section.name === "resume_header"
    );
    const originalSourceSection = source.sections.find(
      (section) => section.name === "source_resume"
    );
    const parsedHeader = parseSavedSourceHeader(headerSection?.content);
    const reusableHeader = {
      ...parsedHeader,
      name: resolveCandidateName({
        headerName: parsedHeader.name,
        sourceResumeText: originalSourceSection?.content,
      }),
    };
    const sourceText = formatCareerMemoryAsResumeText(
      profile,
      reusableHeader
    );
    if (sourceText.length < 50) {
      return NextResponse.json(
        { error: "This saved resume has too little source evidence to reuse." },
        { status: 422 }
      );
    }

    sourceSections.push(
      {
        name: "source_profile",
        visible: false,
        sortOrder: -9,
        content: JSON.stringify(profile),
      },
      {
        name: "source_resume",
        visible: false,
        sortOrder: -100,
        content: sourceText,
      },
      {
        name: "source_origin",
        visible: false,
        sortOrder: -101,
        content: sourceResumeId,
      }
    );
    if (Object.values(reusableHeader).some(Boolean)) {
      sourceSections.push({
        name: "resume_header",
        visible: false,
        sortOrder: -8,
        content:
          reusableHeader.name === parsedHeader.name && headerSection?.content
            ? headerSection.content
            : JSON.stringify(reusableHeader),
      });
    }
  }

  const resume = await db.resume.create({
    data: {
      userId: session.user.id,
      targetRole,
      state: "UPLOADED",
      sections: sourceSections.length > 0 ? { create: sourceSections } : undefined,
    },
    select: { id: true },
  });

  return NextResponse.json({ resumeId: resume.id }, { status: 201 });
}
