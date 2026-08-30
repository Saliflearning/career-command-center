"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  FilePenLine,
  Download,
  Briefcase,
  GraduationCap,
  Shuffle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  CandidatePath,
  IntakeQuestion,
  QuickResumeContact,
  QuickResumeDraft,
} from "@/lib/resume/quick-resume-contract";
import {
  buildSubmittedEvidenceAnswers,
  getInterviewBatch,
  getInterviewBatchCount,
  isEvidenceResponseComplete,
  type EvidenceChoice,
  type EvidenceResponse,
} from "@/lib/resume/quick-resume-interview";
import { renderAndDownloadPdf } from "@/lib/export/pdf-download";

// ---------------------------------------------------------------------------
// Quick Resume — the no-resume flow. Paste a job description, answer a few
// plain-language questions, get a truthful, JD-aligned resume. The honesty
// guarantee (every number traces to your answers) is shown, not just claimed.
// Questions are signed to the current user and exact JD. The server enforces
// essential answers and attaches contact data without asking the model to edit it.
// ---------------------------------------------------------------------------
interface Grounding {
  grounded: boolean;
  ungroundedNumbers: string[];
  placeholderCount: number;
}

type Step = "jd" | "questions" | "contact" | "result";

const candidatePaths: Array<{
  value: CandidatePath;
  label: string;
  description: string;
  icon: typeof Briefcase;
}> = [
  {
    value: "experienced",
    label: "Relevant work",
    description: "Use jobs, responsibilities, tools, and results.",
    icon: Briefcase,
  },
  {
    value: "early-career",
    label: "Projects or education",
    description: "Use coursework, projects, volunteering, or internships.",
    icon: GraduationCap,
  },
  {
    value: "career-change",
    label: "Transferable experience",
    description: "Connect adjacent work and skills to this role.",
    icon: Shuffle,
  },
];

