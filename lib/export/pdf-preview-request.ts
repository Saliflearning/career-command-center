export interface PdfPreviewResult {
  pdfUrl: string;
  fallback: boolean;
  renderer: "latex" | "structured" | null;
  pageCount: number | null;
}

type PreviewFetch = (
  input: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "json">>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

export async function requestPdfPreview(
  resumeId: string,
  request: PreviewFetch = fetch
): Promise<PdfPreviewResult> {
  const response = await request(`/api/export/${encodeURIComponent(resumeId)}`, {
    method: "POST",
  });
  const body = asRecord(await response.json().catch(() => null));

  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : "PDF preview could not be rendered."
    );
  }

  if (typeof body.pdfUrl !== "string" || !body.pdfUrl.trim()) {
    throw new Error("Export completed without a PDF URL.");
  }

  return {
    pdfUrl: body.pdfUrl,
    fallback: body.fallback === true,
    renderer:
      body.renderer === "latex" || body.renderer === "structured"
        ? body.renderer
        : null,
    pageCount:
      typeof body.pageCount === "number" && Number.isFinite(body.pageCount)
        ? body.pageCount
        : null,
  };
}
