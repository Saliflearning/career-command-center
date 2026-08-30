import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { extractResumeText } from "@/agents/intake";
import { db } from "@/lib/db/client";
import { analyzeResumeAgainstJob } from "@/lib/resume/scan-analysis";
import { applySemanticMatching } from "@/lib/resume/semantic-match";
import {
  formatCareerMemoryAsResumeText,
  getCareerMemoryEvidenceSources,
  parseCareerMemorySnapshot,
  parseSavedSourceHeader,
} from "@/lib/resume/saved-source";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SOURCE_PROFILE_SECTION = "source_profile";
const RESUME_HEADER_SECTION = "resume_header";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.headers.get("content-type")?.includes("application/json")) {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 }
      );
    }
    const body = rawBody as Record<string, unknown>;
    if (body.sourceResumeId !== undefined && typeof body.sourceResumeId !== "string") {
      return NextResponse.json(
        { error: "sourceResumeId must be a string." },
        { status: 400 }
      );
    }
    if (body.jobDescription !== undefined && typeof body.jobDescription !== "string") {
      return NextResponse.json(
        { error: "jobDescription must be a string." },
        { status: 400 }
      );
    }
    const sourceResumeId =
      typeof body.sourceResumeId === "string" ? body.sourceResumeId.trim() : "";
    const jobDescription =
      typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";

    const jobError = validateJobDescription(jobDescription);
    if (jobError) return jobError;
    if (!sourceResumeId) {
      return NextResponse.json({ error: "Choose a saved resume first." }, { status: 400 });
    }

    const source = await db.resume.findFirst({
      where: { id: sourceResumeId, userId: session.user.id },
      select: {
        sections: {
          where: { name: { in: [SOURCE_PROFILE_SECTION, RESUME_HEADER_SECTION] } },
          select: { name: true, content: true },
        },
      },
    });
    if (!source) {
      return NextResponse.json({ error: "Saved resume not found." }, { status: 404 });
    }

    const profile = parseCareerMemorySnapshot(
      source.sections.find((section) => section.name === SOURCE_PROFILE_SECTION)?.content
    );
    if (!profile || profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: "This saved resume has no reusable source snapshot." },
        { status: 422 }
      );
    }

    const header = parseSavedSourceHeader(
      source.sections.find((section) => section.name === RESUME_HEADER_SECTION)?.content
    );
    const resumeText = formatCareerMemoryAsResumeText(profile, header);
    if (resumeText.length < 50) {
      return NextResponse.json(
        { error: "This saved resume has too little source evidence to scan." },
        { status: 422 }
      );
    }

    const savedAnalysis = await applySemanticMatching(
      analyzeResumeAgainstJob(resumeText, jobDescription),
      resumeText
    );
    return NextResponse.json({
      ...savedAnalysis,
      evidenceSources: getCareerMemoryEvidenceSources(profile),
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Scan body must be valid form data." },
      { status: 400 }
    );
  }
  const file = formData.get("file");
  const rawJobDescription = formData.get("jobDescription");
  if (rawJobDescription !== null && typeof rawJobDescription !== "string") {
    return NextResponse.json(
      { error: "jobDescription must be a string." },
      { status: 400 }
    );
  }
  const jobDescription = rawJobDescription?.trim() ?? "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a resume file first." }, { status: 400 });
  }
  const normalizedName = file.name.toLowerCase();
  const isDocx = file.type === DOCX_MIME || normalizedName.endsWith(".docx");
  if (!ACCEPTED_TYPES.has(file.type) && !isDocx) {
    return NextResponse.json({ error: "Only PDF and DOCX files are supported." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Resume file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10 MB limit." }, { status: 400 });
  }
  const jobError = validateJobDescription(jobDescription);
  if (jobError) return jobError;

  try {
    const resumeText = await extractResumeText(
      Buffer.from(await file.arrayBuffer()),
      isDocx ? DOCX_MIME : "application/pdf"
    );
    if (resumeText.length < 50) {
      return NextResponse.json(
        { error: "The file has no readable text. Paste the resume text instead." },
        { status: 422 }
      );
    }

    return NextResponse.json(
      await applySemanticMatching(
        analyzeResumeAgainstJob(resumeText, jobDescription),
        resumeText
      )
    );
  } catch (error) {
    console.error("resume_scan_failed", error);
    return NextResponse.json(
      { error: "We could not read this file. Try paste mode or another document." },
      { status: 422 }
    );
  }
}

function validateJobDescription(jobDescription: string) {
  if (jobDescription.length < 50 || jobDescription.length > 40_000) {
    return NextResponse.json(
      { error: "Paste a complete job description." },
      { status: 400 }
    );
  }
  return null;
}