export default function QuickResumePage() {
  const [step, setStep] = useState<Step>("jd");
  const [jd, setJd] = useState("");
  const [candidatePath, setCandidatePath] = useState<CandidatePath>("experienced");
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [intakeToken, setIntakeToken] = useState("");
  const [responses, setResponses] = useState<Record<string, EvidenceResponse>>({});
  const [batchIndex, setBatchIndex] = useState(0);
  const [contact, setContact] = useState<QuickResumeContact>({
    name: "",
    email: "",
    phone: "",
    linkedin: "",
    location: "",
  });
  const [draft, setDraft] = useState<QuickResumeDraft | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [grounding, setGrounding] = useState<Grounding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);

  async function downloadPdf() {
    if (!resumeId || !draft || pdfBusy) return;

    setPdfBusy(true);
    setPdfMessage(null);
    setError(null);
    try {
      await renderAndDownloadPdf({
        resumeId,
        filename: `${draft.personalInfo.name} ${draft.targetTitle} Resume`,
      });
      setPdfMessage("Your PDF download has started.");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "The PDF could not be prepared. Please try again."
      );
    } finally {
      setPdfBusy(false);
    }
  }

  async function getQuestions() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/quick-resume/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobDescription: jd, candidatePath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (!Array.isArray(data.questions) || typeof data.intakeToken !== "string") {
        throw new Error("The question session was incomplete. Please try again.");
      }
      setQuestions(data.questions);
      setIntakeToken(data.intakeToken);
      setResponses({});
      setBatchIndex(0);
      setStep("questions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      if (!intakeToken) throw new Error("Your question session expired. Please start again.");
      const submittedAnswers = buildSubmittedEvidenceAnswers(questions, responses);
      const res = await fetch("/api/quick-resume/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobDescription: jd,
          intakeToken,
          answers: submittedAnswers,
          contact,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (!data.draft || typeof data.resumeId !== "string" || !data.resumeId.trim()) {
        throw new Error("The saved resume response was incomplete. Please try again.");
      }
      setDraft(data.draft);
      setResumeId(data.resumeId);
      setGrounding(data.grounding);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const batchCount = getInterviewBatchCount(questions);
  const currentBatch = getInterviewBatch(questions, batchIndex);
  const currentBatchComplete = currentBatch.every(({ id }) =>
    isEvidenceResponseComplete(responses[id])
  );
  const allQuestionsComplete = questions.every(({ id }) =>
    isEvidenceResponseComplete(responses[id])
  );
  const contactComplete = contact.name.trim().length >= 2 && /.+@.+\..+/.test(contact.email.trim());

  function chooseEvidence(questionId: string, choice: EvidenceChoice) {
    setResponses((current) => ({
      ...current,
      [questionId]: {
        choice,
        details: choice === "yes" ? current[questionId]?.details ?? "" : "",
      },
    }));
  }

  function moveForward() {
    if (!currentBatchComplete) return;
    if (batchIndex < batchCount - 1) {
      setBatchIndex((current) => current + 1);
      return;
    }
    setStep("contact");
  }

  function moveBack() {
    if (batchIndex > 0) {
      setBatchIndex((current) => current - 1);
      return;
    }
    setStep("jd");
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link href="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={16} /> Dashboard
        </Link>

        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Start from a job description</h1>
          <p className="mt-1 text-on-surface-variant">
            No resume yet? Paste the job you want, answer a few quick questions, and get a resume built only from what you tell us.
          </p>
        </header>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {step === "jd" && (
          <section className="space-y-4">
            <label className="block text-sm font-medium">Paste the full job description</label>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={12}
              placeholder="Paste the whole posting here..."
              className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
            <fieldset>
              <legend className="text-sm font-medium">What can we use as your strongest evidence?</legend>
              <p className="mt-1 text-xs text-on-surface-variant">
                This changes the questions, not the standard. We will only use facts you confirm.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {candidatePaths.map(({ value, label, description, icon: Icon }) => {
                  const selected = candidatePath === value;
                  return (
                    <label
                      key={value}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        selected
                          ? "border-secondary bg-secondary/5"
                          : "border-outline-variant bg-surface-lowest hover:border-outline"
                      }`}
                    >
                      <input
                        type="radio"
                        name="candidate-path"
                        value={value}
                        checked={selected}
                        onChange={() => setCandidatePath(value)}
                        className="sr-only"
                      />
                      <Icon size={18} className={selected ? "text-secondary" : "text-on-surface-variant"} />
                      <span className="mt-2 block text-sm font-semibold">{label}</span>
                      <span className="mt-1 block text-xs leading-5 text-on-surface-variant">{description}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <button
              onClick={getQuestions}
              disabled={loading || jd.trim().length < 40}
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {loading && <Loader2 size={16} className="animate-spin" />} Analyze job and start
            </button>
          </section>
        )}

        {step === "questions" && (
          <section className="space-y-6">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Job evidence</p>
                  <h2 className="mt-1 text-xl font-semibold">
                    A few questions about what you have done
                  </h2>
                </div>
                <span className="shrink-0 text-sm text-on-surface-variant">
                  {Math.min(batchIndex * 3 + 1, questions.length)}–{Math.min((batchIndex + 1) * 3, questions.length)} of {questions.length}
                </span>
              </div>
              <p className="mt-2 text-sm text-on-surface-variant">
                These came from the job description. A truthful “No” is useful and will never be turned into a claim.
              </p>
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-container-high"
                role="progressbar"
                aria-label="Evidence questions completed"
                aria-valuemin={0}
                aria-valuemax={batchCount}
                aria-valuenow={batchIndex + 1}
              >
                <div
                  className="h-full rounded-full bg-secondary transition-[width]"
                  style={{ width: `${batchCount > 0 ? ((batchIndex + 1) / batchCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="space-y-4">
              {currentBatch.map((question) => {
                const response = responses[question.id];
                return (
                  <fieldset key={question.id} className="rounded-lg border border-outline-variant bg-surface-lowest p-4">
                    <legend className="px-1 text-sm font-semibold">{question.question}</legend>
                    <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={question.question}>
                      {(["yes", "no", "unsure"] as const).map((choice) => {
                        const selected = response?.choice === choice;
                        const label = choice === "yes" ? "Yes" : choice === "no" ? "No" : "Not sure";
                        return (
                          <button
                            key={choice}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => chooseEvidence(question.id, choice)}
                            className={`min-h-10 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                              selected
                                ? "border-secondary bg-secondary text-white"
                                : "border-outline-variant bg-surface hover:border-outline"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {response?.choice === "yes" && (
                      <label className="mt-4 block text-sm font-medium">
                        Tell us where you used it
                        <textarea
                          value={response.details}
                          onChange={(event) => setResponses((current) => ({
                            ...current,
                            [question.id]: { choice: "yes", details: event.target.value },
                          }))}
                          rows={3}
                          maxLength={2000}
                          placeholder="Add the project or role, what you did, and a result or scale if you know it."
                          className="mt-1.5 w-full resize-y rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                        />
                      </label>
                    )}
                  </fieldset>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-outline-variant pt-4">
              <button
                type="button"
                onClick={moveBack}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                type="button"
                onClick={moveForward}
                disabled={!currentBatchComplete}
                className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {batchIndex < batchCount - 1 ? "Next questions" : "Add contact details"}
                <ChevronRight size={16} />
              </button>
            </div>
          </section>
        )}

        {step === "contact" && (
          <section className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Final step</p>
              <h2 className="mt-1 text-xl font-semibold">Add your resume header</h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                These details are inserted exactly as entered. The AI cannot rewrite them.
              </p>
            </div>

            <div className="grid gap-4 rounded-lg border border-outline-variant bg-surface-lowest p-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Full name
                <input
                  value={contact.name}
                  onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
                  maxLength={100}
                  autoComplete="name"
                  required
                  className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </label>
              <label className="text-sm font-medium">
                Email
                <input
                  type="email"
                  value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                  maxLength={254}
                  autoComplete="email"
                  required
                  className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </label>
              <label className="text-sm font-medium">
                Phone <span className="text-xs font-normal text-on-surface-variant">(optional)</span>
                <input
                  value={contact.phone}
                  onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                  maxLength={40}
                  autoComplete="tel"
                  className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </label>
              <label className="text-sm font-medium">
                Location <span className="text-xs font-normal text-on-surface-variant">(optional)</span>
                <input
                  value={contact.location}
                  onChange={(event) => setContact((current) => ({ ...current, location: event.target.value }))}
                  maxLength={120}
                  autoComplete="address-level2"
                  className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                LinkedIn <span className="text-xs font-normal text-on-surface-variant">(optional)</span>
                <input
                  value={contact.linkedin}
                  onChange={(event) => setContact((current) => ({ ...current, linkedin: event.target.value }))}
                  maxLength={200}
                  autoComplete="url"
                  placeholder="linkedin.com/in/your-name"
                  className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-outline-variant pt-4">
              <button
                type="button"
                onClick={() => {
                  setBatchIndex(Math.max(batchCount - 1, 0));
                  setStep("questions");
                }}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={generate}
                disabled={loading || !allQuestionsComplete || !contactComplete}
                className="inline-flex items-center gap-2 rounded-lg bg-secondary px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading && <Loader2 size={16} className="animate-spin" />} Build my resume
              </button>
            </div>
          </section>
        )}

        {step === "result" && draft && (
          <section className="space-y-6">
            {grounding && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                  grounding.grounded
                    ? "border-secondary/40 bg-secondary/5 text-secondary"
                    : "border-error/40 bg-error/5 text-error"
                }`}
              >
                {grounding.grounded ? <ShieldCheck size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
                <div>
                  {grounding.grounded ? (
                    <span><b>Verified truthful.</b> Every number in this resume comes from what you told us.</span>
                  ) : (
                    <span><b>Please review:</b> these numbers were not in your answers — remove them or add where they came from: {grounding.ungroundedNumbers.join(", ")}.</span>
                  )}
                </div>
              </div>
            )}

            <article className="rounded-xl border border-outline-variant bg-surface-lowest p-6 shadow-sm">
              <header className="border-b border-outline-variant pb-4 text-center">
                <h2 className="text-xl font-semibold">{draft.personalInfo.name}</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {[
                    draft.personalInfo.email,
                    draft.personalInfo.phone,
                    draft.personalInfo.linkedin,
                    draft.personalInfo.location,
                  ].filter(Boolean).join(" | ")}
                </p>
                <p className="mt-2 text-sm font-medium">{draft.targetTitle}</p>
              </header>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Summary</h3>
              <p className="mt-1 text-sm">{draft.summary}</p>

              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Core Skills</h3>
              <p className="mt-1 text-sm">{draft.coreSkills.join(" · ")}</p>

              {draft.experience.length > 0 && (
                <>
                  <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Experience</h3>
                  {draft.experience.map((experience, index) => (
                    <div key={`${experience.company}-${experience.title}-${index}`} className="mt-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-sm font-semibold">{experience.title}</p>
                        {experience.dateLabel && (
                          <p className="text-xs text-on-surface-variant">{experience.dateLabel}</p>
                        )}
                      </div>
                      {(experience.company || experience.location) && (
                        <p className="text-xs font-medium text-secondary">
                          {[experience.company, experience.location].filter(Boolean).join(" | ")}
                        </p>
                      )}
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                        {experience.bullets.map((bullet, bulletIndex) => (
                          <li key={bulletIndex}>{bullet}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}

              {draft.projects.length > 0 && (
                <>
                  <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Projects</h3>
                  <div className="mt-2 space-y-3">
                    {draft.projects.map((project, index) => (
                      <article key={`${project.name}-${index}`}>
                        <p className="text-sm font-semibold">{project.name}</p>
                        {project.technologies.length > 0 && (
                          <p className="text-xs font-medium text-secondary">
                            {project.technologies.join(" | ")}
                          </p>
                        )}
                        <p className="mt-1 text-sm leading-relaxed">{project.description}</p>
                        {project.url && (
                          <p className="mt-1 break-all text-xs text-on-surface-variant">{project.url}</p>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}

              {draft.education.length > 0 && (
                <>
                  <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Education</h3>
                  <div className="mt-1 space-y-2 text-sm">
                    {draft.education.map((education, index) => (
                      <div key={`${education.institution}-${education.degree}-${index}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className="font-medium">{education.degree}</p>
                          {education.dateLabel && (
                            <p className="text-xs text-on-surface-variant">{education.dateLabel}</p>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant">{education.institution}</p>
                        {education.details && <p className="mt-0.5 text-xs">{education.details}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {draft.certifications.length > 0 && (
                <>
                  <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Certifications</h3>
                  <div className="mt-1 space-y-1 text-sm">
                    {draft.certifications.map((certification, index) => (
                      <p key={`${certification.name}-${index}`}>
                        {certification.name}
                        {certification.issuer ? ` | ${certification.issuer}` : ""}
                        {certification.dateLabel ? ` | ${certification.dateLabel}` : ""}
                      </p>
                    ))}
                  </div>
                </>
              )}
            </article>

            {draft.honestStretchNote && (
              <aside className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
                <div>
                  <p className="font-semibold text-on-surface">Application guidance</p>
                  <p className="mt-1 leading-relaxed">{draft.honestStretchNote}</p>
                </div>
              </aside>
            )}

            {resumeId && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface-lowest p-4">
                <div className="mr-auto">
                  <p className="text-sm font-semibold">Saved to your resume workspace</p>
                  <p className="text-xs text-on-surface-variant">
                    Keep reviewing here, edit it, or download the same saved draft as a PDF.
                  </p>
                </div>
                <Link
                  href={`/workspace/${resumeId}?from=preview`}
                  className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold hover:bg-surface-container-low"
                >
                  <FilePenLine size={16} /> Open editor
                </Link>
                <button
                  type="button"
                  onClick={() => void downloadPdf()}
                  disabled={pdfBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {pdfBusy ? "Preparing PDF" : "Download PDF"}
                </button>
                <Link
                  href={`/export/${resumeId}`}
                  className="text-sm font-semibold text-on-surface-variant hover:text-on-surface"
                >
                  Export options
                </Link>
                {pdfMessage && (
                  <p role="status" className="w-full text-xs font-medium text-secondary">
                    {pdfMessage}
                  </p>
                )}
              </div>
            )}

            {draft.placeholdersForUser.length > 0 && (
              <div className="rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
                <b>Finish these yourself</b> — we left them blank instead of making them up:
                <ul className="mt-1 list-disc pl-5 text-on-surface-variant">
                  {draft.placeholdersForUser.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            <button onClick={() => {
              setStep("jd");
              setDraft(null);
              setResumeId(null);
              setGrounding(null);
              setQuestions([]);
              setIntakeToken("");
              setResponses({});
              setBatchIndex(0);
              setPdfBusy(false);
              setPdfMessage(null);
            }} className="text-sm text-on-surface-variant hover:text-on-surface">
              Start over
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
