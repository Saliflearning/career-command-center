"use client";

import { type CSSProperties, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CloudUpload,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  Loader2,
  Maximize2,
  Minimize2,
  ShieldCheck,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { withReturnTo } from "@/lib/navigation/return-path";
import { analyzeResumeAgainstJob, extractJobTermDetails } from "@/lib/resume/scan-analysis";
import { inferJobDetails } from "@/lib/resume/job-target-detection";
import { MATCH_SCORE_BANDS, matchScoreLabel } from "@/lib/resume/match-score";
import {
  classifyResumeContentResponse,
  sourceResumeTextFromSections,
} from "@/lib/resume/content-contract";
import {
  classifyResumeStatusResponse,
  type ResumeGenerationStatus,
} from "@/lib/resume/status-contract";
import {
  buildConfirmedEvidence,
  updateEvidenceDraft,
} from "@/lib/resume/evidence-draft";
import {
  formatCertificationLabel,
  formatEducationDateUtc,
  formatMonthYearRangeUtc,
} from "@/lib/resume/date-format";
import { draftToComparableText } from "@/lib/resume/generated-draft-text";
import {
  clampScore,
  scoreColor,
  scoreLabel,
  scoreDelta,
  isDraftReadableState,
} from "@/lib/resume/score-presentation";
import {
  DEFAULT_RESUME_PRESENTATION,
  resumeFontFamily,
  type ResumePresentation,
} from "@/lib/resume/presentation";
import { renderAndDownloadPdf } from "@/lib/export/pdf-download";

type EntryMode = "upload" | "paste" | "saved";

type SavedResumeSource = {
  id: string;
  candidateName: string | null;
  targetRole: string;
  targetCompany: string | null;
  updatedAt: string;
};

const MIN_RESUME_CHARS = 200;
const MAX_RESUME_CHARS = 80_000;
const MIN_JD_CHARS = 50;
const MAX_JD_CHARS = 40_000;
const MAX_ROLE_CHARS = 160;
const MAX_COMPANY_CHARS = 160;

type GenerationStatus = ResumeGenerationStatus;

type GeneratedDraft = {
  resumeId: string;
  jdText: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateLinkedin: string | null;
  candidateLocation: string | null;
  candidateWebsite: string | null;
  targetRole: string;
  targetCompany: string | null;
  summaryText: string | null;
  presentation: ResumePresentation;
  workHistory: Array<{
    workHistoryId: string;
    company: string;
    title: string;
    location: string | null;
    startDate: string;
    endDate: string | null;
    current: boolean;
    sortOrder: number;
    bullets: Array<{ bulletId: string; content: string }>;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    graduationDate: string | null;
    inProgress: boolean;
  }>;
  certifications: Array<{
    name: string;
    issuingBody: string | null;
    issueDate: string | null;
  }>;
  skills: Array<{ name: string; category: string | null }>;
  atsScore: number | null;
  keywordScore: number | null;
  diagnostic: {
    issues: string[];
    recommendations: string[];
    needsReview: boolean;
  } | null;
  sections: Array<{
    name: string;
    sortOrder: number;
    visible: boolean;
    content: string | null;
  }>;
};

type ScanInsights = {
  score: number;
  atsScore?: number;
  keywordScore?: number;
  evidenceScore?: number;
  signalScore?: number;
  fitLabel: string;
  summary: string;
  matchedCount: number;
  missingCount: number;
  totalKeywords: number;
  requirementDetails?: Array<KeywordInsight & {
    importance: "critical" | "important" | "supporting";
    status: "matched" | "missing";
    evidence: string | null;
    source: string;
    weight: number;
    kind: "role" | "phrase" | "named" | "word";
  }>;
  missingKeywordDetails: KeywordInsight[];
  quickWins: string[];
  evidenceSources?: string[];
};

type EvidenceDraft = {
  confirmed: boolean;
  source: string;
  details: string;
};

type KeywordInsight = {
  term: string;
  category: string;
  why: string;
};


export default function UploadPage() {
  const router = useRouter();
  const generatedSectionRef = useRef<HTMLElement>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>("upload");
  const [resumeExpanded, setResumeExpanded] = useState(false);
  const [jdExpanded, setJdExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [savedSources, setSavedSources] = useState<SavedResumeSource[]>([]);
  const [savedSourcesLoading, setSavedSourcesLoading] = useState(true);
  const [savedSourcesError, setSavedSourcesError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [roleEdited, setRoleEdited] = useState(false);
  const [companyEdited, setCompanyEdited] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedDraft | null>(null);
  const [scanInsights, setScanInsights] = useState<ScanInsights | null>(null);
  const [uploadScanPrepared, setUploadScanPrepared] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, EvidenceDraft>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resumeId = new URLSearchParams(window.location.search).get("resumeId");
    if (!resumeId) return;

    setActiveResumeId((current) => current ?? resumeId);
    setUploading(false);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedSources() {
      setSavedSourcesLoading(true);
      setSavedSourcesError(null);
      try {
        const response = await fetch("/api/resume/sources", { cache: "no-store" });
        if (response.status === 401) {
          router.push(`/signin?callbackUrl=${encodeURIComponent("/upload")}`);
          return;
        }
        const payload = (await response.json().catch(() => null)) as {
          sources?: SavedResumeSource[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Saved resumes could not be loaded.");
        }
        if (!cancelled) setSavedSources(payload?.sources ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setSavedSourcesError(
            loadError instanceof Error
              ? loadError.message
              : "Saved resumes could not be loaded."
          );
        }
      } finally {
        if (!cancelled) setSavedSourcesLoading(false);
      }
    }

    void loadSavedSources();
    return () => {
      cancelled = true;
    };
  }, [router]);
  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!activeResumeId || generatedDraft) return;

    let cancelled = false;
    let pollingStopped = false;

    async function pollGeneration() {
      if (!activeResumeId || cancelled || pollingStopped) return;
      try {
        const statusRes = await fetch(`/api/resume/${activeResumeId}/status`, {
          cache: "no-store",
        });
        const statusPayload = await statusRes.json().catch(() => null);
        const statusResult = classifyResumeStatusResponse(
          statusRes.status,
          statusPayload
        );

        if (statusResult.kind === "unauthorized") {
          pollingStopped = true;
          setUploading(false);
          router.push(
            `/signin?callbackUrl=${encodeURIComponent(`/upload?resumeId=${activeResumeId}`)}`
          );
          return;
        }

        if (statusResult.kind !== "ready") {
          pollingStopped = true;
          setUploading(false);
          setError(statusResult.message);
          return;
        }

        const status = statusResult.data;
        if (!cancelled) setGenerationStatus(status);

        if (status.state === "FAILED") {
          pollingStopped = true;
          if (!cancelled) {
            setUploading(false);
            setError(
              status.errorMessage
                ? `Generation failed: ${status.errorMessage}`
                : "Generation failed. Open the workspace to review the details or try again."
            );
          }
          return;
        }

        // QA_REVIEWED means the draft is usable; later states keep it editable.
        if (isDraftReadableState(status.state)) {
          const contentRes = await fetch(`/api/resume/${activeResumeId}/content`, {
            cache: "no-store",
          });
          const contentPayload = await contentRes.json().catch(() => null);
          const contentResult = classifyResumeContentResponse(contentRes.status, contentPayload);
          if (contentResult.kind === "unauthorized") {
            pollingStopped = true;
            setUploading(false);
            router.push(
              `/signin?callbackUrl=${encodeURIComponent(`/upload?resumeId=${activeResumeId}`)}`
            );
            return;
          }
          if (contentResult.kind === "ready") {
            const draft: GeneratedDraft = contentResult.data;
            if (!cancelled) {
              const persistedSource = sourceResumeTextFromSections(draft.sections);
              setGeneratedDraft(draft);
              setError(null);
              if (persistedSource) {
                setEntryMode("paste");
                setResumeText(persistedSource);
              }
              if (draft.jdText) {
                setJobDescription((current) => (current.trim() ? current : (draft.jdText ?? "")));
              }
              setTargetRole(draft.targetRole);
              setTargetCompany(draft.targetCompany ?? "");
              setRoleEdited(true);
              setCompanyEdited(true);
              setUploading(false);
            }
          } else if (
            (contentResult.kind === "unavailable" || contentResult.kind === "error") &&
            !cancelled
          ) {
            pollingStopped = true;
            setError(contentResult.message);
            setUploading(false);
          }
        }
      } catch {
        if (!cancelled) {
          setError("Still waiting on generation. You can open the workspace and continue there.");
          setUploading(false);
        }
      }
    }

    pollGeneration();
    const interval = window.setInterval(pollGeneration, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeResumeId, generatedDraft, router]);

  useEffect(() => {
    if (!activeResumeId) return;
    generatedSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [activeResumeId]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setGeneratedDraft(null);
      setScanInsights(null);
      setUploadScanPrepared(false);
      setGenerationStatus(null);
      setActiveResumeId(null);
      setError(null);
    }
  }, []);

  const onDropRejected = useCallback(() => {
    setError("Use a PDF or DOCX resume under 10 MB.");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  const pastedResume = resumeText.trim();
  const pastedJd = jobDescription.trim();
  const detectedJob = useMemo(() => inferJobDetails(pastedJd), [pastedJd]);
  const selectedSource = useMemo(
    () => savedSources.find((source) => source.id === selectedSourceId) ?? null,
    [savedSources, selectedSourceId]
  );
  const hasResumeSource =
    entryMode === "upload"
      ? !!file
      : entryMode === "saved"
        ? !!selectedSourceId
        : pastedResume.length >= MIN_RESUME_CHARS;
  const hasTarget = targetRole.trim().length > 0 && pastedJd.length >= MIN_JD_CHARS;
  const canScan = hasResumeSource && hasTarget && !uploading && !activeResumeId;
  const scanComplete = !!scanInsights;
  const canContinue = canScan && scanComplete;
  const missingItems = [
    { label: "Resume", complete: hasResumeSource },
    { label: "Target role", complete: targetRole.trim().length > 0 },
    { label: "Job description", complete: pastedJd.length >= MIN_JD_CHARS },
  ];
  const nextMissingItem = missingItems.find((item) => !item.complete)?.label;
  const actionLabel = generatedDraft
    ? "Resume ready"
    : activeResumeId
      ? "Generating..."
      : "Generate resume";

  useEffect(() => {
    if ((!roleEdited || !targetRole.trim()) && detectedJob.role && detectedJob.role !== targetRole) {
      setTargetRole(detectedJob.role);
    }
  }, [detectedJob.role, roleEdited, targetRole]);

  useEffect(() => {
    if ((!companyEdited || !targetCompany.trim()) && detectedJob.company && detectedJob.company !== targetCompany) {
      setTargetCompany(detectedJob.company);
    }
  }, [companyEdited, detectedJob.company, targetCompany]);

  const computedScanInsights = useMemo(() => {
    if (entryMode !== "paste" || pastedResume.length < MIN_RESUME_CHARS || pastedJd.length < MIN_JD_CHARS) {
      return null;
    }
    return analyzeResumeAgainstJob(pastedResume, pastedJd);
  }, [entryMode, pastedJd, pastedResume]);
  const comparableSourceScan = entryMode === "paste" ? computedScanInsights : scanInsights;
  const currentAtsScore = comparableSourceScan?.atsScore ?? null;
  const currentKeywordScore = comparableSourceScan?.keywordScore ?? null;
  const currentEvidenceScore = comparableSourceScan?.evidenceScore ?? null;

  useEffect(() => {
    setScanInsights(null);
    setUploadScanPrepared(false);
    setEvidenceDrafts({});
  }, [entryMode, file, pastedJd, pastedResume, selectedSourceId, targetCompany, targetRole]);

  function validateInputsForAction() {
    if (!hasResumeSource) {
      setError(
        entryMode === "upload"
          ? "Choose a resume file before continuing."
          : entryMode === "saved"
            ? "Choose a saved resume before continuing."
            : "Paste more of your resume before continuing."
      );
      return false;
    }
    if (!targetRole.trim()) {
      setError("Add the target role before continuing.");
      return false;
    }
    if (pastedJd.length < MIN_JD_CHARS) {
      setError("Paste the job description before continuing.");
      return false;
    }
    return true;
  }

  async function handleScan() {
    if (!validateInputsForAction()) return;

    setError(null);
    if (entryMode === "paste") {
      if (!computedScanInsights) {
        setError("Paste more resume detail before scanning.");
        return;
      }
      setScanInsights(computedScanInsights);
      return;
    }

    if (entryMode === "saved") {
      if (!selectedSourceId) return;
      setScanLoading(true);
      try {
        const response = await fetch("/api/resume/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceResumeId: selectedSourceId,
            jobDescription: pastedJd,
          }),
        });
        if (response.status === 401) {
          router.push(`/signin?callbackUrl=${encodeURIComponent("/upload")}`);
          return;
        }
        const data = (await response.json().catch(() => ({}))) as ScanInsights & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "Saved resume scan failed");
        }
        setScanInsights(data);
        setUploadScanPrepared(true);
      } catch (scanError) {
        setError(
          scanError instanceof Error ? scanError.message : "Saved resume scan failed"
        );
      } finally {
        setScanLoading(false);
      }
      return;
    }
    if (!file) return;
    setScanLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("jobDescription", pastedJd);
      const response = await fetch("/api/resume/scan", {
        method: "POST",
        body: formData,
      });
      if (response.status === 401) {
        router.push(`/signin?callbackUrl=${encodeURIComponent("/upload")}`);
        return;
      }
      const data = (await response.json().catch(() => ({}))) as ScanInsights & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Resume scan failed");
      }
      setScanInsights(data);
      setUploadScanPrepared(true);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Resume scan failed");
    } finally {
      setScanLoading(false);
    }
  }

  async function handleSubmit() {
    if (uploading) return;

    if (!validateInputsForAction()) return;
    if (!scanComplete) {
      setError("Scan the resume first, then generate if the analysis looks useful.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const createRes = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: targetRole.trim(),
          sourceResumeId: entryMode === "saved" ? selectedSourceId : undefined,
        }),
      });
      if (createRes.status === 401) {
        setUploading(false);
        router.push(`/signin?callbackUrl=${encodeURIComponent("/upload")}`);
        return;
      }
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to create resume record");
      }
      const { resumeId } = (await createRes.json()) as { resumeId: string };

      if (entryMode === "upload" && file) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch(`/api/resume/${resumeId}/upload`, {
          method: "POST",
          body: formData,
        });
        if (uploadRes.status === 401) {
          setUploading(false);
          router.push(`/signin?callbackUrl=${encodeURIComponent("/upload")}`);
          return;
        }
        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Upload failed");
        }
      } else if (entryMode === "paste") {
        const pasteRes = await fetch(`/api/resume/${resumeId}/paste`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText: pastedResume }),
        });
        if (pasteRes.status === 401) {
          setUploading(false);
          router.push(`/signin?callbackUrl=${encodeURIComponent("/upload")}`);
          return;
        }
        if (!pasteRes.ok) {
          const data = await pasteRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Could not save pasted resume");
        }
      }

      const confirmedEvidence = buildConfirmedEvidence(
        evidenceDrafts,
        scanInsights?.missingKeywordDetails ?? []
      );
      const evidenceRes = await fetch(`/api/resume/${resumeId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence: confirmedEvidence }),
      });
      if (!evidenceRes.ok) {
        const data = await evidenceRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Could not save confirmed evidence");
      }

      const jdRes = await fetch(`/api/resume/${resumeId}/jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText: pastedJd,
          targetRole: targetRole.trim(),
          targetCompany: targetCompany.trim() || undefined,
        }),
      });
      if (jdRes.status === 401) {
        setUploading(false);
        router.push(`/signin?callbackUrl=${encodeURIComponent("/upload")}`);
        return;
      }
      if (!jdRes.ok) {
        const data = await jdRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Could not save job description");
      }

      setActiveResumeId(resumeId);
      setGenerationStatus({
        state: "UPLOADED",
        progressPercent: 5,
        label: "Generating your tailored resume...",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-container flex-col px-4 py-8 md:px-8 md:py-10">
        <header className="mb-5 rounded-xl border border-outline-variant/30 bg-primary-container p-5 text-white md:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/65">
            Resume workspace
          </p>
          <h2
            className="mt-3 max-w-2xl text-3xl font-semibold leading-tight text-white md:text-[40px]"
            style={{ fontFamily: "'IBM Plex Serif', serif" }}
          >
            Tailor one resume to one job.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/72">
            Add the resume and target job side by side. The scan report appears beside the job description, and generated scores appear with the draft.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {missingItems.map((item) => (
              <span
                key={`hero-${item.label}`}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  item.complete
                    ? "border-white/25 bg-white/15 text-white"
                    : "border-white/15 bg-white/5 text-white/65"
                )}
              >
                {item.complete && <CheckCircle2 size={13} />}
                {item.label}
              </span>
            ))}
          </div>
        </header>

        <section className="grid items-start gap-5 lg:grid-cols-2">
          <section className="h-fit rounded-xl border border-outline-variant/50 bg-surface-lowest">
            <div>
              <div className="border-b border-outline-variant/40 p-5">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-on-surface-variant" />
                        <h3 className="text-base font-semibold text-on-surface">
                          Current resume
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        Upload, paste, or reuse a saved source resume.
                      </p>
                    </div>
                    <StepBadge step={1} complete={hasResumeSource} />
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-container-low p-1">
                    {(["upload", "paste", "saved"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setEntryMode(mode);
                          setError(null);
                        }}
                        className={clsx(
                          "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
                          entryMode === mode
                            ? "bg-surface-lowest text-on-surface shadow-sm"
                            : "text-on-surface-variant hover:text-on-surface"
                        )}
                      >
                        {mode === "upload"
                          ? "Upload file"
                          : mode === "paste"
                            ? "Paste resume"
                            : "Saved resume"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  {entryMode === "upload" ? (
                    <div
                      {...getRootProps({
                        role: "button",
                        "aria-label": "Upload resume file",
                      })}
                      className={clsx(
                        "group flex cursor-pointer flex-col justify-center rounded-xl border-2 border-dashed transition-all",
                        file ? "p-4" : "min-h-[360px] p-5",
                        isDragActive
                          ? "border-secondary bg-secondary/5"
                          : "border-outline-variant bg-surface-container-low hover:border-secondary hover:bg-surface-container"
                      )}
                    >
                      <input {...getInputProps()} />

                      {file ? (
                        <div className="mx-auto w-full max-w-2xl">
                          <div className="mb-3 flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container/20">
                              <CheckCircle2 size={20} className="text-secondary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-on-surface">
                                Resume selected
                              </p>
                              <p className="text-xs text-on-surface-variant">
                                Drop another file here to replace it.
                              </p>
                            </div>
                          </div>
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-outline-variant/40 bg-surface-lowest p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-all text-sm font-semibold text-on-surface">
                                  {file.name}
                                </p>
                                <p className="mt-1 text-xs text-on-surface-variant">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB - {file.type || "document"}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFile(null);
                                }}
                                className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <UploadedFilePreview file={file} previewUrl={filePreviewUrl} />
                        </div>
                      ) : (
                        <div className="mx-auto max-w-sm text-center">
                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container transition-transform group-hover:scale-105">
                            <CloudUpload
                              size={28}
                              className="text-on-surface-variant"
                              strokeWidth={1.5}
                            />
                          </div>
                          <p className="mb-1 text-base font-semibold text-on-surface">
                            {isDragActive ? "Drop your file here" : "Drag your resume here or browse files"}
                          </p>
                          <p className="text-sm text-on-surface-variant">
                            PDF or DOCX, up to 10 MB
                          </p>
                        </div>
                      )}
                    </div>
                  ) : entryMode === "paste" ? (
                    <ExpandableTextarea
                      id="resumeText"
                      label="Paste existing resume"
                      value={resumeText}
                      onChange={setResumeText}
                      maxLength={MAX_RESUME_CHARS}
                      placeholder="Paste your current resume text here."
                      helperText={`Paste at least ${MIN_RESUME_CHARS} characters so the generator has enough context.`}
                      expanded={resumeExpanded}
                      onToggleExpanded={() => setResumeExpanded((value) => !value)}
                      minHeight={260}
                      expandedHeight={560}
                    />
                  ) : (
                    <SavedResumeSourcePicker
                      sources={savedSources}
                      loading={savedSourcesLoading}
                      error={savedSourcesError}
                      selectedId={selectedSourceId}
                      onSelect={(sourceId) => {
                        setSelectedSourceId(sourceId);
                        setGeneratedDraft(null);
                        setGenerationStatus(null);
                        setActiveResumeId(null);
                        setError(null);
                      }}
                    />
                  )}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-xs leading-relaxed text-on-surface-variant">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-secondary" />
                  <span>Your resume is used inside this workspace to generate and review this tailored draft.</span>
                </div>
              </div>

            </div>
          </section>

          <section className="h-fit rounded-xl border border-outline-variant/50 bg-surface-lowest">
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness size={18} className="text-on-surface-variant" />
                    <h3 className="text-base font-semibold text-on-surface">
                      Target job description
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Confirm the target, then paste the job description for matching.
                  </p>
                </div>
                <StepBadge step={2} complete={hasTarget} />
              </div>

              <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                      Auto-detected target
                    </p>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      Adjust only if the job post is ambiguous.
                    </p>
                  </div>
                  {(detectedJob.role || detectedJob.company) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (detectedJob.role) setTargetRole(detectedJob.role);
                        if (detectedJob.company) setTargetCompany(detectedJob.company);
                        setRoleEdited(false);
                        setCompanyEdited(false);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-lowest px-3 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                    >
                      Use detected
                    </button>
                  )}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="targetRole" className="text-xs font-semibold uppercase text-on-surface-variant">
                      Target role
                    </label>
                    <input
                      id="targetRole"
                      value={targetRole}
                      onChange={(e) => {
                        setRoleEdited(true);
                        setTargetRole(e.target.value);
                      }}
                      maxLength={MAX_ROLE_CHARS}
                      placeholder={detectedJob.role || "Auto-detects from JD"}
                      className="h-11 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm text-on-surface focus:border-secondary focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="targetCompany" className="text-xs font-semibold uppercase text-on-surface-variant">
                      Company
                    </label>
                    <input
                      id="targetCompany"
                      value={targetCompany}
                      onChange={(e) => {
                        setCompanyEdited(true);
                        setTargetCompany(e.target.value);
                      }}
                      maxLength={MAX_COMPANY_CHARS}
                      placeholder={detectedJob.company || "Optional"}
                      className="h-11 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm text-on-surface focus:border-secondary focus:outline-none"
                    />
                  </div>
                </div>

              </div>

              <div className="mt-4">
                <ExpandableTextarea
                  id="jobDescription"
                  label="Paste job description"
                  value={jobDescription}
                  onChange={setJobDescription}
                  maxLength={MAX_JD_CHARS}
                  placeholder="Paste the full job description here. Include responsibilities, requirements, and preferred qualifications."
                  helperText="This drives keyword matching, role framing, and score comparison."
                  expanded={jdExpanded}
                  onToggleExpanded={() => setJdExpanded((value) => !value)}
                  minHeight={300}
                  expandedHeight={560}
                />
              </div>

            </div>
          </section>

          {(scanInsights || uploadScanPrepared) && (
            <div className="lg:col-span-2">
              {scanInsights && entryMode === "paste" && (
                <div className="space-y-4">
                  <ScanInsightsPanel insights={scanInsights} />
                  <EvidenceConfirmationPanel
                    missingDetails={scanInsights.missingKeywordDetails}
                    sourceOptions={scanInsights.evidenceSources ?? []}
                    evidenceDrafts={evidenceDrafts}
                    onEvidenceChange={(term, value) =>
                      setEvidenceDrafts((current) => updateEvidenceDraft(current, term, value))
                    }
                  />
                </div>
              )}

              {uploadScanPrepared && scanInsights && (
                <UploadServerScanNotice
                  fileName={
                    entryMode === "saved"
                      ? selectedSource?.candidateName ??
                        selectedSource?.targetRole ??
                        "Saved resume"
                      : file?.name ?? "Selected resume"
                  }
                  targetRole={targetRole}
                  targetCompany={targetCompany}
                  keywordCount={extractJobTermDetails(pastedJd).length}
                  jobSignals={extractJobTermDetails(pastedJd).slice(0, 6)}
                  resumeMatchScore={scanInsights.score}
                  resumeAtsScore={scanInsights.atsScore ?? null}
                  resumeKeywordScore={scanInsights.keywordScore ?? scanInsights.score}
                  resumeEvidenceScore={scanInsights.evidenceScore ?? null}
                  missingDetails={scanInsights.missingKeywordDetails}
                  sourceOptions={scanInsights.evidenceSources ?? []}
                  evidenceDrafts={evidenceDrafts}
                  onEvidenceChange={(term, value) =>
                    setEvidenceDrafts((current) => updateEvidenceDraft(current, term, value))
                  }
                />
              )}
            </div>
          )}

            <div className="lg:col-span-2 flex flex-col gap-4 rounded-xl border border-outline-variant/40 bg-surface-lowest p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  {missingItems.map((item) => (
                    <span
                      key={item.label}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-full border bg-surface-lowest px-3 py-1.5 text-xs font-medium",
                        item.complete
                          ? "border-secondary/30 text-secondary"
                          : "border-outline-variant text-on-surface-variant"
                      )}
                    >
                      {item.complete && <CheckCircle2 size={13} />}
                      {item.label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-on-surface-variant">
                  {generatedDraft
                    ? "Resume ready. Review the draft below or open the full editor."
                    : activeResumeId
                    ? "Generation is running. Open the workspace when the draft is ready."
                    : scanComplete
                    ? "Scan reviewed. Generate the tailored draft when you are ready."
                    : nextMissingItem
                      ? `Add ${nextMissingItem.toLowerCase()} to scan the resume.`
                      : "Scan first, then generate only if the analysis is useful."}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {activeResumeId && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveResumeId(null);
                      setGenerationStatus(null);
                      setGeneratedDraft(null);
                      setUploading(false);
                      setError(null);
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-outline-variant bg-surface-lowest px-5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
                  >
                    Start another
                  </button>
                )}
                {generatedDraft && activeResumeId ? (
                  <Link
                    href={`/workspace/${activeResumeId}?from=preview`}
                    className="inline-flex h-11 min-w-[172px] items-center justify-center gap-2 rounded-lg bg-on-surface px-6 text-sm font-semibold text-white transition-all hover:opacity-90"
                  >
                    Open editor
                    <ArrowRight size={16} />
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleScan}
                      disabled={!canScan || uploading || scanLoading}
                      aria-disabled={!canScan || uploading || scanLoading}
                      className={clsx(
                        "inline-flex h-11 min-w-[144px] items-center justify-center gap-2 rounded-lg border px-5 text-sm font-semibold transition-all",
                        canScan && !uploading && !scanLoading
                          ? "border-outline-variant bg-surface-lowest text-on-surface hover:bg-surface-container-low"
                          : "cursor-not-allowed border-transparent bg-surface-container text-on-surface-variant"
                      )}
                    >
                      {scanLoading ? <Loader2 size={16} className="animate-spin" /> : <Gauge size={16} />}
                      {scanLoading ? "Reading resume..." : scanComplete ? "Scan again" : "Scan resume"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canContinue}
                      aria-disabled={!canContinue}
                      className={clsx(
                        "inline-flex h-11 min-w-[188px] items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold transition-all",
                        canContinue
                          ? "bg-on-surface text-white hover:opacity-90"
                          : "cursor-not-allowed bg-surface-container text-on-surface-variant"
                      )}
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          {actionLabel}
                          {!activeResumeId && <ArrowRight size={16} />}
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

          <div className="lg:col-span-2">
            <GeneratedResumePanel
              sectionRef={generatedSectionRef}
              activeResumeId={activeResumeId}
              generatedDraft={generatedDraft}
              generationStatus={generationStatus}
              currentAtsScore={currentAtsScore}
              currentKeywordScore={currentKeywordScore}
              currentEvidenceScore={currentEvidenceScore}
              targetJobDescription={pastedJd}
            />
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
          >
            <X size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

      </div>
    </main>
  );
}

