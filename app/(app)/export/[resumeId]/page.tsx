"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Download,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  FileText,
  RefreshCw,
} from "lucide-react";
import { clsx } from "clsx";
import {
  classifyResumeContentResponse,
  type ResumeContent,
} from "@/lib/resume/content-contract";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";
import {
  closePdfPreview,
  reservePdfPreview,
  showPdfPreview,
} from "@/lib/export/pdf-preview-navigation";
import {
  requestPdfPreview,
  type PdfPreviewResult,
} from "@/lib/export/pdf-preview-request";
import {
  buildPdfDownloadUrl,
  startPdfAttachmentDownload,
} from "@/lib/export/pdf-download";

const formatOptions = [
  { id: "pdf", label: "PDF", desc: "Best for sharing & printing", recommended: true, enabled: true },
  { id: "tex", label: "LaTeX", desc: "Compile the source yourself", enabled: true },
  { id: "docx", label: "DOCX", desc: "Coming soon", enabled: false },
];

export default function ExportPage() {
  const { resumeId } = useParams<{ resumeId: string }>();
  const router = useRouter();

  const [content, setContent] = useState<ResumeContent | null>(null);
  const [contentStatus, setContentStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [filename, setFilename] = useState("Resume");
  const [format, setFormat] = useState("pdf");
  const [exporting, setExporting] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewResult | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRequestFor = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      setContentStatus("loading");
      setAvailabilityMessage(null);

      try {
        const response = await fetch(`/api/resume/${resumeId}/content`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        const result = classifyResumeContentResponse(response.status, payload);

        if (result.kind === "unauthorized") {
          router.push(
            `/signin?callbackUrl=${encodeURIComponent(`/export/${resumeId}`)}`
          );
          return;
        }

        if (result.kind !== "ready") {
          const failed = result.kind === "processing" && result.state === "FAILED";
          setAvailabilityMessage(
            failed
              ? "This resume failed before a document was ready. Return to the workspace to retry generation."
              : result.kind === "processing"
                ? result.message ?? "This resume is still being generated."
                : result.message
          );
          setContentStatus("unavailable");
          return;
        }

        if (!isResumeExportableState(result.data.state)) {
          setAvailabilityMessage(
            "This resume is not ready for export. Finish generation or review it in the workspace first."
          );
          setContentStatus("unavailable");
          return;
        }

        setContent(result.data);
        const namePart = result.data.candidateName?.replace(/\s+/g, "_") ?? "Resume";
        const rolePart = result.data.targetRole.replace(/\s+/g, "_").slice(0, 30);
        setFilename(
          `${namePart}_${rolePart}`.replace(/_{2,}/g, "_").replace(/_$/, "")
        );
        setContentStatus("ready");
      } catch {
        setAvailabilityMessage(
          "Resume export status could not be loaded. Return to the workspace and try again."
        );
        setContentStatus("unavailable");
      }
    }

    void load();
  }, [resumeId, router]);

  const renderPdfPreview = useCallback(async (force = false) => {
    if (!content || !isResumeExportableState(content.state)) return;
    if (!force && previewRequestFor.current === resumeId) return;

    previewRequestFor.current = resumeId;
    setPreviewStatus("loading");
    setPreviewError(null);
    setError(null);

    try {
      const result = await requestPdfPreview(resumeId);
      setPdfPreview(result);
      setPreviewStatus("ready");
      setNotice(
        result.fallback
          ? "The template renderer was unavailable, so this preview uses the verified structured PDF renderer."
          : null
      );
    } catch (previewFailure) {
      setPdfPreview(null);
      setPreviewStatus("error");
      setPreviewError(
        previewFailure instanceof Error
          ? previewFailure.message
          : "PDF preview could not be rendered."
      );
    }
  }, [content, resumeId]);

  useEffect(() => {
    if (contentStatus === "ready" && content) {
      void renderPdfPreview();
    }
  }, [content, contentStatus, renderPdfPreview]);

  const pdfDownloadUrl = buildPdfDownloadUrl(resumeId, filename || "resume");

  function startPdfDownload() {
    startPdfAttachmentDownload(pdfDownloadUrl, filename || "resume");
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }

  function handleOpenPreview() {
    if (!pdfPreview || previewStatus !== "ready") return;
    const previewWindow = reservePdfPreview(() => window.open("", "_blank"));
    try {
      showPdfPreview(previewWindow, pdfPreview.pdfUrl, (url) => window.location.assign(url));
    } catch (previewFailure) {
      closePdfPreview(previewWindow);
      setError(
        previewFailure instanceof Error
          ? previewFailure.message
          : "PDF preview could not be opened."
      );
    }
  }

  async function handleDownload() {
    if (exporting || !content || !isResumeExportableState(content.state)) return;
    if (format === "pdf" && previewStatus !== "ready") return;

    // LaTeX source download: a plain file response, no preview window needed.
    if (format === "tex") {
      setExporting(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/export/${resumeId}/tex`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "LaTeX download failed");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${filename || "resume"}.tex`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setDownloaded(true);
        setTimeout(() => setDownloaded(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "LaTeX download failed. Please try again.");
      } finally {
        setExporting(false);
      }
      return;
    }

    setExporting(true);
    setError(null);

    try {
      startPdfDownload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  if (contentStatus !== "ready" || !content) {
    return (
      <ExportAvailability
        resumeId={resumeId}
        loading={contentStatus === "loading"}
        message={availabilityMessage}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="fixed top-0 left-0 md:left-56 right-0 h-14 bg-surface border-b border-outline-variant/50 flex items-center justify-between px-6 z-40">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">Export Resume</h1>
          <p className="text-xs text-on-surface-variant">
            {content
              ? `${content.candidateName ?? "Your resume"} → ${content.targetRole}${content.targetCompany ? ` at ${content.targetCompany}` : ""}`
              : "Review your optimized document for export."}
          </p>
        </div>
        <div className="flex items-center gap-3" />
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-20 sm:px-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Resume preview — left panel */}
          <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest shadow-sm">
            <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-container text-on-surface-variant">
                  <FileText size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-on-surface">Final PDF preview</h2>
                  <p className="text-xs text-on-surface-variant">
                    This is the exact artifact opened from the export action.
                  </p>
                </div>
              </div>
              {pdfPreview && (
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  {pdfPreview.pageCount && (
                    <span>{pdfPreview.pageCount} page{pdfPreview.pageCount === 1 ? "" : "s"}</span>
                  )}
                  {pdfPreview.renderer && (
                    <span className="rounded-full bg-surface-container px-2 py-1 capitalize">
                      {pdfPreview.renderer} renderer
                    </span>
                  )}
                </div>
              )}
              <div
                data-testid="mobile-pdf-actions"
                className="grid w-full grid-cols-2 gap-2 sm:hidden"
              >
                <button
                  type="button"
                  onClick={startPdfDownload}
                  disabled={previewStatus !== "ready"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-on-surface px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant"
                >
                  {previewStatus === "loading" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  {previewStatus === "ready" ? "Download PDF" : "Preparing PDF"}
                </button>
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  disabled={previewStatus !== "ready"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-lowest px-3 text-sm font-semibold text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ExternalLink size={16} />
                  Open preview
                </button>
              </div>
            </div>

            <div
              className="relative min-h-[240px] bg-surface-container-low sm:min-h-[720px]"
              aria-busy={previewStatus === "loading"}
            >
              {(previewStatus === "idle" || previewStatus === "loading") && (
                <div className="absolute inset-0 grid place-items-center p-8 text-center">
                  <div>
                    <Loader2 className="mx-auto animate-spin text-secondary" size={28} />
                    <p className="mt-4 text-sm font-semibold text-on-surface">Rendering the final PDF</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      The document is being checked before it appears here.
                    </p>
                  </div>
                </div>
              )}

              {previewStatus === "error" && (
                <div className="absolute inset-0 grid place-items-center p-8 text-center">
                  <div className="max-w-md">
                    <AlertCircle className="mx-auto text-error" size={30} />
                    <p className="mt-4 text-sm font-semibold text-on-surface">Preview could not be rendered</p>
                    <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                      {previewError}
                    </p>
                    <button
                      type="button"
                      onClick={() => void renderPdfPreview(true)}
                      className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant bg-surface-lowest px-4 text-sm font-semibold text-on-surface hover:bg-surface-container"
                    >
                      <RefreshCw size={15} />
                      Retry preview
                    </button>
                  </div>
                </div>
              )}

              {previewStatus === "ready" && pdfPreview && (
                <>
                  <div className="absolute inset-0 grid place-items-center p-6 text-center sm:hidden">
                    <div className="max-w-xs">
                      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary/10 text-secondary">
                        <Check size={24} />
                      </span>
                      <p className="mt-4 text-base font-semibold text-on-surface">Your PDF is ready</p>
                      <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                        Download the verified document above, or open the full preview in a separate tab.
                      </p>
                    </div>
                  </div>
                  <iframe
                    data-testid="pdf-preview-frame"
                    src={pdfPreview.pdfUrl}
                    title={`${content.candidateName ?? "Candidate"} resume PDF preview`}
                    className="hidden h-[calc(100vh-11rem)] min-h-[720px] w-full bg-white sm:block"
                  />
                </>
              )}
            </div>
          </section>

          {/* Settings panel — right */}
          <div className="space-y-5 lg:sticky lg:top-20">
            {/* Main card */}
            <div className="bg-surface-lowest rounded-xl p-6 border border-outline-variant shadow-sm">
              <h3 className="text-xl font-semibold text-on-surface mb-5">Export Settings</h3>

              {/* Filename */}
              <div className="space-y-1.5 mb-5">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Filename
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    className="w-full border border-outline-variant rounded-lg px-4 pr-12 py-3 text-sm text-on-surface focus:outline-none focus:border-secondary transition-colors bg-white"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm font-semibold">
                    .{format}
                  </span>
                </div>
              </div>

              {/* Format */}
              <div className="space-y-2 mb-5">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-3">
                  Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {formatOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => opt.enabled && setFormat(opt.id)}
                      disabled={!opt.enabled}
                      className={clsx(
                        "p-3 rounded-lg border-2 text-center transition-all",
                        !opt.enabled
                          ? "border-outline-variant/50 opacity-50 cursor-default"
                          : format === opt.id
                          ? "border-secondary bg-secondary/5"
                          : "border-outline-variant hover:border-secondary"
                      )}
                    >
                      <p className={clsx("text-xs font-bold", !opt.enabled ? "text-on-surface-variant" : format === opt.id ? "text-secondary" : "text-on-surface")}>
                        {opt.label}
                      </p>
                      {opt.recommended && (
                        <span className="text-[9px] text-secondary font-semibold">Recommended</span>
                      )}
                      {!opt.enabled && (
                        <span className="text-[9px] text-on-surface-variant/60">Coming soon</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-4 border-t border-b border-outline-variant mb-5">
                <div>
                  <p className="text-sm font-semibold text-on-surface">ATS-safe export</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Clean text structure for job portals
                  </p>
                </div>
                <Check size={18} className="text-secondary" />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div className="text-sm text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2.5 mb-4">
                  {notice}
                </div>
              )}

              {/* Download button */}
              <button
                onClick={handleDownload}
                disabled={exporting || (format === "pdf" && previewStatus !== "ready")}
                className={clsx(
                  "w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-semibold text-sm transition-all",
                  downloaded
                    ? "bg-green-600 text-white"
                    : exporting || (format === "pdf" && previewStatus !== "ready")
                    ? "bg-surface-container text-on-surface-variant cursor-not-allowed"
                    : "bg-on-surface text-white hover:opacity-90"
                )}
              >
                {exporting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Rendering PDF...
                  </>
                ) : downloaded ? (
                  <>
                    <Check size={16} />
                    Download started
                  </>
                ) : format === "pdf" && previewStatus === "error" ? (
                  <>
                    <AlertCircle size={16} />
                    Fix resume before export
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    {format === "pdf" ? "Download PDF" : `Download ${format.toUpperCase()}`}
                  </>
                )}
              </button>
            </div>

            {/* Links */}
            <div className="flex gap-3">
              <Link
                href={`/workspace/${resumeId}`}
                className="flex-1 py-2.5 border border-outline-variant text-on-surface text-sm font-semibold rounded-lg hover:bg-surface-container transition-colors text-center"
              >
                ← Back to Edit
              </Link>
              <Link
                href="/tracker"
                className="flex-1 py-2.5 bg-secondary/10 text-secondary text-sm font-semibold rounded-lg hover:bg-secondary/20 transition-colors text-center"
              >
                Track Application
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ExportAvailability({
  resumeId,
  loading,
  message,
}: {
  resumeId: string;
  loading: boolean;
  message: string | null;
}) {
  return (
    <main className="min-h-screen bg-background">
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center border-b border-outline-variant/50 bg-surface px-6 md:left-56">
        <h1 className="text-lg font-semibold text-on-surface">Export Resume</h1>
      </header>
      <div className="mx-auto grid min-h-screen max-w-3xl place-items-center px-6 pt-14">
        <section className="w-full rounded-xl border border-outline-variant/40 bg-surface-lowest p-8 text-center shadow-sm">
          {loading ? (
            <>
              <Loader2 className="mx-auto animate-spin text-on-surface-variant" size={28} />
              <h2 className="mt-4 text-lg font-semibold text-on-surface">
                Checking export readiness
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                Loading the saved resume and its generation state.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="mx-auto text-error" size={30} />
              <h2 className="mt-4 text-lg font-semibold text-on-surface">
                Resume is not ready to export
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-on-surface-variant">
                {message ?? "Open the workspace to finish this resume before exporting."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href={`/workspace/${resumeId}`}
                  className="inline-flex h-10 items-center rounded-lg bg-on-surface px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  Return to workspace
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-10 items-center rounded-lg border border-outline-variant px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-low"
                >
                  Resume library
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
