/**
 * POST /api/export/[id]
 *
 * Renders the current canonical structured resume, then requires a real visual
 * QA pass before publishing it. Stale generated artifacts are never preferred
 * over the content the user currently sees in the editor.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import {
  buildStructuredResumePdf,
  StructuredResumeContentError,
  StructuredResumeOverflowError,
} from "@/lib/export/structured-resume-pdf";
import {
  InvalidQuickResumeArtifactError,
  loadStructuredResumeSource,
} from "@/lib/export/structured-resume-input";
import { runVisualQA } from "@/agents/visual-qa";
import { expectedSectionsFor } from "@/lib/resume/visual-quality-gate";
import { storage } from "@/lib/storage/adapter";
import { transition, ResumeState } from "@/lib/state/machine";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let source;
  try {
    source = await loadStructuredResumeSource(id, session.user.id);
  } catch (error) {
    if (error instanceof InvalidQuickResumeArtifactError) {
      return NextResponse.json(
        { error: "This saved Quick Resume is damaged and cannot be exported safely." },
        { status: 422 }
      );
    }
    throw error;
  }

  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isResumeExportableState(source.state)) {
    return NextResponse.json(
      {
        error: `Cannot export from state "${source.state}". Finish or retry generation before exporting.`,
      },
      { status: 409 }
    );
  }

  const storagePath = `${session.user.id}/${id}/export.pdf`;
  const qaContext = {
    roleType: source.input.roleType,
    candidateName: source.input.candidate.name,
    expectedSections: expectedSectionsFor(source.input),
  };

  let structuredRendered;
  try {
    structuredRendered = buildStructuredResumePdf(source.input);
  } catch (error) {
    if (error instanceof StructuredResumeOverflowError) {
      return NextResponse.json(
        {
          error:
            "This resume contains more content than can fit on one page without removing information. Shorten it in the editor and try again.",
          code: error.code,
        },
        { status: 422 }
      );
    }
    if (error instanceof StructuredResumeContentError) {
      return NextResponse.json(
        {
          error:
            "This resume contains text that cannot be exported without changing it. Review that text in the editor and try again.",
          code: error.code,
        },
        { status: 422 }
      );
    }
    console.error(JSON.stringify({
      event: "structured_export_error",
      resumeId: id,
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return NextResponse.json(
      {
        error:
          "The resume could not be formatted safely for export. Please review the content and try again.",
      },
      { status: 422 }
    );
  }

  let visualQA: Awaited<ReturnType<typeof runVisualQA>>;
  try {
    visualQA = await runVisualQA(
      id,
      storagePath,
      structuredRendered.pdf,
      qaContext
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: "export_visual_qa_unavailable",
      resumeId: id,
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return NextResponse.json(
      {
        error: "The final visual integrity check could not be completed. Please try again.",
        code: "VISUAL_QA_UNAVAILABLE",
      },
      { status: 422 }
    );
  }
  if (!visualQA.result.passed) {
    return NextResponse.json(
      {
        error: "The exported PDF did not pass the final visual integrity check.",
        checks: visualQA.result.checks,
      },
      { status: 422 }
    );
  }

  const rendered = {
    pdf: structuredRendered.pdf,
    pageCount: structuredRendered.pageCount,
    density: structuredRendered.density ?? null,
  };

  let pdfUrl: string;
  try {
    pdfUrl = await storage.upload(storagePath, rendered.pdf, "application/pdf");
  } catch (uploadError) {
    console.error(JSON.stringify({
      event: "export_pdf_upload_error",
      resumeId: id,
      errorType: uploadError instanceof Error ? uploadError.name : "unknown",
    }));
    return NextResponse.json(
      { error: "The exported PDF could not be stored. Please try again." },
      { status: 502 }
    );
  }

  console.log(JSON.stringify({
    event: "export_rendered",
    resumeId: id,
    renderer: "structured",
    pageCount: rendered.pageCount,
  }));

  // The preview screenshot is a diagnostic artifact. Its upload must never
  // block a user's export (CLAUDE.md §11). A real user's export failed on
  // 2026-07-16 when the storage bucket rejected image/png here.
  if (visualQA.screenshot.length > 0) {
    try {
      await storage.upload(
        `${session.user.id}/${id}/export-preview.png`,
        visualQA.screenshot,
        "image/png"
      );
    } catch (previewError) {
      console.warn(JSON.stringify({
        event: "export_preview_upload_skipped",
        resumeId: id,
        reason: previewError instanceof Error ? previewError.message : "unknown",
      }));
    }
  }

  await db.resume.update({
    where: { id },
    data: {
      pdfUrl,
      pageCount: rendered.pageCount,
      exportedAt: new Date(),
    },
  });

  if (source.state !== "EXPORTED" && source.state !== "TRACKED") {
    try {
      await transition(id, ResumeState.EXPORTED);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "export_state_transition_error",
          resumeId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  return NextResponse.json({
    pdfUrl,
    fallback: false,
    renderer: "structured",
    pageCount: rendered.pageCount,
    density: rendered.density,
    visualQa: "passed",
  });
}
