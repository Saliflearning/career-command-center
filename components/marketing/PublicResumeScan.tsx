"use client";

import Link from "next/link";
import { FormEvent, forwardRef, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Gauge,
  Loader2,
  LockKeyhole,
  MinusCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { matchScoreLabel } from "@/lib/resume/match-score";
import {
  completedEvidenceTerms,
  MIN_EVIDENCE_EXAMPLE_CHARS,
  projectAlignmentScores,
  type EvidenceConfirmation,
} from "@/lib/resume/scan-projection";

type ScanKeyword = { term: string; category: string; why: string };
type ScanRequirement = ScanKeyword & {
  importance: "critical" | "important" | "supporting";
  status: "matched" | "missing";
  evidence: string | null;
  source: string;
  weight: number;
  kind: "role" | "phrase" | "named" | "word";
};
type ScanResult = {
  target: { role: string; company: string };
  analysis: {
    score: number;
    atsScore: number;
    keywordScore: number;
    evidenceScore: number;
    signalScore: number;
    fitLabel: string;
    summary: string;
    matchedCount: number;
    missingCount: number;
    totalKeywords: number;
    matchedKeywords: string[];
    requirementDetails: ScanRequirement[];
    missingKeywordDetails: ScanKeyword[];
    quickWins: string[];
  };
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function PublicResumeScan() {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function chooseFile(nextFile: File | null) {
    setError("");
    setResult(null);
    if (!nextFile) return setFile(null);
    const extension = nextFile.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "docx") {
      setFile(null);
      return setError("Choose a PDF or DOCX resume.");
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      setFile(null);
      return setError("Resume files must be 5 MB or smaller.");
    }
    setFile(nextFile);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (mode === "file" && !file) return setError("Choose a resume file.");
    if (mode === "paste" && resumeText.trim().length < 80) {
      return setError("Paste at least 80 characters of resume text.");
    }
    if (jobDescription.trim().length < 50) {
      return setError("Paste at least 50 characters of the job description.");
    }

    setLoading(true);
    try {
      const request = mode === "file"
        ? buildFileRequest(file!, jobDescription)
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resumeText, jobDescription }),
          };
      const response = await fetch("/api/public/resume-scan", request);
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json")
        ? (await response.json().catch(() => null)) as ScanResult | { error?: string } | null
        : null;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? ` Try again in about ${Math.max(1, Math.ceil(retryAfter / 60))} minute${retryAfter > 60 ? "s" : ""}.`
          : " Please wait a few minutes and try again.";
        throw new Error(`This device has reached the free scan limit.${wait}`);
      }
      if (response.status === 403) {
        throw new Error("The security check could not verify this request. Refresh the page and try again.");
      }
      if (!response.ok) {
        throw new Error(body && "error" in body && body.error ? body.error : "The scan could not be completed.");
      }
      if (!body || !("analysis" in body)) throw new Error("The scan returned an unreadable response. Please try again.");
      setResult(body as ScanResult);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The scan could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  function resetScan() {
    setMode("file");
    setFile(null);
    setResumeText("");
    setJobDescription("");
    setResult(null);
    setError("");
    window.setTimeout(() => {
      headingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      headingRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  return (
    <div className="bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-7 max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-secondary">
            <Search size={17} aria-hidden="true" />
            No account required
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="text-[36px] font-semibold leading-tight text-primary outline-none sm:text-[44px]">
            Free Resume Scan
          </h1>
          <p className="mt-3 text-base leading-7 text-on-surface-variant sm:text-lg">
            Compare one resume with one job. See what aligns, what is missing, and what you can truthfully improve before you apply.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <section className="grid items-stretch gap-5 lg:grid-cols-2" aria-label="Resume and job inputs">
            <div className="flex min-h-[430px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-white">
              <div className="border-b border-outline-variant px-5 py-4">
                <div className="flex items-center gap-2">
                  <FileText size={19} aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-on-surface">Current resume</h2>
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">Upload a document or paste its text.</p>
              </div>
              <div className="flex border-b border-outline-variant bg-surface-container-low p-1" role="group" aria-label="Resume source">
                <ModeButton active={mode === "file"} onClick={() => { setMode("file"); setResult(null); setError(""); }}>
                  Upload file
                </ModeButton>
                <ModeButton active={mode === "paste"} onClick={() => { setMode("paste"); setResult(null); setError(""); }}>
                  Paste resume
                </ModeButton>
              </div>
              <div className="flex flex-1 flex-col p-5">
                {mode === "file" ? (
                  file ? (
                    <div className="flex flex-1 flex-col justify-between rounded-lg border border-secondary/30 bg-[#F1F7FF] p-5">
                      <div>
                        <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-white text-secondary shadow-sm">
                          <Check size={22} aria-hidden="true" />
                        </div>
                        <p className="break-words font-semibold text-on-surface">{file.name}</p>
                        <p className="mt-1 text-sm text-on-surface-variant">{formatFileSize(file.size)} · Ready to scan</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => chooseFile(null)}
                        className="mt-6 inline-flex w-fit items-center gap-2 text-sm font-semibold text-error hover:underline"
                      >
                        <X size={16} aria-hidden="true" /> Remove file
                      </button>
                    </div>
                  ) : (
                    <label
                      className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center transition-colors hover:border-secondary hover:bg-[#F1F7FF]"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        chooseFile(event.dataTransfer.files.item(0));
                      }}
                    >
                      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-white text-secondary shadow-sm">
                        <Upload size={23} aria-hidden="true" />
                      </span>
                      <span className="font-semibold text-on-surface">Drop your resume here or browse</span>
                      <span className="mt-2 text-sm text-on-surface-variant">PDF or DOCX, up to 5 MB</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event) => chooseFile(event.target.files?.item(0) ?? null)}
                        className="sr-only"
                        aria-label="Upload resume"
                      />
                    </label>
                  )
                ) : (
                  <div className="flex flex-1 flex-col">
                    <label htmlFor="public-resume-text" className="mb-2 flex justify-between text-sm font-semibold text-on-surface">
                      Resume text <span className="font-normal text-on-surface-variant">{resumeText.length}/30,000</span>
                    </label>
                    <textarea
                      id="public-resume-text"
                      value={resumeText}
                      maxLength={30_000}
                      onChange={(event) => { setResumeText(event.target.value); setResult(null); setError(""); }}
                      placeholder="Paste your current resume text here."
                      className="min-h-[290px] flex-1 resize-y rounded-lg border border-outline-variant bg-white p-4 text-base leading-6 text-on-surface outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-[430px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-white">
              <div className="border-b border-outline-variant px-5 py-4">
                <div className="flex items-center gap-2">
                  <Gauge size={19} aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-on-surface">Target job description</h2>
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">Paste the complete posting for a more useful comparison.</p>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <label htmlFor="public-job-description" className="mb-2 flex justify-between text-sm font-semibold text-on-surface">
                  Job description <span className="font-normal text-on-surface-variant">{jobDescription.length}/40,000</span>
                </label>
                <textarea
                  id="public-job-description"
                  value={jobDescription}
                  maxLength={40_000}
                  onChange={(event) => { setJobDescription(event.target.value); setResult(null); setError(""); }}
                  placeholder="Paste the role title, company, responsibilities, and requirements."
                  className="min-h-[300px] flex-1 resize-y rounded-lg border border-outline-variant bg-white p-4 text-base leading-6 text-on-surface outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-sm text-on-surface-variant">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#13795B]" aria-hidden="true" />
              <p>
                <strong className="text-on-surface">Private by default.</strong> Your resume and job description are processed for this scan and are not saved. Refreshing clears the page.
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
              {loading ? "Scanning..." : "Scan resume free"}
            </button>
          </div>
          {loading ? <p role="status" className="sr-only">Scanning the resume against the job description.</p> : null}
          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-error">{error}</p> : null}
        </form>

        {result ? <ScanReport ref={resultRef} result={result} onReset={resetScan} /> : null}
      </div>
    </div>
  );
}