function GeneratedResumePanel({
  sectionRef,
  activeResumeId,
  generatedDraft,
  generationStatus,
  currentAtsScore,
  currentKeywordScore,
  currentEvidenceScore,
  targetJobDescription,
}: {
  sectionRef: RefObject<HTMLElement>;
  activeResumeId: string | null;
  generatedDraft: GeneratedDraft | null;
  generationStatus: GenerationStatus | null;
  currentAtsScore: number | null;
  currentKeywordScore: number | null;
  currentEvidenceScore: number | null;
  targetJobDescription: string;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const presentation = generatedDraft?.presentation ?? DEFAULT_RESUME_PRESENTATION;
  const previewStyle: CSSProperties & Record<"--preview-body-size" | "--preview-line-height", string> = {
    fontFamily: resumeFontFamily(presentation.font),
    "--preview-body-size": presentation.scale === "compact"
      ? "12px"
      : presentation.scale === "large"
        ? "14px"
        : "13px",
    "--preview-line-height": presentation.density === "tight"
      ? "1.35"
      : presentation.density === "open"
        ? "1.75"
        : "1.55",
  };

  const handlePdfDownload = useCallback(async () => {
    if (!activeResumeId || !generatedDraft || pdfBusy) return;

    setPdfBusy(true);
    setPdfMessage(null);

    try {
      await renderAndDownloadPdf({
        resumeId: activeResumeId,
        filename: `${generatedDraft.candidateName || "Resume"} - ${generatedDraft.targetRole}`,
      });
      setPdfMessage("PDF download started.");
    } catch (downloadError) {
      setPdfMessage(
        downloadError instanceof Error
          ? downloadError.message
          : "The PDF could not be prepared. Please try again."
      );
    } finally {
      setPdfBusy(false);
    }
  }, [activeResumeId, generatedDraft, pdfBusy]);

  return (
    <section
      ref={sectionRef}
      className="rounded-xl border border-outline-variant/50 bg-surface-lowest"
    >
      <div className="flex flex-col gap-3 border-b border-outline-variant/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-on-surface-variant" />
            <h3 className="text-base font-semibold text-on-surface">
              Generated resume
            </h3>
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            Your tailored draft appears beside the job description for faster review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StepBadge step={3} complete={!!generatedDraft} />
          {activeResumeId && generatedDraft && (
            <>
              <button
                type="button"
                onClick={handlePdfDownload}
                disabled={pdfBusy}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-on-surface px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {pdfBusy ? "Preparing PDF" : "Download PDF"}
              </button>
              <Link
                href={`/workspace/${activeResumeId}?from=preview`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-outline-variant px-4 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
              >
                Open editor
              </Link>
            </>
          )}
        </div>
      </div>

      {pdfMessage && (
        <p
          role="status"
          className={clsx(
            "border-b border-outline-variant/40 px-5 py-3 text-sm",
            pdfMessage === "PDF download started." ? "text-secondary" : "text-error"
          )}
        >
          {pdfMessage}
        </p>
      )}

      {!activeResumeId && (
        <div className="grid min-h-[420px] place-items-center p-8 text-center">
          <div className="max-w-md">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
              <Gauge size={22} className="text-on-surface-variant" />
            </div>
            <p className="text-sm font-semibold text-on-surface">
              Generate to see the tailored draft and after scores.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              The before estimate compares your current resume to the job. The
              after score appears once the generated resume is ready.
            </p>
          </div>
        </div>
      )}

      {activeResumeId && !generatedDraft && (
        <div className="p-5">
          <GenerationDashboard generationStatus={generationStatus} />
        </div>
      )}

      {generatedDraft && (
        <div className="grid gap-5 p-5">
          <article
            className="mx-auto flex max-h-[620px] w-full max-w-[860px] flex-col overflow-y-auto rounded-xl border border-outline-variant/40 bg-white px-8 py-9 text-on-surface shadow-sm sm:px-12 [&_li]:text-[length:var(--preview-body-size)] [&_li]:leading-[var(--preview-line-height)] [&_p]:text-[length:var(--preview-body-size)] [&_p]:leading-[var(--preview-line-height)]"
            style={previewStyle}
          >
            <ResumeDocumentHeader generatedDraft={generatedDraft} />

            {generatedDraft.summaryText && (
              <section className="order-1 mt-5">
                <h5 className="inline-block border-b-2 border-surface-container pb-1 text-[13px] font-bold uppercase tracking-normal text-on-surface">
                  Professional Summary
                </h5>
                <p className="mt-2 text-[13px] leading-relaxed">
                  {generatedDraft.summaryText}
                </p>
              </section>
            )}

            <section className="order-3 mt-6 space-y-4">
              <h5 className="inline-block border-b-2 border-surface-container pb-1 text-[13px] font-bold uppercase tracking-normal text-on-surface">
                Experience
              </h5>
              {generatedDraft.workHistory.length > 0 ? (
                generatedDraft.workHistory.map((job) => (
                  <div key={job.workHistoryId}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                      <p className="text-[13px] font-bold">{job.title}</p>
                      <p className="whitespace-nowrap text-[11.5px] text-on-surface-variant">
                        {formatPreviewPeriod(job.startDate, job.endDate, job.current)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[12px] font-semibold text-secondary">
                      {job.company}{job.location ? ` | ${job.location}` : ""}
                    </p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] leading-relaxed">
                      {job.bullets.map((bullet) => (
                        <li key={bullet.bulletId}>{bullet.content}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-sm text-on-surface-variant">
                  No experience bullets returned yet.
                </p>
              )}
            </section>

            {generatedDraft.skills.length > 0 && (
              <section className="order-2 mt-6 border-t border-outline-variant/40 pt-5">
                <h5 className="inline-block border-b-2 border-surface-container pb-1 text-[13px] font-bold uppercase tracking-normal text-on-surface">
                  Core Skills
                </h5>
                <div className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed">
                  {groupPreviewSkillsByCategory(generatedDraft.skills).map(([category, skills]) => (
                    <p key={category}>
                      <span className="font-bold">{category}:</span>{" "}
                      {skills.join(" | ")}
                    </p>
                  ))}
                </div>
              </section>
            )}

            {(generatedDraft.education.length > 0 || generatedDraft.certifications.length > 0) && (
              <section className="order-4 mt-6 space-y-5 border-t border-outline-variant/40 pt-5">
                {generatedDraft.education.length > 0 && (
                  <div>
                    <h5 className="inline-block border-b-2 border-surface-container pb-1 text-[13px] font-bold uppercase tracking-normal text-on-surface">
                      Education
                    </h5>
                    <div className="mt-2 space-y-2 text-[12.5px] leading-relaxed">
                      {generatedDraft.education.map((education) => (
                        <div
                          key={`${education.degree}-${education.institution}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4"
                        >
                          <p className="min-w-0">
                            <span className="font-semibold">{education.degree}</span>
                            <br />
                            <span className="text-on-surface-variant">
                              {education.institution}
                            </span>
                          </p>
                          <p className="whitespace-nowrap text-[11.5px] text-on-surface-variant">
                            {formatEducationDateUtc(education.graduationDate, education.inProgress)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {generatedDraft.certifications.length > 0 && (
                  <div>
                    <h5 className="inline-block border-b-2 border-surface-container pb-1 text-[13px] font-bold uppercase tracking-normal text-on-surface">
                      Certifications
                    </h5>
                    <p className="mt-2 text-[12.5px] leading-relaxed">
                      {generatedDraft.certifications
                        .map(formatCertificationLabel)
                        .join(" | ")}
                    </p>
                  </div>
                )}
              </section>
            )}
          </article>

          <ResumePreviewMetrics
            activeResumeId={activeResumeId}
            generatedDraft={generatedDraft}
            currentAtsScore={currentAtsScore}
            currentKeywordScore={currentKeywordScore}
            currentEvidenceScore={currentEvidenceScore}
            targetJobDescription={targetJobDescription || generatedDraft.jdText || ""}
          />
        </div>
      )}
    </section>
  );
}

function ResumeDocumentHeader({ generatedDraft }: { generatedDraft: GeneratedDraft }) {
  const contactItems = buildPreviewContactItems(generatedDraft);

  return (
    <header className="border-b border-outline-variant/50 pb-4 text-center">
      <h4 className="text-[28px] font-bold uppercase leading-none tracking-normal text-on-surface">
        {generatedDraft.candidateName ?? "Candidate"}
      </h4>
      {contactItems.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] leading-tight text-on-surface-variant">
          {contactItems.map((item, index) => (
            <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
              {index > 0 && <span className="text-on-surface-variant/50">|</span>}
              <span>{item}</span>
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

function buildPreviewContactItems(generatedDraft: GeneratedDraft) {
  return [
    generatedDraft.candidateEmail,
    generatedDraft.candidatePhone,
    generatedDraft.candidateLinkedin,
    generatedDraft.candidateWebsite,
    generatedDraft.candidateLocation,
  ].filter((item): item is string => Boolean(item?.trim()));
}

function formatPreviewPeriod(startDate: string, endDate: string | null, current: boolean) {
  return formatMonthYearRangeUtc(startDate, endDate, current);
}

function groupPreviewSkillsByCategory(skills: GeneratedDraft["skills"]) {
  const groups = new Map<string, string[]>();
  for (const skill of skills) {
    const category = skill.category ?? "Role Keywords";
    if (!groups.has(category)) groups.set(category, []);
    const values = groups.get(category)!;
    if (!values.some((value) => value.toLowerCase() === skill.name.toLowerCase())) {
      values.push(skill.name);
    }
  }
  return Array.from(groups.entries());
}

function StepBadge({ step, complete }: { step: number; complete: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        complete
          ? "border-secondary/30 bg-secondary/10 text-secondary"
          : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant"
      )}
    >
      <span
        className={clsx(
          "grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold",
          complete ? "bg-secondary text-white" : "bg-surface-container text-on-surface-variant"
        )}
      >
        {complete ? <CheckCircle2 size={12} /> : step}
      </span>
      Step {step}
    </span>
  );
}


function SavedResumeSourcePicker({
  sources,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  sources: SavedResumeSource[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (sourceId: string) => void;
}) {
  if (loading) {
    return (
      <div className="grid min-h-[260px] place-items-center rounded-xl border border-outline-variant/40 bg-surface-container-low p-6 text-center">
        <div>
          <Loader2 className="mx-auto animate-spin text-secondary" size={24} />
          <p className="mt-3 text-sm font-semibold text-on-surface">
            Loading saved source resumes
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-error/20 bg-error/10 p-4 text-sm leading-relaxed text-error"
      >
        {error}
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="grid min-h-[260px] place-items-center rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-center">
        <div className="max-w-sm">
          <FolderOpen className="mx-auto text-on-surface-variant" size={28} />
          <p className="mt-3 text-sm font-semibold text-on-surface">
            No reusable source resumes yet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Upload or paste a resume once. Its original source snapshot will be
            available here for future jobs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <FolderOpen size={17} className="text-on-surface-variant" />
        <p className="text-sm font-semibold text-on-surface">Choose a source resume</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
        A separate tailored resume will be created. Your saved source stays unchanged.
      </p>
      <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {sources.map((source) => {
          const selected = source.id === selectedId;
          const context = [source.targetRole, source.targetCompany]
            .filter(Boolean)
            .join(" at ");
          const updatedAt = new Date(source.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          return (
            <button
              key={source.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(source.id)}
              className={clsx(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-secondary bg-secondary/5"
                  : "border-outline-variant/40 bg-surface-lowest hover:bg-surface-container-low"
              )}
            >
              <span
                className={clsx(
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                  selected
                    ? "border-secondary bg-secondary text-white"
                    : "border-outline-variant text-on-surface-variant"
                )}
              >
                {selected ? <CheckCircle2 size={14} /> : <FileText size={13} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-on-surface">
                  {source.candidateName?.trim() || "Saved source resume"}
                </span>
                <span className="mt-0.5 block truncate text-xs text-on-surface-variant">
                  {context || "Original resume source"}
                </span>
                <span className="mt-1 block text-[11px] text-on-surface-variant/80">
                  Updated {updatedAt}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UploadedFilePreview({
  file,
  previewUrl,
}: {
  file: File;
  previewUrl: string | null;
}) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  return (
    <div className="mt-3 rounded-lg border border-outline-variant/40 bg-surface-lowest">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 px-3 py-2">
        <p className="text-xs font-semibold uppercase text-on-surface-variant">
          File preview
        </p>
        <p className="truncate text-xs text-on-surface-variant">
          {isPdf ? "PDF visible before generation" : "Document queued for secure parse"}
        </p>
      </div>
      {isPdf && previewUrl ? (
        <iframe
          title="Uploaded resume preview"
          src={`${previewUrl}#toolbar=0&navpanes=0`}
          className="h-72 w-full rounded-b-lg bg-white"
        />
      ) : (
        <div className="grid min-h-36 place-items-center px-4 py-6 text-center">
          <div className="max-w-sm">
            <FileText className="mx-auto text-on-surface-variant" size={28} />
            <p className="mt-3 text-sm font-semibold text-on-surface">
              DOCX preview appears after parsing
            </p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
              The AI reads the uploaded document on generate, extracts the resume
              structure, then compares it to the job before writing anything.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const GENERATION_STEPS = [
  { state: "UPLOADED", label: "Receive" },
  { state: "PARSED", label: "Parse" },
  { state: "NORMALIZED", label: "Understand" },
  { state: "VERIFIED", label: "Verify" },
  { state: "JD_ANALYZED", label: "Read job" },
  { state: "STRATEGY_READY", label: "Plan" },
  { state: "GENERATING", label: "Write" },
  { state: "QA_REVIEWED", label: "Review" },
];

function GenerationDashboard({ generationStatus }: { generationStatus: GenerationStatus | null }) {
  const progress = generationStatus?.progressPercent ?? 5;
  const state = generationStatus?.state ?? "STARTING";
  const activeIndex = Math.max(0, GENERATION_STEPS.findIndex((step) => step.state === state));
  const stageProgress = clampScore(Math.round(((activeIndex + 1) / GENERATION_STEPS.length) * 100));
  const evidenceRead = clampScore(Math.min(100, progress + (activeIndex >= 2 ? 10 : 0)));
  const rewritePower = clampScore(state === "GENERATING" ? progress : activeIndex > 6 ? 100 : Math.max(12, progress - 18));
  const qaReadiness = clampScore(activeIndex >= 7 ? 96 : Math.max(8, progress - 45));
  const gauges = [
    { label: "Overall", value: progress, caption: generationStatus?.label ?? "Starting engine" },
    { label: "Evidence", value: evidenceRead, caption: activeIndex >= 2 ? "Context read" : "Parsing source" },
    { label: "Rewrite", value: rewritePower, caption: activeIndex >= 6 ? "Writing bullets" : "Queued" },
    { label: "QA", value: qaReadiness, caption: activeIndex >= 7 ? "Reviewing" : "Warming up" },
  ];

  return (
    <div
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-[#2F4A5D] bg-[#101820] text-white shadow-sm"
    >
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D8EEFF]/10 ring-1 ring-[#D8EEFF]/20">
                <Loader2 size={18} className="animate-spin text-[#93C5FD]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {generationStatus?.label ?? "Preparing your tailored resume"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-white/48">
                  State: {state}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.075] px-3 py-2 ring-1 ring-white/10">
              <span className="text-2xl font-semibold tabular-nums text-white">{progress}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-white/48">percent</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {gauges.map((gauge) => (
              <DashboardGauge
                key={gauge.label}
                label={gauge.label}
                value={gauge.value}
                caption={gauge.caption}
              />
            ))}
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-full rounded-full bg-[#7DD3FC] transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/[0.055] p-4 xl:border-l xl:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
            Live pipeline
          </p>
          <div className="mt-3 grid gap-1.5">
            {GENERATION_STEPS.map((step, index) => {
              const complete = index < activeIndex || isDraftReadableState(state);
              const active = index === activeIndex && !isDraftReadableState(state);
              return (
                <div
                  key={step.state}
                  className={clsx(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ring-1 transition-colors",
                    complete && "bg-[#7DD3FC]/15 text-white ring-[#7DD3FC]/20",
                    active && "bg-white/[0.12] text-white ring-white/20",
                    !complete && !active && "bg-white/[0.04] text-white/45 ring-white/10"
                  )}
                >
                  <span className="truncate">{step.label}</span>
                  <span
                    className={clsx(
                      "h-2 w-2 shrink-0 rounded-full",
                      complete && "bg-[#7DD3FC]",
                      active && "bg-white",
                      !complete && !active && "bg-white/20"
                    )}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/50">
            {stageProgress}% of the pipeline is active. The editor opens after QA review.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResumePreviewMetrics({
  activeResumeId,
  generatedDraft,
  currentAtsScore,
  currentKeywordScore,
  currentEvidenceScore,
  targetJobDescription,
}: {
  activeResumeId: string | null;
  generatedDraft: GeneratedDraft;
  currentAtsScore: number | null;
  currentKeywordScore: number | null;
  currentEvidenceScore: number | null;
  targetJobDescription: string;
}) {
  const generatedText = draftToComparableText(generatedDraft);
  const generatedAnalysis = analyzeResumeAgainstJob(generatedText, targetJobDescription);
  const matchedAfterKeywords = generatedAnalysis.matchedKeywords;
  const missingDetails = generatedAnalysis.missingKeywordDetails.slice(0, 5);
  const afterKeywordScore = generatedAnalysis.keywordScore;
  const afterAtsScore = generatedAnalysis.atsScore;
  const evidenceScore = generatedAnalysis.evidenceScore;
  const atsDelta = scoreDelta(currentAtsScore, afterAtsScore);
  const keywordDelta = scoreDelta(currentKeywordScore, afterKeywordScore);
  const evidenceDelta = scoreDelta(currentEvidenceScore, evidenceScore);
  const scoreActions = generatedDraft.diagnostic?.recommendations.slice(0, 3) ??
    buildScoreLiftActions(missingDetails, evidenceScore, afterKeywordScore);

  return (
    <aside className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-on-surface-variant">
            Resume quality metrics
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Use this to see why the draft scores where it does and what to improve next.
          </p>
        </div>
        <span className="w-fit rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
          Comparable scan
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <MetricCard
          label="ATS readiness"
          before={currentAtsScore}
          after={afterAtsScore}
          delta={atsDelta}
          helper="Formatting, structure, and scanner-friendly sections."
          beforeCaption={currentAtsScore === null ? "Upload score unavailable before parse" : scoreLabel(currentAtsScore)}
          afterCaption={scoreLabel(afterAtsScore)}
        />
        <MetricCard
          label="Requirement coverage"
          before={currentKeywordScore}
          after={afterKeywordScore}
          delta={keywordDelta}
          helper="Role language and skills aligned to the job description."
          beforeCaption={currentKeywordScore === null ? "Upload score unavailable before parse" : scoreLabel(currentKeywordScore)}
          afterCaption={`${generatedAnalysis.matchedCount}/${generatedAnalysis.totalKeywords} requirements demonstrated`}
        />
        <MetricCard
          label="Evidence strength"
          before={currentEvidenceScore}
          after={evidenceScore}
          delta={evidenceDelta}
          helper="Quantified bullets, seniority signals, and concrete proof."
          beforeCaption={currentEvidenceScore === null ? "Upload score unavailable before parse" : scoreLabel(currentEvidenceScore)}
          afterCaption={scoreLabel(evidenceScore)}
        />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(280px,1.1fr)]">
        <div className="rounded-lg bg-surface-lowest p-3">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">
            Matched job language
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {matchedAfterKeywords.slice(0, 12).map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-outline-variant/40 bg-surface-container-low px-3 py-1 text-xs text-on-surface-variant"
              >
                {keyword}
              </span>
            ))}
            {matchedAfterKeywords.length === 0 && (
              <span className="text-sm text-on-surface-variant">
                No strong JD keyword matches were detected in the preview.
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-secondary/20 bg-surface-lowest p-3">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">
            Raise the score
          </p>
          <div className="mt-3 space-y-2">
            {scoreActions.map((action, index) => (
              <div
                key={action}
                className="flex flex-col gap-3 rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface sm:flex-row sm:items-center"
              >
                <div className="flex flex-1 gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-on-secondary">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{action}</span>
                </div>
                {activeResumeId && (
                  <Link
                    href={`/workspace/${activeResumeId}?from=preview`}
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-lowest px-3 text-xs font-semibold text-on-surface hover:bg-surface-container"
                  >
                    Improve in editor
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="rounded-lg bg-surface-lowest p-3">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">
            Missing proof to add if true
          </p>
          {missingDetails.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {missingDetails.slice(0, 4).map((item) => (
                <div
                  key={item.term}
                  className="rounded-lg border border-outline-variant/35 bg-surface-container-low p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-on-surface">{item.term}</p>
                    <span className="rounded-full bg-surface-lowest px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                      {item.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                    {item.why}
                  </p>
                  <Link
                    href={
                      activeResumeId
                        ? withReturnTo("/memory", `/upload?resumeId=${activeResumeId}`)
                        : "/memory"
                    }
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:underline"
                  >
                    Add truthful proof
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              The draft covers the top job signals. The remaining work is fact-checking and polish.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-outline-variant/35 bg-surface-lowest p-3">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">
            Career profile connection
          </p>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            Add verified wins, metrics, tools, and projects to your Career Profile so future drafts can lift these scores without retyping proof.
          </p>
          <Link
            href={
              activeResumeId
                ? withReturnTo("/memory", `/upload?resumeId=${activeResumeId}`)
                : "/memory"
            }
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-outline-variant/50 bg-surface-container-low px-3 py-1.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Add reusable evidence
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function MetricCard({
  label,
  before,
  after,
  delta,
  helper,
  beforeCaption,
  afterCaption,
}: {
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  helper: string;
  beforeCaption: string;
  afterCaption: string;
}) {
  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-lowest p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-on-surface">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            {helper}
          </p>
        </div>
        <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface">
          {delta === null ? "Parsed" : delta >= 0 ? `+${delta}` : delta}
        </span>
      </div>
      <div className={clsx("mt-4 grid gap-3", before === null ? "grid-cols-1" : "grid-cols-2")}>
        {before !== null && (
          <ScoreDonut
            label="Before"
            value={before}
            pendingLabel="N/A"
            caption={beforeCaption}
          />
        )}
        <ScoreDonut
          label={before === null ? "Score" : "After"}
          value={after}
          pendingLabel="N/A"
          caption={afterCaption}
          accent
        />
      </div>
    </div>
  );
}

function ExpandableTextarea({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  helperText,
  expanded,
  onToggleExpanded,
  minHeight,
  expandedHeight,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  helperText: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  minHeight: number;
  expandedHeight: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmedLength = value.trim().length;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maxHeight = expanded ? expandedHeight : minHeight;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [expanded, expandedHeight, minHeight, value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-on-surface">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant">
            {trimmedLength} chars
          </span>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-outline-variant px-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {expanded ? "Fit" : "Expand"}
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm leading-relaxed text-on-surface transition-[height] focus:border-secondary focus:outline-none"
      />
      <p className="text-xs leading-relaxed text-on-surface-variant">
        {helperText}
      </p>
    </div>
  );
}

function ScoreDonut({
  label,
  value,
  pendingLabel,
  caption,
  accent = false,
}: {
  label: string;
  value: number | null;
  pendingLabel: string;
  caption: string;
  accent?: boolean;
}) {
  const score = value ?? 0;
  const color = scoreColor(value, accent);
  const background = `conic-gradient(${color} ${score * 3.6}deg, #E6E8EA ${score * 3.6}deg 360deg)`;

  return (
    <div className="rounded-lg bg-surface-lowest p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <div
          role="img"
          aria-label={`${label} resume score ${value === null ? pendingLabel : `${value}%`}`}
          className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full shadow-sm"
          style={{ background }}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-lowest">
            <span className={clsx("text-sm font-semibold", accent ? "text-secondary" : "text-on-surface")}>
              {value === null ? "-" : value}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className={clsx("text-sm font-semibold", accent ? "text-secondary" : "text-on-surface")}>
            {value === null ? pendingLabel : `${value}%`}
          </p>
          <p className="mt-1 text-xs leading-snug text-on-surface-variant">
            {caption}
          </p>
        </div>
      </div>
    </div>
  );
}

function ScanInsightsPanel({ insights }: { insights: ScanInsights }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant/35 bg-surface-container-low">
      <div className="grid gap-4 p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="rounded-xl bg-surface-lowest p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Job alignment
          </p>
          <div className="mt-3">
            <ScoreDonut
              label="Match"
              value={insights.score}
              pendingLabel="Scan"
              caption={insights.fitLabel}
              accent
            />
          </div>
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Gauge size={16} className="text-secondary" />
                <p className="text-sm font-semibold text-on-surface">
                  Resume scan preview
                </p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                {insights.summary}
              </p>
            </div>
            <span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
              {insights.fitLabel}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ScanStat label="Demonstrated" value={insights.matchedCount} />
            <ScanStat label="Not demonstrated" value={insights.missingCount} />
            <ScanStat label="Requirements" value={insights.totalKeywords} />
          </div>

          <FitScale score={insights.score} />
        </div>
      </div>

      <div className="grid border-t border-outline-variant/30 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-outline-variant/30 p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Requirements not demonstrated
          </p>
          {insights.missingKeywordDetails.length > 0 ? (
            <div className="mt-3 space-y-2">
              {insights.missingKeywordDetails.map((keyword) => (
                <div
                  key={keyword.term}
                  className="rounded-lg border border-secondary/20 bg-surface-lowest p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-on-surface">
                      {keyword.term}
                    </span>
                    <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-semibold text-secondary">
                      {keyword.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                    {keyword.why}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-on-surface-variant">
              The resume demonstrates the extracted job requirements. Verify every claim before applying.
            </p>
          )}
        </div>

        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          Quick wins before generating
          </p>
          <ol className="mt-3 space-y-2">
            {insights.quickWins.map((win, index) => (
              <li key={win} className="flex gap-2 text-sm leading-relaxed text-on-surface-variant">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-on-surface text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{win}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function UploadServerScanNotice({
  fileName,
  targetRole,
  targetCompany,
  keywordCount,
  jobSignals,
  resumeMatchScore,
  resumeAtsScore,
  resumeKeywordScore,
  resumeEvidenceScore,
  missingDetails,
  sourceOptions,
  evidenceDrafts,
  onEvidenceChange,
}: {
  fileName: string;
  targetRole: string;
  targetCompany: string;
  keywordCount: number;
  jobSignals: KeywordInsight[];
  resumeMatchScore: number;
  resumeAtsScore: number | null;
  resumeKeywordScore: number;
  resumeEvidenceScore: number | null;
  missingDetails: KeywordInsight[];
  sourceOptions: string[];
  evidenceDrafts: Record<string, EvidenceDraft>;
  onEvidenceChange: (term: string, value: Partial<EvidenceDraft>) => void;
}) {
  const nextSteps = [
    "Parse resume evidence",
    "Compare against JD",
    "Write tailored draft",
  ];
  const dashboardMetrics = [
    {
      label: "Job alignment",
      value: resumeMatchScore,
      caption: matchScoreLabel(resumeMatchScore),
    },
    {
      label: "Requirement coverage",
      value: resumeKeywordScore,
      caption: "Role language",
    },
    {
      label: "Evidence strength",
      value: resumeEvidenceScore ?? 0,
      caption: resumeEvidenceScore === null ? "Not available" : scoreLabel(resumeEvidenceScore),
    },
    {
      label: "ATS structure",
      value: resumeAtsScore ?? 0,
      caption: resumeAtsScore === null ? "Not available" : scoreLabel(resumeAtsScore),
    },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[#2F4A5D] bg-[#101820] text-white shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D8EEFF]/10 ring-1 ring-[#D8EEFF]/20">
                <Gauge size={18} className="text-[#93C5FD]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Job scan dashboard</p>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/62">
                  Ready to parse the resume, compare it to the job, and generate only after the source evidence is read.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 md:w-[360px]">
              <ScanFact label="Resume" value={fileName} dark />
              <ScanFact label="Target" value={[targetRole, targetCompany].filter(Boolean).join(" at ") || "Target job"} dark />
              <ScanFact label="Keywords" value={`${keywordCount}`} dark />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dashboardMetrics.map((metric) => (
              <DashboardGauge
                key={metric.label}
                label={metric.label}
                value={metric.value}
                caption={metric.caption}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-2 rounded-lg bg-white/[0.045] p-2 ring-1 ring-white/10 sm:grid-cols-3">
            {nextSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/78">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#93C5FD] text-[11px] font-semibold text-[#0B1220]">
                  {index + 1}
                </span>
                <span className="truncate">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/[0.055] p-4 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
              Detected signals
            </p>
            <span className="rounded-full bg-[#93C5FD]/15 px-2 py-1 text-[11px] font-semibold text-[#BFDBFE]">
              From JD
            </span>
          </div>
          {jobSignals.length > 0 ? (
            <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto pr-1">
              {jobSignals.slice(0, 8).map((signal) => (
                <div
                  key={signal.term}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.075] px-3 py-2 ring-1 ring-white/10"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{signal.term}</p>
                    <p className="mt-0.5 truncate text-xs text-white/55">{signal.category}</p>
                  </div>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#7DD3FC]" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Paste more of the job description to surface stronger role signals.
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-white/50">
            Resume match is calculated from the selected source against these job signals.
          </p>
        </div>
      </div>

      <EvidenceConfirmationPanel
        missingDetails={missingDetails}
        sourceOptions={sourceOptions}
        evidenceDrafts={evidenceDrafts}
        onEvidenceChange={onEvidenceChange}
        attached
      />
    </div>
  );
}

function EvidenceConfirmationPanel({
  missingDetails,
  sourceOptions = [],
  evidenceDrafts,
  onEvidenceChange,
  attached = false,
}: {
  missingDetails: KeywordInsight[];
  sourceOptions?: string[];
  evidenceDrafts: Record<string, EvidenceDraft>;
  onEvidenceChange: (term: string, value: Partial<EvidenceDraft>) => void;
  attached?: boolean;
}) {
  if (missingDetails.length === 0) return null;

  return (
    <div
      className={clsx(
        "bg-[#0C141C] p-4 text-white",
        attached
          ? "border-t border-white/10"
          : "rounded-xl border border-[#2F4A5D] shadow-sm"
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
            Strengthen this resume with truthful proof
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/62">
            Confirm only what you have actually done. Your details become source evidence for this generation.
          </p>
        </div>
        <span className="text-xs font-semibold text-[#93C5FD]">
          {Object.values(evidenceDrafts).filter(
            (item) => item.confirmed && item.source.trim() && item.details.trim()
          ).length} ready
        </span>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {missingDetails.slice(0, 4).map((item) => {
          const draft = evidenceDrafts[item.term] ?? {
            confirmed: false,
            source: "",
            details: "",
          };
          return (
            <div key={item.term} className="rounded-lg bg-white/[0.06] p-3 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Do you have {item.term} experience?
                  </p>
                  <p className="mt-1 text-xs text-white/55">{item.why}</p>
                </div>
                <div className="flex shrink-0 rounded-lg bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={() => onEvidenceChange(item.term, { confirmed: true })}
                    className={clsx(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                      draft.confirmed ? "bg-[#93C5FD] text-[#0B1220]" : "text-white/65 hover:text-white"
                    )}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onEvidenceChange(item.term, {
                        confirmed: false,
                        source: "",
                        details: "",
                      })
                    }
                    className={clsx(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                      !draft.confirmed ? "bg-white/10 text-white" : "text-white/65 hover:text-white"
                    )}
                  >
                    Not yet
                  </button>
                </div>
              </div>
              {draft.confirmed && (
                <div className="mt-3 space-y-2">
                  {sourceOptions.length > 0 ? (
                    <select
                      aria-label={`Evidence source for ${item.term}`}
                      value={draft.source}
                      onChange={(event) =>
                        onEvidenceChange(item.term, { source: event.target.value })
                      }
                      className="w-full rounded-lg border border-white/15 bg-[#111C26] px-3 py-2 text-sm text-white outline-none focus:border-[#93C5FD]"
                    >
                      <option value="">Choose the employer and role</option>
                      {sourceOptions.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={`Evidence source for ${item.term}`}
                      value={draft.source}
                      onChange={(event) =>
                        onEvidenceChange(item.term, { source: event.target.value })
                      }
                      maxLength={240}
                      placeholder="Employer and role, for example: Northstar Logistics - Operations Manager"
                      className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#93C5FD]"
                    />
                  )}
                  <textarea
                    aria-label={`Evidence details for ${item.term}`}
                    value={draft.details}
                    onChange={(event) =>
                      onEvidenceChange(item.term, { details: event.target.value })
                    }
                    maxLength={600}
                    rows={3}
                    placeholder={`What did you do with ${item.term}? Include scope, tools, and a truthful result.`}
                    className="w-full resize-y rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#93C5FD]"
                  />
                  <p className="text-[11px] leading-relaxed text-white/45">
                    {sourceOptions.length > 0
                      ? "Choose the role where this happened. The proof is attached only to that role."
                      : "Use the employer and role shown in your source resume. Ambiguous proof is not added."}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardGauge({ label, value, caption }: { label: string; value: number; caption: string }) {
  const color = value >= 78 ? "#7DD3FC" : value >= 58 ? "#93C5FD" : value >= 38 ? "#FACC15" : "#FCA5A5";
  const background = `conic-gradient(${color} ${value * 3.6}deg, rgba(255,255,255,0.14) ${value * 3.6}deg 360deg)`;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/[0.075] p-3 ring-1 ring-white/10">
      <div
        role="img"
        aria-label={`${label} ${value}%`}
        className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
        style={{ background }}
      >
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#101820]">
          <span className="text-sm font-semibold text-white">{value}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-white/48">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-white">{caption}</p>
      </div>
    </div>
  );
}

function ScanFact({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={clsx("rounded-lg p-3", dark ? "bg-white/[0.08] ring-1 ring-white/10" : "bg-surface-lowest")}>
      <p className={clsx("truncate text-sm font-semibold", dark ? "text-white" : "text-on-surface")}>{value}</p>
      <p className={clsx("mt-0.5 text-[11px] font-semibold uppercase tracking-wide", dark ? "text-white/50" : "text-on-surface-variant")}>
        {label}
      </p>
    </div>
  );
}

function FitScale({ score }: { score: number }) {
  const bands = ["Limited", "Partial", "Moderate", "Strong"];
  const activeIndex = score >= MATCH_SCORE_BANDS.strong
    ? 3
    : score >= MATCH_SCORE_BANDS.moderate
      ? 2
      : score >= MATCH_SCORE_BANDS.partial
        ? 1
        : 0;

  return (
    <div className="mt-4">
      <div className="grid grid-cols-4 overflow-hidden rounded-full bg-surface-container-high">
        {bands.map((band, index) => (
          <div
            key={band}
            className={clsx(
              "h-2",
              index === 0 && "bg-error/50",
              index === 1 && "bg-[#C7A100]",
              index === 2 && "bg-secondary/70",
              index === 3 && "bg-secondary"
            )}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide">
        {bands.map((band, index) => (
          <span
            key={band}
            className={index === activeIndex ? "text-on-surface" : "text-on-surface-variant"}
          >
            {band}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScanStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-lowest p-3">
      <p className="text-lg font-semibold text-on-surface">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}

function buildQuickWins(missingKeywordDetails: KeywordInsight[], score: number) {
  const wins: string[] = [];
  const named = missingKeywordDetails.filter((item) => item.category === "Named skill or credential");
  const requirements = missingKeywordDetails.filter((item) => item.category === "Job requirement");

  if (named.length > 0) {
    wins.push(`If you genuinely hold ${named.slice(0, 2).map((item) => item.term).join(" or ")}, add it to your skills or certifications.`);
  }
  if (requirements.length > 0) {
    wins.push(`Show where you actually did ${requirements.slice(0, 2).map((item) => item.term).join(" and ")}, with a measurable result.`);
  }
  if (wins.length < 3 && missingKeywordDetails.length > 0) {
    wins.push(`Work these terms in only where true: ${missingKeywordDetails.slice(0, 3).map((item) => item.term).join(", ")}.`);
  }
  if (wins.length < 3) {
    wins.push("Rewrite the strongest experience bullet so it starts with scope, action, and measurable outcome.");
  }
  if (wins.length < 3) {
    wins.push(score < 50
      ? "Add 2-3 role-specific evidence bullets before generating so the draft has stronger material."
      : "Mirror the job's seniority and tools in the first third of the resume."
    );
  }

  return wins.slice(0, 3);
}

function buildScoreLiftActions(
  missingDetails: KeywordInsight[],
  evidenceScore: number | null,
  keywordScore: number | null
) {
  const actions = buildQuickWins(missingDetails, keywordScore ?? 0);

  if ((evidenceScore ?? 0) < 70) {
    actions.unshift("Add one measurable result to the strongest role: scale, percentage, dollars, time saved, or team size.");
  }

  if ((keywordScore ?? 0) < 70 && missingDetails.length > 0) {
    actions.unshift(`Add truthful proof for ${missingDetails.slice(0, 2).map((item) => item.term).join(" and ")} where it naturally belongs.`);
  }

  if (actions.length === 0) {
    actions.push("Use the editor only to tighten wording, verify facts, and keep the resume aligned to the target role.");
  }

  return Array.from(new Set(actions)).slice(0, 3);
}
