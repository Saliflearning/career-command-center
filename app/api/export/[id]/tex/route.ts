/**
 * GET /api/export/[id]/tex
 *
 * Downloads the pipeline-generated LaTeX source (CLAUDE.md §9 template) for
 * the signed-in owner's resume. This is the manual escape hatch of the LaTeX
 * export path: even with no XeLaTeX worker deployed, the user can compile the
 * exact intended template themselves (Overleaf, local TeX). Auth-scoped,
 * exportable states only, and only when the generation run produced LaTeX.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";

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
    where: { id, userId: session.user.id },
    select: { latexSource: true, state: true, targetRole: true },
  });

  if (!resume) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isResumeExportableState(resume.state)) {
    return NextResponse.json(
      {
        error: `Cannot export from state "${resume.state}". Finish or retry generation before exporting.`,
      },
      { status: 409 }
    );
  }
  if (!resume.latexSource?.trim()) {
    return NextResponse.json(
      { error: "No LaTeX source is available for this resume yet. Regenerate to produce one." },
      { status: 404 }
    );
  }

  const safeRole = (resume.targetRole || "resume")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "resume";

  return new NextResponse(resume.latexSource, {
    status: 200,
    headers: {
      "Content-Type": "application/x-tex; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeRole}.tex"`,
      "Cache-Control": "no-store",
    },
  });
}
