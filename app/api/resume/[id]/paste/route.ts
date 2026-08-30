/**
 * POST /api/resume/[id]/paste
 *
 * Stores a pasted existing resume as the source resume content.
 * This mirrors the upload flow: it prepares a Resume record, then the
 * workspace collects the target job description and starts generation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

const MIN_CHARS = 200;
const MAX_CHARS = 80_000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const resume = await db.resume.findUnique({
    where: { id },
    select: { id: true, userId: true, state: true },
  });
  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (resume.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  if (body.resumeText !== undefined && typeof body.resumeText !== "string") {
    return NextResponse.json(
      { error: "resumeText must be a string." },
      { status: 400 }
    );
  }

  const resumeText = typeof body.resumeText === "string" ? body.resumeText.trim() : "";
  if (resumeText.length < MIN_CHARS) {
    return NextResponse.json(
      { error: "Paste more of your resume so the workspace has enough context." },
      { status: 400 }
    );
  }
  if (resumeText.length > MAX_CHARS) {
    return NextResponse.json(
      { error: "Pasted resume is too long. Keep it under 80,000 characters." },
      { status: 400 }
    );
  }

  await db.resume.update({
    where: { id },
    data: {
      state: resume.state === "FAILED" ? "UPLOADED" : resume.state,
      sections: {
        deleteMany: { name: "source_resume" },
        create: {
          name: "source_resume",
          sortOrder: -1,
          visible: false,
          content: resumeText,
        },
      },
    },
  });

  return NextResponse.json({ success: true });
}
