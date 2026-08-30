/**
 * GET /api/resume/[id]/status
 *
 * Returns the current pipeline state and a derived progress percentage.
 * Designed to be polled every 2–3 seconds from the generating screen.
 *
 * Response shape:
 * {
 *   state: ResumeState string,
 *   progressPercent: 0–100,
 *   label: human-readable step name,
 *   updatedAt: ISO 8601,
 *   pipelineStartedAt: ISO 8601 | null,
 *   pipelineFinishedAt: ISO 8601 | null,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { publicPipelineErrorMessage } from "@/lib/resume/pipeline-error";

interface StateInfo {
  progress: number;
  label: string;
}

const STATE_INFO: Record<string, StateInfo> = {
  UPLOADED:       { progress: 5,   label: "Preparing your resume..." },
  PARSED:         { progress: 15,  label: "Parsing document structure" },
  NORMALIZED:     { progress: 28,  label: "Normalizing career history" },
  VERIFIED:       { progress: 40,  label: "Verifying experience data" },
  JD_ANALYZED:    { progress: 55,  label: "Analyzing job requirements" },
  STRATEGY_READY: { progress: 65,  label: "Building tailoring strategy" },
  GENERATING:     { progress: 78,  label: "Writing tailored bullets" },
  QA_REVIEWED:    { progress: 95,  label: "Quality assurance complete" },
  USER_EDITING:   { progress: 100, label: "Ready for your review" },
  EXPORTED:       { progress: 100, label: "Exported" },
  TRACKED:        { progress: 100, label: "Tracked" },
  FAILED:         { progress: 0,   label: "Generation failed" },
};

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
    select: {
      id: true,
      userId: true,
      state: true,
      updatedAt: true,
      pipelineStartedAt: true,
      pipelineFinishedAt: true,
    },
  });

  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (resume.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const info = STATE_INFO[resume.state] ?? { progress: 0, label: "Unknown" };

  // For FAILED state, surface the stored pipeline error message so the UI
  // can show the user what actually went wrong instead of a generic message.
  let errorMessage: string | null = null;
  if (resume.state === "FAILED") {
    const errSection = await db.resumeSection.findFirst({
      where:  { resumeId: id, name: "pipeline_error" },
      select: { content: true },
    });
    if (errSection?.content) {
      errorMessage = publicPipelineErrorMessage(errSection.content);
    }
  }

  // Cache-control: tell the browser not to cache this — it changes frequently
  return NextResponse.json(
    {
      state: resume.state,
      progressPercent: info.progress,
      label: info.label,
      updatedAt: resume.updatedAt.toISOString(),
      pipelineStartedAt: resume.pipelineStartedAt?.toISOString() ?? null,
      pipelineFinishedAt: resume.pipelineFinishedAt?.toISOString() ?? null,
      errorMessage,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
