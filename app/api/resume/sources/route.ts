import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import {
  fingerprintCareerMemory,
  parseCareerMemorySnapshot,
  parseSavedSourceHeader,
} from "@/lib/resume/saved-source";
import { resolveCandidateName } from "@/lib/resume/candidate-identity";

const SOURCE_PROFILE_SECTION = "source_profile";
const SOURCE_RESUME_SECTION = "source_resume";
const RESUME_HEADER_SECTION = "resume_header";
const MAX_SOURCE_CANDIDATES = 50;
const MAX_SOURCES_RETURNED = 12;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resumes = await db.resume.findMany({
    where: {
      userId: session.user.id,
      sections: { some: { name: SOURCE_PROFILE_SECTION } },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_SOURCE_CANDIDATES,
    select: {
      id: true,
      targetRole: true,
      targetCompany: true,
      updatedAt: true,
      sections: {
        where: {
          name: {
            in: [SOURCE_PROFILE_SECTION, SOURCE_RESUME_SECTION, RESUME_HEADER_SECTION],
          },
        },
        select: { name: true, content: true },
      },
    },
  });

  const fingerprints = new Set<string>();
  const sources: Array<{
    id: string;
    candidateName: string | null;
    targetRole: string;
    targetCompany: string | null;
    updatedAt: string;
  }> = [];

  for (const resume of resumes) {
    const profile = parseCareerMemorySnapshot(
      resume.sections.find((section) => section.name === SOURCE_PROFILE_SECTION)?.content
    );
    if (!profile || profile.userId !== session.user.id) continue;

    const fingerprint = fingerprintCareerMemory(profile);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);

    const header = parseSavedSourceHeader(
      resume.sections.find((section) => section.name === RESUME_HEADER_SECTION)?.content
    );
    const sourceResumeText = resume.sections.find(
      (section) => section.name === SOURCE_RESUME_SECTION
    )?.content;
    sources.push({
      id: resume.id,
      candidateName: resolveCandidateName({
        headerName: header.name,
        sourceResumeText,
      }),
      targetRole: resume.targetRole,
      targetCompany: resume.targetCompany,
      updatedAt: resume.updatedAt.toISOString(),
    });
    if (sources.length === MAX_SOURCES_RETURNED) break;
  }

  return NextResponse.json(
    { sources },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
