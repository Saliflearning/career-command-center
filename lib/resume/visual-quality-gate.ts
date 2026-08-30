import { runVisualQA } from "@/agents/visual-qa";
import { db } from "@/lib/db/client";
import { loadStructuredResumeSource } from "@/lib/export/structured-resume-input";
import {
  buildStructuredResumePdf,
  type StructuredResumeExportInput,
} from "@/lib/export/structured-resume-pdf";
import { storage } from "@/lib/storage/adapter";

export const VISUAL_QA_SECTION = "visual_qa";

/**
 * Build, screenshot, inspect, and persist a private visual QA artifact before
 * the generation pipeline exposes a resume as ready for editing.
 */
export async function runResumeVisualQualityGate(resumeId: string) {
  const source = await loadStructuredResumeSource(resumeId);
  if (!source) throw new Error(`Visual QA source not found for resume ${resumeId}`);

  const rendered = buildStructuredResumePdf(source.input);
  const pdfPath = `${source.userId}/${resumeId}/quality/final-preview.pdf`;
  const screenshotPath = `${source.userId}/${resumeId}/quality/final-preview.png`;

  // Diagnostic artifact: a storage rejection for the preview PDF must NOT fail
  // the whole gate. Visual QA runs against the in-memory rendered PDF, and the
  // resume content is already complete — a failed cache upload must never
  // discard a finished, QA-passable resume (spec Section 11; error state A17-3,
  // "Your resume is ready, but the PDF preview failed"). Mirrors the
  // screenshot-upload handling below.
  let pdfUrl = "";
  let pdfStored = false;
  try {
    pdfUrl = await storage.upload(pdfPath, rendered.pdf, "application/pdf");
    pdfStored = true;
  } catch (pdfError) {
    console.warn(JSON.stringify({
      event: "visual_qa_pdf_upload_skipped",
      resumeId,
      reason: pdfError instanceof Error ? pdfError.message : "unknown",
    }));
  }
  const visualQA = await runVisualQA(resumeId, pdfUrl, rendered.pdf, {
    roleType: source.input.roleType,
    candidateName: source.input.candidate.name,
    expectedSections: expectedSectionsFor(source.input),
  });

  let screenshotUrl: string | null = null;
  if (visualQA.screenshot.length > 0) {
    // Diagnostic artifact: a storage rejection here must not fail the whole
    // gate — the checks below still run against the rendered PDF.
    try {
      screenshotUrl = await storage.upload(
        screenshotPath,
        visualQA.screenshot,
        "image/png"
      );
      visualQA.result.screenshotUrl = screenshotUrl;
    } catch (screenshotError) {
      console.warn(JSON.stringify({
        event: "visual_qa_screenshot_upload_skipped",
        resumeId,
        reason: screenshotError instanceof Error ? screenshotError.message : "unknown",
      }));
    }
  }

  const persisted = {
    ...visualQA.result,
    pdfPath: pdfStored ? pdfPath : null,
    screenshotPath: screenshotUrl ? screenshotPath : null,
    density: rendered.density,
    omittedContent: rendered.omittedContent,
  };
  const content = JSON.stringify(persisted);
  const existing = await db.resumeSection.findFirst({
    where: { resumeId, name: VISUAL_QA_SECTION },
    select: { id: true },
  });
  if (existing) {
    await db.resumeSection.update({
      where: { id: existing.id },
      data: { content, visible: false, sortOrder: 998 },
    });
  } else {
    await db.resumeSection.create({
      data: {
        resumeId,
        name: VISUAL_QA_SECTION,
        content,
        visible: false,
        sortOrder: 998,
      },
    });
  }

  await db.resume.update({
    where: { id: resumeId },
    data: { pageCount: rendered.pageCount },
  });

  if (!visualQA.result.passed) {
    const failures = Object.entries(visualQA.result.checks)
      .filter(([, check]) => check.status === "failed")
      .map(([name, check]) => `${name}: ${check.detail ?? "failed"}`);
    throw new Error(`Visual quality gate failed: ${failures.join("; ")}`);
  }

  return persisted;
}

export function expectedSectionsFor(input: StructuredResumeExportInput): string[] {
  const sections: string[] = [];
  if (input.summary) sections.push("Professional Summary");
  if (input.skills.length > 0) {
    sections.push(
      input.roleType === "TECHNICAL" || input.roleType === "DATA"
        ? "Technical Skills"
        : "Core Skills"
    );
  }
  if (input.jobs.length > 0) sections.push("Professional Experience");
  if (input.education.length > 0) sections.push("Education");
  if (input.certifications.length > 0) sections.push("Certifications");
  return sections;
}
