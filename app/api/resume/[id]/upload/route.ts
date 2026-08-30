/**
 * POST /api/resume/[id]/upload
 *
 * Accepts a multipart form-data upload with a "file" field (PDF or DOCX).
 * Uploads the raw bytes to storage, then saves the signed URL to the Resume record.
 *
 * Must be called after POST /api/resume to have a valid resumeId.
 * Does NOT trigger the pipeline — call POST /api/resume/[id]/jd for that.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { storage } from "@/lib/storage/adapter";

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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
    select: { id: true, userId: true },
  });
  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (resume.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse untrusted multipart input without surfacing parser diagnostics.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload body must be valid form data." },
      { status: 400 }
    );
  }
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing "file" field in form data' },
      { status: 400 }
    );
  }

  const normalizedName = file.name.toLowerCase();
  if (!ACCEPTED_TYPES.has(file.type) && !normalizedName.endsWith(".docx")) {
    return NextResponse.json(
      { error: "Only PDF and DOCX files are supported" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 10 MB limit" },
      { status: 400 }
    );
  }

  // Upload to storage
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const isDocx =
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedName.endsWith(".docx");
  const mimeType = isDocx
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
  const extension = isDocx ? "docx" : "pdf";
  const storagePath = `${session.user.id}/${id}/original.${extension}`;

  let pdfUrl: string;
  try {
    pdfUrl = await storage.upload(storagePath, buffer, mimeType);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "upload_storage_error",
        resumeId: id,
        storagePath,
        fileSize: file.size,
        mimeType,
        error: message,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: "File upload failed. Try again." },
      { status: 500 }
    );
  }

  // Persist URL — state stays UPLOADED (pipeline not triggered yet)
  await db.resume.update({
    where: { id },
    data: { pdfUrl },
  });

  return NextResponse.json({ success: true, pdfUrl });
}
