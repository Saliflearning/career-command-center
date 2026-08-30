/**
 * POST /api/resume/[id]/jd
 *
 * Saves the job description, target role, and target company to the Resume record,
 * then runs the full 14-step pipeline in the background via waitUntil().
 *
 * The frontend does NOT wait for the pipeline to finish — it polls
 * GET /api/resume/[id]/status to track progress.
 *
 * Body: { jdText: string, targetRole: string, targetCompany?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { waitUntil } from "@vercel/functions";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { hasActivePipelineClaim } from "@/lib/resume/pipeline-claim";
import { runPipeline } from "@/agents/orchestrator";

// Extend function timeout — Vercel Hobby plan caps at 60s, Pro at 300s.
// The pipeline itself runs via waitUntil() so the HTTP response returns
// immediately; this timeout only covers the jd save + pipeline trigger,
// which completes well within 60s.
export const maxDuration = 60;

const MIN_JD_CHARS = 50;
const MAX_JD_CHARS = 40_000;
const MAX_ROLE_CHARS = 160;
const MAX_COMPANY_CHARS = 160;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  // Ownership check
  const resume = await db.resume.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      state: true,
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

  // If pipeline already running or complete, reject.
  // FAILED state is explicitly allowed for re-trigger.
  const blockedStates = new Set([
    "GENERATING",
    "QA_REVIEWED",
    "USER_EDITING",
    "EXPORTED",
    "TRACKED",
  ]);
  if (blockedStates.has(resume.state)) {
    return NextResponse.json(
      {
        error: `Pipeline already running or complete (state: ${resume.state}). Refresh to view results.`,
      },
      { status: 409 }
    );
  }
  if (hasActivePipelineClaim(resume)) {
    return NextResponse.json(
      { error: "Generation is already queued. Refresh to view its progress." },
      { status: 409 }
    );
  }

  // Parse and validate body
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

  if (body.targetRole !== undefined && typeof body.targetRole !== "string") {
    return NextResponse.json(
      { error: "targetRole must be a string." },
      { status: 400 }
    );
  }

  const targetRole = typeof body.targetRole === "string" ? body.targetRole.trim() : "";
  if (!targetRole) {
    return NextResponse.json(
      { error: "targetRole is required" },
      { status: 400 }
    );
  }
  if (targetRole.length > MAX_ROLE_CHARS) {
    return NextResponse.json(
      { error: "targetRole is too long" },
      { status: 400 }
    );
  }

  if (body.jdText !== undefined && typeof body.jdText !== "string") {
    return NextResponse.json(
      { error: "jdText must be a string." },
      { status: 400 }
    );
  }
  const jdText = typeof body.jdText === "string" ? body.jdText.trim() : "";
  if (jdText.length < MIN_JD_CHARS) {
    return NextResponse.json(
      { error: "Paste more of the job description before generating." },
      { status: 400 }
    );
  }
  if (jdText.length > MAX_JD_CHARS) {
    return NextResponse.json(
      { error: "Job description is too long. Keep it under 40,000 characters." },
      { status: 400 }
    );
  }

  if (
    body.targetCompany !== undefined &&
    body.targetCompany !== null &&
    typeof body.targetCompany !== "string"
  ) {
    return NextResponse.json(
      { error: "targetCompany must be a string when provided." },
      { status: 400 }
    );
  }
  const targetCompany =
    typeof body.targetCompany === "string" ? body.targetCompany.trim() || null : null;
  if (targetCompany && targetCompany.length > MAX_COMPANY_CHARS) {
    return NextResponse.json(
      { error: "targetCompany is too long" },
      { status: 400 }
    );
  }

  // Optional generation controls must be explicit and supported. Silently
  // discarding a bad value would still claim the resume and start paid work.
  const validTones = ["Executive", "Technical", "Leadership-first", "Startup"];
  const validStructures = ["Hybrid Executive", "Chronological", "Functional", "Compact"];

  if (body.tone !== undefined && typeof body.tone !== "string") {
    return NextResponse.json(
      { error: "tone must be a string when provided." },
      { status: 400 }
    );
  }
  if (typeof body.tone === "string" && !validTones.includes(body.tone)) {
    return NextResponse.json(
      { error: `tone must be one of: ${validTones.join(", ")}.` },
      { status: 400 }
    );
  }

  if (body.structure !== undefined && typeof body.structure !== "string") {
    return NextResponse.json(
      { error: "structure must be a string when provided." },
      { status: 400 }
    );
  }
  if (typeof body.structure === "string" && !validStructures.includes(body.structure)) {
    return NextResponse.json(
      { error: `structure must be one of: ${validStructures.join(", ")}.` },
      { status: 400 }
    );
  }

  const tone = typeof body.tone === "string" ? body.tone : null;
  const structure = typeof body.structure === "string" ? body.structure : null;

  // Persist the request and atomically claim the pipeline. Matching the exact
  // timestamps prevents two Generate clicks that read the same resume state
  // from both starting paid background work.
  const pipelineStartedAt = new Date();
  const claim = await db.resume.updateMany({
    where: {
      id,
      userId: session.user.id,
      state: resume.state,
      pipelineStartedAt: resume.pipelineStartedAt,
      pipelineFinishedAt: resume.pipelineFinishedAt,
    },
    data: {
      jdText,
      targetRole,
      targetCompany,
      pipelineStartedAt,
      pipelineFinishedAt: null,
      ...(tone && { tone }),
      ...(structure && { structure }),
    },
  });
  if (claim.count !== 1) {
    return NextResponse.json(
      { error: "Generation was already started in another request. Refresh to view its progress." },
      { status: 409 }
    );
  }

  // Run the pipeline in the background, but keep this invocation alive
  // until it finishes. Plain fire-and-forget is NOT reliable on Vercel:
  // the function can be frozen the moment the response is sent, silently
  // killing the pipeline mid-run. waitUntil() extends the function's
  // lifetime (up to maxDuration) while the response returns immediately,
  // and the client polls /status to track progress.
  const resumeId = id;
  waitUntil(
    runPipeline(resumeId).catch((err) => {
      console.error(
        JSON.stringify({
          event: "pipeline_trigger_error",
          resumeId,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        })
      );
    })
  );

  return NextResponse.json({ success: true, resumeId });
}