function buildFileRequest(file: File, jobDescription: string): RequestInit {
  const body = new FormData();
  body.set("file", file);
  body.set("jobDescription", jobDescription);
  return { method: "POST", body };
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 flex-1 rounded-lg text-sm font-semibold transition-colors ${active ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-primary"}`}
    >
      {children}
    </button>
  );
}

const ScanReport = forwardRef<HTMLElement, { result: ScanResult; onReset: () => void }>(
  function ScanReport({ result, onReset }, ref) {
    const { analysis, target } = result;
    const [confirmations, setConfirmations] = useState<Record<string, EvidenceConfirmation>>({});
    const coachRequirements = useMemo(
      () => analysis.requirementDetails
        .filter((item) => item.status === "missing" && item.importance !== "supporting")
        .slice(0, 3),
      [analysis.requirementDetails],
    );
    const completedTerms = useMemo(
      () => completedEvidenceTerms(confirmations),
      [confirmations],
    );
    const projection = useMemo(
      () => projectAlignmentScores(analysis.requirementDetails, completedTerms),
      [analysis.requirementDetails, completedTerms],
    );
    const answeredCount = coachRequirements.filter((item) => {
      const decision = confirmations[item.term]?.decision;
      return decision && decision !== "unanswered";
    }).length;

    function updateConfirmation(term: string, patch: Partial<EvidenceConfirmation>) {
      setConfirmations((current) => {
        const existing = current[term] ?? emptyConfirmation();
        return {
          ...current,
          [term]: { ...existing, ...patch },
        };
      });
    }

    return (
      <section ref={ref} aria-labelledby="public-scan-result-title" className="mt-10 scroll-mt-24 overflow-hidden rounded-xl border border-outline-variant bg-white">
        <p role="status" className="sr-only">
          Scan complete. Overall resume-to-job match: {analysis.score} percent, {analysis.fitLabel}.
        </p>
        <header className="border-b border-outline-variant bg-primary-container px-5 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[#93C5FD]">Your resume-to-job scan</p>
              <h2 id="public-scan-result-title" className="mt-2 text-2xl font-semibold">{analysis.fitLabel}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#D6DFEA]">{analysis.summary}</p>
            </div>
            <div className="shrink-0 text-sm text-[#D6DFEA]">
              <p><strong className="text-white">{target.role || "Role not confidently detected"}</strong></p>
              <p>{target.company || "Company not confidently detected"}</p>
              <button
                type="button"
                onClick={onReset}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/40 px-3 font-semibold text-white hover:bg-white/10"
              >
                <RotateCcw size={16} aria-hidden="true" /> Scan another resume
              </button>
            </div>
          </div>
        </header>

        <div className="p-5 sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <PrimaryAlignment
              value={analysis.score}
              matchedCount={analysis.matchedCount}
              missingCount={analysis.missingCount}
              totalCount={analysis.totalKeywords}
            />

            <section aria-labelledby="priority-gaps-title" className="border-t border-outline-variant pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="text-xs font-semibold uppercase text-on-surface-variant">Focus first</p>
              <h3 id="priority-gaps-title" className="mt-1 text-lg font-semibold text-on-surface">Priority gaps</h3>
              {coachRequirements.length ? (
                <ol className="mt-4 space-y-3">
                  {coachRequirements.map((item, index) => (
                    <li key={`${item.kind}-${item.term}`} className="flex gap-3 text-sm leading-5 text-on-surface">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FFF4CE] text-xs font-bold text-[#765B00]">{index + 1}</span>
                      <span><strong>{item.term}</strong><br /><span className="text-on-surface-variant">{item.importance} requirement</span></span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm leading-6 text-on-surface-variant">No unresolved critical or important requirement was extracted.</p>
              )}
            </section>
          </div>

          <p className="mt-4 text-xs leading-5 text-on-surface-variant">
            This is an explainable estimate from the resume and job description you supplied. It is not an employer, ATS, interview, or hiring guarantee.
          </p>

          <section className="mt-6" aria-labelledby="secondary-diagnostics-title">
            <h3 id="secondary-diagnostics-title" className="text-sm font-semibold text-on-surface">Secondary diagnostics</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DiagnosticScore
                label="ATS readiness"
                value={analysis.atsScore}
                detail="Contact details, standard sections, bullets, dates, and usable length."
                accent="#13795B"
              />
              <DiagnosticScore
                label="Evidence strength"
                value={analysis.evidenceScore}
                detail="Action-led claims with specific scope, outcomes, and truthful measures."
                accent="#8A3FFC"
              />
            </div>
          </section>

          <details className="mt-5 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            <summary className="cursor-pointer font-semibold text-on-surface">How scores are calculated</summary>
            <div className="mt-3 grid gap-2 leading-6 sm:grid-cols-2">
              <p><strong className="text-on-surface">Job alignment:</strong> 40% weighted requirement coverage and 60% high-signal coverage.</p>
              <p><strong className="text-on-surface">ATS readiness:</strong> contact details, standard sections, bullets, dates, and usable length.</p>
              <p><strong className="text-on-surface">Requirement coverage:</strong> {analysis.keywordScore}% of weighted JD requirements are supported by one coherent resume line.</p>
              <p><strong className="text-on-surface">High-signal coverage:</strong> {analysis.signalScore}% of critical, important, named, or multi-word requirements are supported.</p>
              <p className="sm:col-span-2"><strong className="text-on-surface">Separate diagnostics:</strong> ATS readiness and evidence strength do not raise job alignment.</p>
            </div>
          </details>

          <section className="mt-7 border-t border-outline-variant pt-7" aria-labelledby="evidence-coach-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-on-surface">
                  <ClipboardCheck size={19} aria-hidden="true" />
                  <h3 id="evidence-coach-title" className="text-lg font-semibold">Strengthen this scan with truthful evidence</h3>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
                  Answer up to three focused questions. A yes changes nothing until you provide where you used the requirement and a concrete example.
                </p>
              </div>
              <p className="shrink-0 text-xs font-semibold text-on-surface-variant">{answeredCount} of {coachRequirements.length} answered</p>
            </div>

            {coachRequirements.length ? (
              <div className="mt-4 divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant">
                {coachRequirements.map((item, index) => (
                  <EvidencePrompt
                    key={`${item.kind}-${item.term}`}
                    index={index}
                    item={item}
                    confirmation={confirmations[item.term] ?? emptyConfirmation()}
                    onChange={(patch) => updateConfirmation(item.term, patch)}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-[#EFFAF6] px-4 py-3 text-sm text-[#0F5E46]">The scan found no critical evidence question to ask.</p>
            )}

            <div aria-live="polite" className="mt-5 border-l-4 border-secondary bg-[#F1F7FF] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-secondary">Projected alignment</p>
                  {completedTerms.length ? (
                    <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                      <strong className="text-on-surface">{projection.score}% after {completedTerms.length} complete confirmation{completedTerms.length === 1 ? "" : "s"}.</strong>{" "}
                      Your current resume remains at {analysis.score}%. This projection includes candidate-confirmed evidence not yet in your resume.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                      Complete both evidence fields after choosing “I have this” to see a projection. Your current resume remains at {analysis.score}%.
                    </p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-3xl font-semibold text-primary">{completedTerms.length ? projection.score : analysis.score}%</p>
                  <p className="text-xs text-on-surface-variant">{completedTerms.length ? "possible after editing" : "current score"}</p>
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-on-surface-variant">
              These answers stay in this page only and are not saved. Create an account to add verified evidence to your Career Profile.
            </p>
          </section>

          <div className="mt-8 flex flex-col gap-5 border-y border-outline-variant py-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <LockKeyhole size={20} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-on-surface">Turn verified evidence into a stronger application</h3>
                <p className="mt-1 text-sm leading-5 text-on-surface-variant">Create a free account, add truthful details to your Career Profile, and generate a tailored draft you can review and download.</p>
              </div>
            </div>
            <Link href="/signup?callbackUrl=%2Fupload" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-white hover:opacity-90">
              Build my truthful tailored resume <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          <details className="mt-7" open={false}>
            <summary className="cursor-pointer text-sm font-semibold text-secondary hover:underline">Review all requirements and source evidence</summary>
            <section className="mt-5" aria-labelledby="requirement-evidence-title">
              <div className="flex items-center gap-2 text-on-surface">
                <Search size={18} aria-hidden="true" />
                <h3 id="requirement-evidence-title" className="text-lg font-semibold">Requirement evidence</h3>
              </div>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                Each row shows what the job asks for and the resume line that supports it. Missing means no coherent supporting line was found.
              </p>
              <div className="mt-4 divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant">
                {analysis.requirementDetails.map((item) => (
                  <div key={`${item.kind}-${item.term}`} className="grid gap-2 px-4 py-4 md:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-on-surface">{item.term}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.status === "matched" ? "bg-[#EFFAF6] text-[#0F5E46]" : "bg-[#FFF4CE] text-[#765B00]"}`}>
                          {item.status === "matched" ? "Demonstrated" : "Not demonstrated"}
                        </span>
                        <span className="text-[11px] font-semibold uppercase text-on-surface-variant">{item.importance}</span>
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-on-surface-variant">JD: {item.source}</p>
                    </div>
                    <p className="min-w-0 break-words text-sm leading-6 text-on-surface-variant">
                      <strong className="text-on-surface">Resume evidence:</strong>{" "}
                      {item.evidence ?? "No supporting resume line found."}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </details>
        </div>
      </section>
    );
  }
);

function PrimaryAlignment({
  value,
  matchedCount,
  missingCount,
  totalCount,
}: {
  value: number;
  matchedCount: number;
  missingCount: number;
  totalCount: number;
}) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <section aria-labelledby="current-alignment-title">
      <p className="text-xs font-semibold uppercase text-on-surface-variant">Current resume alignment</p>
      <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(#0058BE ${bounded * 3.6}deg, #DDE1E5 ${bounded * 3.6}deg 360deg)` }}
          role="img"
          aria-label={`Job alignment: ${bounded} percent`}
        >
          <span className="grid h-[84px] w-[84px] place-items-center rounded-full bg-white text-3xl font-semibold text-primary">{bounded}</span>
        </div>
        <div className="min-w-0">
          <h3 id="current-alignment-title" className="text-2xl font-semibold text-on-surface">{matchScoreLabel(bounded)}</h3>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">This number reflects only requirements demonstrated in the current resume.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ScanCount label="Requirements demonstrated" value={matchedCount} detail={`of ${totalCount} extracted`} />
            <ScanCount label="Not demonstrated" value={missingCount} detail="add only when true" />
          </div>
        </div>
      </div>
    </section>
  );
}

function DiagnosticScore({ label, value, detail, accent }: { label: string; value: number; detail: string; accent: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className="grid min-h-[96px] grid-cols-[auto_1fr] items-center gap-3 border-l-4 bg-surface-container-low px-4 py-3" style={{ borderColor: accent }}>
      <p className="text-2xl font-semibold text-on-surface" aria-label={`${label}: ${bounded} percent`}>{bounded}</p>
      <div>
        <p className="text-sm font-semibold text-on-surface">{label}</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">{detail}</p>
      </div>
    </div>
  );
}

function EvidencePrompt({
  item,
  index,
  confirmation,
  onChange,
}: {
  item: ScanRequirement;
  index: number;
  confirmation: EvidenceConfirmation;
  onChange: (patch: Partial<EvidenceConfirmation>) => void;
}) {
  const confirmed = confirmation.decision === "confirmed";
  const complete = confirmed &&
    confirmation.context.trim().length >= 3 &&
    confirmation.example.trim().length >= MIN_EVIDENCE_EXAMPLE_CHARS;
  const contextId = `public-evidence-context-${index}`;
  const exampleId = `public-evidence-example-${index}`;
  const helpId = `public-evidence-help-${index}`;

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-on-surface">{item.term}</p>
            <span className="text-[11px] font-semibold uppercase text-on-surface-variant">{item.importance}</span>
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-on-surface-variant">JD: {item.source}</p>
        </div>
        <div className="grid shrink-0 gap-2 sm:grid-cols-3" role="group" aria-label={`Do you have evidence for ${item.term}?`}>
          <DecisionButton
            selected={confirmation.decision === "confirmed"}
            onClick={() => onChange({ decision: "confirmed" })}
            ariaExpanded={confirmed}
            icon={<CheckCircle2 size={16} aria-hidden="true" />}
          >
            I have this
          </DecisionButton>
          <DecisionButton
            selected={confirmation.decision === "not_experienced"}
            onClick={() => onChange({ decision: "not_experienced", context: "", example: "" })}
            icon={<MinusCircle size={16} aria-hidden="true" />}
          >
            Not part of my experience
          </DecisionButton>
          <DecisionButton
            selected={confirmation.decision === "unsure"}
            onClick={() => onChange({ decision: "unsure", context: "", example: "" })}
            icon={<CircleHelp size={16} aria-hidden="true" />}
          >
            Not sure
          </DecisionButton>
        </div>
      </div>

      {confirmed ? (
        <div className="mt-4 grid gap-4 bg-surface-container-low p-4 md:grid-cols-2">
          <div>
            <label htmlFor={contextId} className="text-sm font-semibold text-on-surface">Where did you use it?</label>
            <input
              id={contextId}
              value={confirmation.context}
              maxLength={160}
              onChange={(event) => onChange({ context: event.target.value })}
              placeholder="Role, project, coursework, or volunteer work"
              className="mt-2 min-h-11 w-full rounded-lg border border-outline-variant bg-white px-3 text-base text-on-surface outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              aria-describedby={helpId}
            />
          </div>
          <div>
            <label htmlFor={exampleId} className="text-sm font-semibold text-on-surface">What did you do?</label>
            <textarea
              id={exampleId}
              value={confirmation.example}
              maxLength={600}
              onChange={(event) => onChange({ example: event.target.value })}
              placeholder="Describe a specific task, tool, scope, or outcome. Add a number only when you know it is true."
              className="mt-2 min-h-[92px] w-full resize-y rounded-lg border border-outline-variant bg-white p-3 text-base leading-6 text-on-surface outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              aria-describedby={helpId}
            />
          </div>
          <p id={helpId} className={`text-xs leading-5 md:col-span-2 ${complete ? "text-[#0F5E46]" : "text-on-surface-variant"}`}>
            {complete
              ? "Ready for projection. This detail is still not part of the current resume."
              : `Add a source context and at least ${MIN_EVIDENCE_EXAMPLE_CHARS} characters of specific evidence.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DecisionButton({
  selected,
  onClick,
  icon,
  ariaExpanded,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  ariaExpanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-left text-xs font-semibold transition-colors ${selected ? "border-secondary bg-[#F1F7FF] text-secondary" : "border-outline-variant bg-white text-on-surface hover:border-secondary"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function emptyConfirmation(): EvidenceConfirmation {
  return { decision: "unanswered", context: "", example: "" };
}

function ScanCount({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase text-on-surface-variant">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-on-surface">{value}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{detail}</p>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
