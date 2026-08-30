import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { fetchResumeSourceProfile } from "@/lib/db/resume-source-profile";
import {
  parseTeachingExample,
  TEACHING_EXAMPLE_SCHEMA_VERSION,
  TEACHING_EXAMPLE_SECTION,
  type TeachingExamplePayload,
} from "@/lib/resume/teaching-examples";

const READY_STATES = new Set(["QA_REVIEWED", "USER_EDITING", "EXPORTED", "TRACKED"]);

async function ownedResume(id: string, userId: string) {
  const resume = await db.resume.findUnique({
    where: { id },
    include: {
      sections: {
        where: { name: TEACHING_EXAMPLE_SECTION },
        select: { id: true, content: true },
        take: 1,
      },
      bullets: {
        orderBy: { id: "asc" },
        include: {
          bullet: {
            include: {
              workHistory: {
                select: { id: true, title: true, company: true, sortOrder: true },
              },
            },
          },
        },
      },
    },
  });
  if (!resume) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (resume.userId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { resume };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await ownedResume(id, session.user.id);
  if (result.error) return result.error;
  const example = parseTeachingExample(result.resume.sections[0]?.content);
  return NextResponse.json({
    approved: Boolean(example),
    approvedAt: example?.approvedAt ?? null,
    targetRole: example?.targetRole ?? null,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await ownedResume(id, session.user.id);
  if (result.error) return result.error;
  const { resume } = result;
  if (!READY_STATES.has(resume.state)) {
    return NextResponse.json({ error: "Finish generating this resume before teaching from it." }, { status: 409 });
  }
  if (!resume.jdText?.trim() || !resume.targetRole.trim()) {
    return NextResponse.json({ error: "A target role and job description are required." }, { status: 409 });
  }

  const sourceProfile = await fetchResumeSourceProfile(resume.id);
  if (!sourceProfile) {
    return NextResponse.json({ error: "The source resume must be parsed before it can teach future drafts." }, { status: 409 });
  }

  const jobs = new Map<string, {
    title: string;
    company: string;
    sortOrder: number;
    bullets: string[];
  }>();
  for (const link of resume.bullets) {
    const history = link.bullet.workHistory;
    const current = jobs.get(history.id) ?? {
      title: history.title,
      company: history.company,
      sortOrder: history.sortOrder,
      bullets: [],
    };
    current.bullets.push(link.bullet.content);
    jobs.set(history.id, current);
  }

  const payload: TeachingExamplePayload = {
    schemaVersion: TEACHING_EXAMPLE_SCHEMA_VERSION,
    resumeId: resume.id,
    userId: resume.userId,
    approvedAt: new Date().toISOString(),
    targetRole: resume.targetRole,
    targetCompany: resume.targetCompany,
    jdText: resume.jdText,
    jobKeywords: resume.jdKeywords,
    sourceSnapshot: sourceProfile,
    finalResume: {
      summary: resume.summaryText,
      experience: Array.from(jobs.values())
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ title, company, bullets }) => ({ title, company, bullets })),
      skills: sourceProfile.skills.map((skill) => ({
        name: skill.name,
        category: skill.category,
      })),
      education: sourceProfile.education.map((entry) => ({
        degree: entry.degree,
        institution: entry.institution,
      })),
      certifications: sourceProfile.certifications.map((entry) => entry.name),
    },
    engine: { resumeVersion: resume.version, state: resume.state },
  };

  await db.$transaction([
    db.resumeSection.deleteMany({
      where: { resumeId: resume.id, name: TEACHING_EXAMPLE_SECTION },
    }),
    db.resumeSection.create({
      data: {
        resumeId: resume.id,
        name: TEACHING_EXAMPLE_SECTION,
        visible: false,
        sortOrder: 1000,
        content: JSON.stringify(payload),
      },
    }),
  ]);

  return NextResponse.json({ approved: true, approvedAt: payload.approvedAt });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await ownedResume(id, session.user.id);
  if (result.error) return result.error;
  await db.resumeSection.deleteMany({
    where: { resumeId: id, name: TEACHING_EXAMPLE_SECTION },
  });
  return NextResponse.json({ approved: false });
}
