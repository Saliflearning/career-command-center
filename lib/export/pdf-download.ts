import {
  requestPdfPreview,
  type PdfPreviewResult,
} from "./pdf-preview-request";

type PreviewRequest = (resumeId: string) => Promise<PdfPreviewResult>;
type DownloadStarter = (url: string, filename: string) => void;

function normalizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 120) || "Resume";
}

export function buildPdfDownloadUrl(resumeId: string, filename: string): string {
  return `/api/export/${encodeURIComponent(resumeId)}/download?filename=${encodeURIComponent(
    normalizeFilename(filename)
  )}`;
}

export function startPdfAttachmentDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = `${normalizeFilename(filename)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function renderAndDownloadPdf({
  resumeId,
  filename,
  requestPreview = requestPdfPreview,
  startDownload = startPdfAttachmentDownload,
}: {
  resumeId: string;
  filename: string;
  requestPreview?: PreviewRequest;
  startDownload?: DownloadStarter;
}): Promise<PdfPreviewResult> {
  const normalizedFilename = normalizeFilename(filename);
  const result = await requestPreview(resumeId);

  startDownload(
    buildPdfDownloadUrl(resumeId, normalizedFilename),
    `${normalizedFilename}.pdf`
  );

  return result;
}
