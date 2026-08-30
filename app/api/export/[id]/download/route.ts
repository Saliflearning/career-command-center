import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";
import { storage } from "@/lib/storage/adapter";

function safePdfFilename(value: string | null): string {
  const stem = (value ?? "resume")
    .replace(/\.pdf$/i, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .trim()
    .replace(/[\s_-]+/g, "_")
    .slice(0, 120);
  return `${stem || "resume"}.pdf`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const resume = await db.resume.findFirst({
    where: { id, userId: session.user.id },
    select: { state: true },
  });
  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isResumeExportableState(resume.state)) {
    return NextResponse.json(
      { error: "Render the completed resume before downloading it." },
      { status: 409 }
    );
  }

  const storagePath = `${session.user.id}/${id}/export.pdf`;
  try {
    const pdf = await storage.download(storagePath);
    const filename = safePdfFilename(request.nextUrl.searchParams.get("filename"));
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The exported PDF is not available. Render it again and retry." },
      { status: 404 }
    );
  }
}
