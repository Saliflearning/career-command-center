"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  Download,
  ExternalLink,
  FilePlus,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";

interface ResumeItem {
  id: string;
  targetCompany: string | null;
  targetRole: string;
  state: string;
  atsScore: number | null;
  keywordScore: number | null;
  updatedAt: string;
  exportedAt: string | null;
}

interface DashboardSummary {
  totalResumes: number;
  totalApplications: number;
  averageMatchScore: number | null;
  scoredResumeCount: number;
}

interface DashboardResponse {
  resumes: ResumeItem[];
  summary: DashboardSummary;
}

const emptySummary: DashboardSummary = {
  totalResumes: 0, totalApplications: 0, averageMatchScore: null, scoredResumeCount: 0,
};

const workspaceAreas = [
  {
    label: "New Resume",
    href: "/upload",
    icon: FilePlus,
    body: "Upload or paste a resume, add the job description, then generate the tailored draft.",
  },
  {
    label: "Career Profile",
    href: "/memory",
    icon: BadgeCheck,
    body: "Keep verified wins, skills, and reusable proof ready for stronger tailoring.",
  },
  {
    label: "Applications",
    href: "/tracker",
    icon: Briefcase,
    body: "Track where each tailored resume goes after you apply.",
  },
];

export default function DashboardPage() {
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch("/api/resume", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load resume library");

        const data = (await response.json()) as DashboardResponse;
        setResumes(data.resumes);
        setSummary(data.summary);
        setLoadError(false);
      } catch {
        setResumes([]);
        setSummary(emptySummary);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-container px-4 py-4 md:px-8 md:py-10">
        <section>
          <Link
            href="/upload"
            className="group grid overflow-hidden rounded-xl border border-on-surface/10 bg-[#151918] text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            <div className="flex min-h-0 md:min-h-[320px] flex-col justify-between p-5 md:p-10">
              <div className="max-w-3xl">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/50 md:mb-5">
                  Resume workspace
                </p>
                <h1
                  className="max-w-3xl text-[30px] font-semibold leading-tight md:text-[46px]"
                  style={{ fontFamily: "'IBM Plex Serif', serif" }}
                >
                  Bring the resume and job together before you rewrite.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 md:mt-5 md:text-base">
                  Paste or upload the current resume, scan it against the job description,
                  then generate a clean draft you can preview before opening the editor.
                </p>
              </div>
              <span className="mt-5 inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-on-surface transition-transform group-hover:translate-x-1 md:mt-8">
                Start a new resume
                <ArrowRight size={16} />
              </span>
            </div>
            <div className="border-t border-white/10 bg-white/[0.035] p-4 sm:p-5 lg:border-l lg:border-t-0">
              <div className="flex h-full flex-col justify-between rounded-lg border border-white/10 bg-white/[0.06] p-3 sm:rounded-xl sm:p-4">
                <div className="mb-3 flex items-center gap-2 sm:mb-4">
                  <Sparkles size={16} className="text-white/70" />
                  <p className="text-sm font-semibold text-white">Workspace flow</p>
                </div>
                <div data-testid="mobile-workspace-flow" className="grid grid-cols-3 gap-2 sm:grid-cols-1 sm:gap-3">
                  {[
                    { short: "Add", full: "Add resume" },
                    { short: "Scan", full: "Scan target job" },
                    { short: "Preview", full: "Preview then edit" },
                  ].map((step, index) => (
                    <div key={step.full} className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-on-surface">
                        {index + 1}
                      </span>
                      <span className="text-[11px] font-medium leading-tight text-white/80 sm:hidden">{step.short}</span>
                      <span className="hidden text-sm font-medium text-white/80 sm:inline">{step.full}</span>
                    </div>
                  ))}
                </div>
                <div className="hidden sm:block mt-5 rounded-lg bg-white/[0.08] p-3">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/55">
                    <span>Built to keep</span>
                    <CheckCircle2 size={14} />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">
                    Source, job context, scan findings, draft, and editor in one place.
                  </p>
                </div>
              </div>
            </div>
          </Link>
          <p className="mt-3 text-sm text-on-surface-variant">
            No resume yet?{" "}
            <Link href="/quick-resume" className="font-medium text-secondary hover:underline">
              Start from a job description
            </Link>
            .
          </p>
        </section>

        <section className="mt-5 grid gap-5 md:mt-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 rounded-xl border border-outline-variant/30 bg-surface-lowest">
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 p-4 sm:gap-4 sm:p-5">
              <div>
                <h2 className="text-base font-semibold text-on-surface">Recent resumes</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Open a workspace or export its private saved document.
                </p>
              </div>
              <Link
                href="/upload"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-on-surface px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:h-9"
              >
                <FilePlus size={15} />
                New
              </Link>
            </div>

            {loading ? (
              <div className="grid min-h-[220px] place-items-center">
                <Loader2 size={22} className="animate-spin text-on-surface-variant" />
              </div>
            ) : loadError ? (
              <div className="grid min-h-[220px] place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <p className="text-sm font-semibold text-on-surface">
                    Resume library unavailable.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                    Refresh the page to try again. Totals stay hidden until saved data loads.
                  </p>
                </div>
              </div>
            ) : resumes.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-container">
                    <FileText size={20} className="text-on-surface-variant" />
                  </div>
                  <p className="text-sm font-semibold text-on-surface">
                    No resumes yet.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                    Create one tailored resume and it will appear here for quick editing.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/30">
                {resumes.map((resume) => {
                  const score = resume.atsScore ?? resume.keywordScore;
                  const failed = resume.state === "FAILED";

                  return (
                    <div
                      key={resume.id}
                      className="flex flex-col gap-4 p-4 transition-colors hover:bg-surface-container-low sm:flex-row sm:items-center sm:justify-between sm:p-5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/workspace/${resume.id}`}
                          className="block truncate text-sm font-semibold text-on-surface hover:text-secondary"
                        >
                        {resume.targetRole}
                        {resume.targetCompany ? ` at ${resume.targetCompany}` : ""}
                        </Link>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {formatResumeState(resume.state)} - Updated{" "}
                          {new Date(resume.updatedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${failed ? "bg-error/10 text-error" : "bg-surface-container text-on-surface-variant"}`}>
                          {failed ? "Failed" : score !== null ? `${score}% estimate` : "Not scored"}
                        </span>
                        <Link
                          href={`/workspace/${resume.id}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-outline-variant/50 px-2.5 text-xs font-semibold text-on-surface hover:bg-surface-container"
                        >
                          <ExternalLink size={14} />
                          Open
                        </Link>
                        {isResumeExportableState(resume.state) && (
                          <Link
                            href={`/export/${resume.id}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-on-surface px-2.5 text-xs font-semibold text-white hover:opacity-90"
                          >
                            <Download size={14} />
                            {resume.exportedAt ? "Download" : "Export"}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="min-w-0 space-y-5">
            <div className="rounded-xl border border-outline-variant/30 bg-surface-lowest p-5">
              <h2 className="text-sm font-semibold text-on-surface">Library</h2>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Metric label="Saved" value={loadError ? "-" : String(summary.totalResumes)} />
                <Metric label="Tracked" value={loadError ? "-" : String(summary.totalApplications)} />
                <Metric label="Avg estimate" value={loadError || summary.averageMatchScore === null ? "-" : `${summary.averageMatchScore}%`} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
                {loadError
                  ? "Saved totals could not be loaded."
                  : summary.scoredResumeCount > 0
                    ? `Average uses ${summary.scoredResumeCount} saved, scored ${summary.scoredResumeCount === 1 ? "resume" : "resumes"}.`
                    : "No saved resume has a persisted match estimate yet."}
              </p>
            </div>

            <div className="space-y-3">
              {workspaceAreas.map(({ label, href, icon: Icon, body }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex gap-3 rounded-xl border border-outline-variant/30 bg-surface-lowest p-4 transition-colors hover:bg-surface-container-low"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                    <Icon size={18} className="text-on-surface-variant" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface group-hover:text-secondary">
                      {label}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                      {body}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function formatResumeState(state: string) {
  return state
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-3">
      <p className="text-xl font-semibold text-on-surface">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}
