"use client";

import { type CSSProperties, type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Building2,
  Briefcase,
  FileText,
  Sliders,
  ChevronDown,
  ChevronUp,
  Target,
  Type,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import AIRewritePanel from "@/components/resume/AIRewritePanel";
import { withReturnTo } from "@/lib/navigation/return-path";
import { classifyResumeContentResponse } from "@/lib/resume/content-contract";
import { classifyResumeStatusResponse } from "@/lib/resume/status-contract";
import {
  formatCertificationLabel,
  formatEducationDateUtc,
  formatMonthYearRangeUtc,
  formatYearUtc,
} from "@/lib/resume/date-format";
import { BulletEditHistory } from "@/lib/resume/editor-history";
import {
  rollbackOptimisticBulletEdit,
  summaryToEditorDocument,
} from "@/lib/resume/editor-content";
import { EditorSaveQueue } from "@/lib/resume/editor-save-queue";
import { renderAndDownloadPdf } from "@/lib/export/pdf-download";
import { getTeachingConfirmation } from "@/lib/resume/teaching-confirmation";
import {
  DEFAULT_RESUME_PRESENTATION,
  resumeFontFamily,
  type ResumeDensity,
  type ResumeFont,
  type ResumePresentation,
  type ResumeScale,
} from "@/lib/resume/presentation";

// ── API response types ───────────────────────────────────────────────────────

interface BulletEntry {
  bulletId: string;
  content: string;
  contentType: string;
}

interface WorkHistoryEntry {
  workHistoryId: string;
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  current: boolean;
  dateLabel?: string;
  sortOrder: number;
  bullets: BulletEntry[];
}

interface SectionEntry {
  name: string;
  sortOrder: number;
  visible: boolean;
  content: string | null;
}

interface EducationEntry {
  degree: string;
  institution: string;
  graduationDate: string | null;
  inProgress: boolean;
  gpa: string | null;
  dateLabel?: string;
  details?: string;
}

interface SkillEntry {
  name: string;
  category: string | null;
}

interface CertificationEntry {
  name: string;
  issuingBody: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  dateLabel?: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  description: string | null;
  technologies: string[];
  url: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface ContentResponse {
  resumeId: string;
  documentRevision: number;
  targetRole: string;
  targetCompany: string | null;
  roleType: string | null;
  state: string;
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateLinkedin: string | null;
  candidateLocation: string | null;
  candidateWebsite: string | null;
  candidateHeadline: string | null;
  honestStretchNote: string | null;
  summaryText: string | null;
  presentation: ResumePresentation;
  sections: SectionEntry[];
  workHistory: WorkHistoryEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  skills: SkillEntry[];
  projects: ProjectEntry[];
  atsScore: number | null;
  keywordScore: number | null;
  hasLatex: boolean;
}

interface EditorMutationResponse {
  error?: string;
  documentRevision?: number;
  previousBulletId?: string;
  bulletId?: string;
  content?: string;
  contentType?: string;
  presentation?: ResumePresentation;
  teachingExampleRevoked?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TERMINAL_SUCCESS = new Set(["QA_REVIEWED", "USER_EDITING", "EXPORTED", "TRACKED"]);
const NEEDS_TARGET = new Set(["UPLOADED", "PARSED", "NORMALIZED", "VERIFIED"]);
const GENERATING_STATES = new Set(["JD_ANALYZED", "STRATEGY_READY", "GENERATING"]);
const POLL_INTERVAL_MS = 2_500;
const toneOptions = ["Executive", "Technical", "Leadership-first", "Startup"];
const structureOptions = ["Hybrid Executive", "Chronological", "Functional", "Compact"];

type WorkspacePhase = "loading" | "needs-target" | "generating" | "ready" | "failed" | "error";

// ── Date formatting ──────────────────────────────────────────────────────────

function formatPeriod(
  startDate: string,
  endDate: string | null,
  current: boolean,
  dateLabel?: string
): string {
  return dateLabel?.trim() || formatMonthYearRangeUtc(startDate, endDate, current);
}

// ── Main component ───────────────────────────────────────────────────────────

function formatYear(iso: string | null): string {
  return formatYearUtc(iso);
}

function groupSkillsByCategory(skills: SkillEntry[]) {
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

export default function WorkspacePage() {
  const { resumeId } = useParams<{ resumeId: string }>();
  const router = useRouter();
  const editorSaveQueueRef = useRef(new EditorSaveQueue());
  const documentSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const documentRevisionRef = useRef(1);
  const presentationRevisionRef = useRef(0);
  const bulletHistoryRef = useRef(new BulletEditHistory());
  const [, setBulletHistoryRevision] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [teachingApproved, setTeachingApproved] = useState(false);
  const [teachingBusy, setTeachingBusy] = useState(false);
  const [teachingConfirmationOpen, setTeachingConfirmationOpen] = useState(false);
  const [teachingMessage, setTeachingMessage] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);

  // Workspace state
  const [phase, setPhase] = useState<WorkspacePhase>("loading");
  const [data, setData] = useState<ContentResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Targeting form state
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");
  const [tone, setTone] = useState("Executive");
  const [structure, setStructure] = useState("Hybrid Executive");
  const [submitting, setSubmitting] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Generating state
  const [progress, setProgress] = useState(5);
  const [statusLabel, setStatusLabel] = useState("Preparing...");
  const [elapsedSec, setElapsedSec] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // AI panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedBullet, setSelectedBullet] = useState<string | null>(null);
  const [selectedBulletId, setSelectedBulletId] = useState<string | null>(null);
  const [resumeFont, setResumeFont] = useState<ResumeFont>(DEFAULT_RESUME_PRESENTATION.font);
  const [resumeScale, setResumeScale] = useState<ResumeScale>(DEFAULT_RESUME_PRESENTATION.scale);
  const [resumeDensity, setResumeDensity] = useState<ResumeDensity>(DEFAULT_RESUME_PRESENTATION.density);

  // Ready-state job context is intentionally hidden for now so the resume
  // remains the main editing surface. Keeping the switch makes this reversible.
  const showReadyContextPanel = false;
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // Tiptap editor
  const editor = useEditor({
    extensions: [StarterKit.configure({ bold: false, italic: false })],
    content: summaryToEditorDocument(null),
    editorProps: {
      attributes: {
        class:
          "text-[12.5px] text-on-surface leading-[1.48] focus:outline-none min-h-[44px] rounded-sm focus:ring-1 focus:ring-secondary/25",
      },
    },
  });
  const loadedSummaryText = data?.summaryText;

  useEffect(() => {
    if (data?.documentRevision) documentRevisionRef.current = data.documentRevision;
  }, [data?.documentRevision]);

  // ── Initial load — determine workspace phase ──────────────────────────────

  useEffect(() => {
    async function loadInitial() {
      try {
        // HTTP 202 is a successful transport response, but it is not completed content.
        const contentRes = await fetch(`/api/resume/${resumeId}/content`);
        const contentPayload = await contentRes.json().catch(() => null);
        const contentResult = classifyResumeContentResponse(contentRes.status, contentPayload);

        if (contentResult.kind === "unauthorized") {
          router.push(
            `/signin?callbackUrl=${encodeURIComponent(`/workspace/${resumeId}`)}`
          );
          return;
        }

        if (contentResult.kind === "ready") {
          setData(contentResult.data);
          setPhase("ready");
          return;
        }

        if (contentResult.kind === "unavailable" || contentResult.kind === "error") {
          setErrorMsg(contentResult.message);
          setPhase("error");
          return;
        }

        // If 202, check status to determine phase
        const statusRes = await fetch(`/api/resume/${resumeId}/status`);
        const statusPayload = await statusRes.json().catch(() => null);
        const statusResult = classifyResumeStatusResponse(
          statusRes.status,
          statusPayload
        );
        if (statusResult.kind === "unauthorized") {
          router.push(
            `/signin?callbackUrl=${encodeURIComponent(`/workspace/${resumeId}`)}`
          );
          return;
        }
        if (statusResult.kind !== "ready") {
          setErrorMsg(statusResult.message);
          setPhase("error");
          return;
        }

        const status = statusResult.data;
        if (NEEDS_TARGET.has(status.state)) {
          setPhase("needs-target");
        } else if (GENERATING_STATES.has(status.state)) {
          setProgress(status.progressPercent);
          setStatusLabel(status.label);
          setPhase("generating");
        } else if (status.state === "FAILED") {
          setPhase("failed");
        } else if (TERMINAL_SUCCESS.has(status.state)) {
          // Content should have been available — retry
          setErrorMsg("Resume is ready but content could not be loaded. Please refresh.");
          setPhase("error");
        } else {
          setPhase("needs-target");
        }
      } catch {
        setErrorMsg("Failed to connect. Please refresh the page.");
        setPhase("error");
      }
    }
    loadInitial();
  }, [resumeId, editor, router]);

  // Update editor when data arrives later
  useEffect(() => {
    if (editor && loadedSummaryText !== undefined) {
      editor.commands.setContent(summaryToEditorDocument(loadedSummaryText));
    }
  }, [editor, loadedSummaryText]);

  useEffect(() => {
    if (phase !== "ready") return;
    let active = true;
    void fetch(`/api/resume/${resumeId}/teaching-example`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { approved?: boolean };
        if (active && response.ok) setTeachingApproved(body.approved === true);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [phase, resumeId]);

  useEffect(() => {
    if (!data) return;
    setRole((current) => current || data.targetRole || "");
    setCompany((current) => current || data.targetCompany || "");
    setResumeFont(data.presentation.font);
    setResumeScale(data.presentation.scale);
    setResumeDensity(data.presentation.density);
  }, [data]);

  // ── Elapsed timer (only while generating) ──────────────────────────────────

  useEffect(() => {
    if (phase !== "generating") return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── Poll status while generating ───────────────────────────────────────────

  useEffect(() => {
    if (phase !== "generating") return;

    async function poll() {
      try {
        const res = await fetch(`/api/resume/${resumeId}/status`);
        const statusPayload = await res.json().catch(() => null);
        const statusResult = classifyResumeStatusResponse(res.status, statusPayload);
        if (statusResult.kind === "unauthorized") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(
            `/signin?callbackUrl=${encodeURIComponent(`/workspace/${resumeId}`)}`
          );
          return;
        }
        if (statusResult.kind !== "ready") {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMsg(statusResult.message);
          setPhase("error");
          return;
        }
        const status = statusResult.data;

        setProgress(status.progressPercent);
        setStatusLabel(status.label);

        if (TERMINAL_SUCCESS.has(status.state)) {
          const contentRes = await fetch(`/api/resume/${resumeId}/content`);
          const contentPayload = await contentRes.json().catch(() => null);
          const contentResult = classifyResumeContentResponse(contentRes.status, contentPayload);
          if (contentResult.kind === "unauthorized") {
            if (pollRef.current) clearInterval(pollRef.current);
            router.push(
              `/signin?callbackUrl=${encodeURIComponent(`/workspace/${resumeId}`)}`
            );
            return;
          }
          if (contentResult.kind === "ready") {
            if (pollRef.current) clearInterval(pollRef.current);
            setData(contentResult.data);
            setTimeout(() => setPhase("ready"), 400);
            return;
          }

          if (contentResult.kind === "processing") {
            setStatusLabel(contentResult.message ?? "Finalizing resume content");
            return;
          }

          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMsg(contentResult.message);
          setPhase("error");
          return;
        }

        if (status.state === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase("failed");
        }
      } catch {
        // keep polling
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, resumeId, editor, router]);

  // ── Submit targeting form ──────────────────────────────────────────────────

  const canSubmitTarget = company.trim() && role.trim() && jd.trim().length > 20 && !submitting;

  const handleTargetSubmit = useCallback(async () => {
    if (!canSubmitTarget) return;
    setSubmitting(true);
    setTargetError(null);

    try {
      const res = await fetch(`/api/resume/${resumeId}/jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText: jd.trim(),
          targetRole: role.trim(),
          targetCompany: company.trim(),
          tone,
          structure,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to start generation");
      }

      // Transition to generating phase
      setProgress(5);
      setElapsedSec(0);
      setStatusLabel("Starting generation...");
      setPhase("generating");
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmitTarget, resumeId, jd, role, company, tone, structure]);

  // ── Bullet interactions ────────────────────────────────────────────────────

  const handleBulletClick = (bulletContent: string, bulletId: string) => {
    setSelectedBullet(bulletContent);
    setSelectedBulletId(bulletId);
    setPanelOpen(true);
  };

  const trackEditorSave = useCallback((save: Promise<unknown>) => {
    setSaveState("saving");
    setSaveError(null);
    const tracked = editorSaveQueueRef.current.track(save);
    void tracked
      .then(() => {
        if (editorSaveQueueRef.current.size === 0) setSaveState("saved");
      })
      .catch((error) => {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Your edit could not be saved.");
      });
    return tracked;
  }, []);

  const runSerializedEditorMutation = useCallback((
    operation: (expectedRevision: number) => Promise<EditorMutationResponse>
  ): Promise<EditorMutationResponse> => {
    const scheduled = documentSaveChainRef.current
      .catch(() => undefined)
      .then(() => operation(documentRevisionRef.current));
    const committed = scheduled.then((body) => {
      if (!body.documentRevision) {
        throw new Error("The server did not confirm the saved document revision.");
      }
      documentRevisionRef.current = body.documentRevision;
      setData((current) => current ? {
        ...current,
        documentRevision: body.documentRevision!,
        state: current.state === "EXPORTED" || current.state === "QA_REVIEWED"
          ? "USER_EDITING"
          : current.state,
        atsScore: null,
        keywordScore: null,
        hasLatex: false,
      } : current);
      return body;
    });
    documentSaveChainRef.current = committed.then(() => undefined, () => undefined);
    return committed;
  }, []);

  const persistBulletEdit = useCallback((
    bulletId: string,
    newText: string,
    options: { force?: boolean } = {}
  ): Promise<string> => {
    const trimmed = newText.replace(/\s+/g, " ").trim();
    if (!trimmed) return Promise.resolve(bulletId);

    const existing = data?.workHistory
      .flatMap((work) => work.bullets)
      .find((bullet) => bullet.bulletId === bulletId);
    if (!options.force && (!existing || existing.content === trimmed)) {
      return Promise.resolve(existing?.bulletId ?? bulletId);
    }
    const previousContent = existing?.content ?? "";

    setData((current) => current ? {
      ...current,
      workHistory: current.workHistory.map((work) => ({
        ...work,
        bullets: work.bullets.map((bullet) =>
          bullet.bulletId === bulletId ? { ...bullet, content: trimmed } : bullet
        ),
      })),
    } : current);

    let savedBulletId = bulletId;
    const save = runSerializedEditorMutation(async (expectedRevision) => {
      const response = await fetch(`/api/resume/${resumeId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          type: "bullet",
          bulletId,
          content: trimmed,
          expectedRevision,
        }),
      });
      const body = await response.json().catch(() => ({})) as EditorMutationResponse;
      if (!response.ok || !body.bulletId || !body.content) {
        throw new Error(body.error ?? "Your bullet could not be saved.");
      }
      return body;
    }).then((body) => {
      savedBulletId = body.bulletId!;
      setData((current) => current ? {
        ...current,
        workHistory: current.workHistory.map((work) => ({
          ...work,
          bullets: work.bullets.map((bullet) =>
            bullet.bulletId === (body.previousBulletId ?? bulletId)
              ? {
                  ...bullet,
                  bulletId: body.bulletId!,
                  content: body.content!,
                  contentType: body.contentType ?? "USER_EDITED",
                }
              : bullet
          ),
        })),
      } : current);
      setSelectedBulletId((current) =>
        current === (body.previousBulletId ?? bulletId) ? body.bulletId! : current
      );
      if (body.teachingExampleRevoked) setTeachingApproved(false);
    }).catch((error) => {
      setData((current) => current ? {
        ...current,
        workHistory: rollbackOptimisticBulletEdit(
          current.workHistory,
          bulletId,
          trimmed,
          previousContent
        ),
      } : current);
      throw error;
    });

    return trackEditorSave(save).then(() => savedBulletId);
  }, [data, resumeId, runSerializedEditorMutation, trackEditorSave]);

  const persistSummaryEdit = useCallback((newText: string): Promise<void> => {
    const trimmed = newText.replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed === data?.summaryText) return Promise.resolve();
    setData((current) => current ? { ...current, summaryText: trimmed } : current);

    const save = runSerializedEditorMutation(async (expectedRevision) => {
      const response = await fetch(`/api/resume/${resumeId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ type: "summary", content: trimmed, expectedRevision }),
      });
      const body = await response.json().catch(() => ({})) as EditorMutationResponse;
      if (!response.ok) throw new Error(body.error ?? "Your summary could not be saved.");
      return body;
    }).then((body) => {
      if (body.teachingExampleRevoked) setTeachingApproved(false);
    });

    return trackEditorSave(save).then(() => undefined);
  }, [data?.summaryText, resumeId, runSerializedEditorMutation, trackEditorSave]);

  useEffect(() => {
    if (!editor) return;
    const handleSummaryBlur = () => {
      void persistSummaryEdit(editor.getText());
    };
    editor.on("blur", handleSummaryBlur);
    return () => {
      editor.off("blur", handleSummaryBlur);
    };
  }, [editor, persistSummaryEdit]);

  const commitBulletEdit = useCallback((bulletId: string, newText: string): Promise<string> => {
    const trimmed = newText.replace(/\s+/g, " ").trim();
    const existing = data?.workHistory
      .flatMap((work) => work.bullets)
      .find((bullet) => bullet.bulletId === bulletId);
    if (!trimmed || !existing || existing.content === trimmed) {
      return Promise.resolve(existing?.bulletId ?? bulletId);
    }

    const historyEntry = bulletHistoryRef.current.record({
      bulletId,
      before: existing.content,
      after: trimmed,
    });
    setBulletHistoryRevision((revision) => revision + 1);

    return persistBulletEdit(bulletId, trimmed)
      .then((savedBulletId) => {
        historyEntry.bulletId = savedBulletId;
        return savedBulletId;
      })
      .catch((error) => {
        bulletHistoryRef.current.discard(historyEntry);
        setBulletHistoryRevision((revision) => revision + 1);
        throw error;
      });
  }, [data, persistBulletEdit]);

  const handleBulletEdit = useCallback((bulletId: string, newText: string) => {
    void commitBulletEdit(bulletId, newText).catch(() => undefined);
  }, [commitBulletEdit]);

  const handleAcceptRewrite = useCallback(async (_originalText: string, newText: string) => {
    if (!selectedBulletId) throw new Error("Select a resume bullet before accepting a rewrite.");
    await commitBulletEdit(selectedBulletId, newText);
  }, [commitBulletEdit, selectedBulletId]);

  const handleUndo = useCallback(async () => {
    const historyEntry = bulletHistoryRef.current.takeUndo();
    if (!historyEntry) {
      editor?.chain().focus().undo().run();
      return;
    }

    setBulletHistoryRevision((revision) => revision + 1);
    try {
      await editorSaveQueueRef.current.flush();
      historyEntry.bulletId = await persistBulletEdit(
        historyEntry.bulletId,
        historyEntry.before,
        { force: true }
      );
    } catch {
      bulletHistoryRef.current.rollbackUndo(historyEntry);
      setBulletHistoryRevision((revision) => revision + 1);
    }
  }, [editor, persistBulletEdit]);

  const handleRedo = useCallback(async () => {
    const historyEntry = bulletHistoryRef.current.takeRedo();
    if (!historyEntry) {
      editor?.chain().focus().redo().run();
      return;
    }

    setBulletHistoryRevision((revision) => revision + 1);
    try {
      await editorSaveQueueRef.current.flush();
      historyEntry.bulletId = await persistBulletEdit(
        historyEntry.bulletId,
        historyEntry.after,
        { force: true }
      );
    } catch {
      bulletHistoryRef.current.rollbackRedo(historyEntry);
      setBulletHistoryRevision((revision) => revision + 1);
    }
  }, [editor, persistBulletEdit]);

  const handleEditorNavigation = useCallback(async (
    event: MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    event.preventDefault();
    setNavigatingTo(href);
    try {
      await editorSaveQueueRef.current.flush();
      window.location.assign(href);
    } catch (error) {
      setNavigatingTo(null);
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Save the current edit before leaving.");
    }
  }, []);

  const handlePdfDownload = useCallback(async () => {
    if (!data || pdfBusy || phase !== "ready") return;

    setPdfBusy(true);
    setPdfMessage(null);
    setSaveError(null);
    try {
      await editorSaveQueueRef.current.flush();
      await documentSaveChainRef.current;
      await renderAndDownloadPdf({
        resumeId,
        filename: `${data.candidateName ?? "Resume"} ${data.targetRole} Resume`,
      });
      setPdfMessage("Your saved PDF download has started.");
    } catch (downloadError) {
      setSaveState("error");
      setSaveError(
        downloadError instanceof Error
          ? downloadError.message
          : "The PDF could not be prepared. Please try again."
      );
    } finally {
      setPdfBusy(false);
    }
  }, [data, pdfBusy, phase, resumeId]);

  const persistPresentation = useCallback((presentation: ResumePresentation) => {
    const revision = presentationRevisionRef.current + 1;
    presentationRevisionRef.current = revision;
    setSaveState("saving");
    setSaveError(null);

    const save = runSerializedEditorMutation(async (expectedRevision) => {
      const response = await fetch(`/api/resume/${resumeId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "presentation", presentation, expectedRevision }),
      });
      const body = await response.json().catch(() => ({})) as EditorMutationResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "Document style could not be saved.");
      }
      return body;
    }).then((body) => {
      setData((current) => current
        ? { ...current, presentation: body.presentation ?? presentation }
        : current
      );
    });

    void editorSaveQueueRef.current.track(save)
      .then(() => {
        if (presentationRevisionRef.current === revision) setSaveState("saved");
      })
      .catch((error) => {
        if (presentationRevisionRef.current !== revision) return;
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Document style could not be saved.");
      });
  }, [resumeId, runSerializedEditorMutation]);

  const handlePresentationChange = useCallback((presentation: ResumePresentation) => {
    setResumeFont(presentation.font);
    setResumeScale(presentation.scale);
    setResumeDensity(presentation.density);
    persistPresentation(presentation);
  }, [persistPresentation]);

  const handleTeachingToggle = useCallback(async () => {
    const confirmation = getTeachingConfirmation(teachingApproved);
    setTeachingBusy(true);
    setTeachingMessage(null);
    try {
      await editorSaveQueueRef.current.flush();
      const response = await fetch(`/api/resume/${resumeId}/teaching-example`, {
        method: confirmation.method,
      });
      const body = await response.json().catch(() => ({})) as { error?: string; approved?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Teaching preference could not be saved.");
      const approved = body.approved === true;
      setTeachingApproved(approved);
      setTeachingMessage(
        approved
          ? "Private teaching example saved. Similar future drafts can use its style."
          : "Teaching example removed. It will not influence future drafts."
      );
      setTeachingConfirmationOpen(false);
    } catch (error) {
      setTeachingMessage(error instanceof Error ? error.message : "Teaching preference could not be saved.");
      setTeachingConfirmationOpen(false);
    } finally {
      setTeachingBusy(false);
    }
  }, [resumeId, teachingApproved]);

  // ── Scores ─────────────────────────────────────────────────────────────────

  const keywordScore = data?.keywordScore ?? null;
  const atsScore = data?.atsScore ?? null;
  const teachingConfirmation = getTeachingConfirmation(teachingApproved);
  const resumeDocumentStyle: CSSProperties & Record<"--resume-body-size" | "--resume-line-height", string> = {
    fontFamily: resumeFontFamily(resumeFont),
    "--resume-body-size":
      resumeScale === "compact" ? "11.25px" : resumeScale === "large" ? "13px" : "12px",
    "--resume-line-height":
      resumeDensity === "tight" ? "1.28" : resumeDensity === "open" ? "1.58" : "1.42",
  };
  const contactItems = data
    ? [
        data.candidateEmail,
        data.candidatePhone,
        data.candidateLinkedin,
        data.candidateWebsite,
        data.candidateLocation,
      ].filter((item): item is string => Boolean(item?.trim()))
    : [];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={clsx(
        "flex h-[calc(100dvh-3.5rem)] md:h-screen overflow-hidden bg-surface transition-[padding] duration-300",
        panelOpen && phase === "ready" && "xl:pr-[360px]"
      )}
    >
      {/* ─── Top nav ─── */}
      <header className="fixed left-0 right-0 top-14 z-30 flex h-14 items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-3 backdrop-blur-md md:left-56 md:top-0 md:px-6">
        <div className="hidden min-w-0 items-center gap-3 sm:flex">
          {phase === "ready" && data && (
            <span className="text-sm text-on-surface-variant">
              {role || data.targetRole}
              {(company || data.targetCompany) ? <span className="text-on-surface-variant/60"> at {company || data.targetCompany}</span> : ""}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {phase === "ready" && (
            <>
              <button
                type="button"
                onClick={() => setTeachingConfirmationOpen(true)}
                disabled={teachingBusy}
                title={teachingApproved ? "Stop using this resume as a private teaching example" : "Use this approved resume to personalize future drafts"}
                className={clsx(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60",
                  teachingApproved
                    ? "border-secondary/40 bg-secondary/10 text-secondary"
                    : "border-outline-variant bg-surface-lowest text-on-surface hover:bg-surface-container-low"
                )}
              >
                {teachingBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span className="hidden lg:inline">{teachingApproved ? "Teaching 3C" : "Teach 3C"}</span>
              </button>
              <Link
                href={`/upload?resumeId=${resumeId}`}
                onClick={(event) => handleEditorNavigation(event, `/upload?resumeId=${resumeId}`)}
                className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-lowest px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
              >
                {navigatingTo === `/upload?resumeId=${resumeId}` ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeft size={14} />}
                {navigatingTo === `/upload?resumeId=${resumeId}` ? "Saving..." : "Preview"}
              </Link>
              <button
                type="button"
                onClick={() => void handlePdfDownload()}
                disabled={pdfBusy}
                className="flex items-center gap-2 bg-on-surface text-white px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {pdfBusy ? "Preparing..." : "Download PDF"}
              </button>
            </>
          )}
        </div>
      </header>

      {teachingMessage && phase === "ready" && (
        <div className="fixed right-4 top-16 z-40 max-w-sm rounded-lg border border-outline-variant bg-surface-lowest px-4 py-3 text-xs text-on-surface shadow-lg">
          <div className="flex items-start gap-3">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-secondary" />
            <span className="leading-relaxed">{teachingMessage}</span>
            <button type="button" onClick={() => setTeachingMessage(null)} title="Dismiss" className="shrink-0 text-on-surface-variant hover:text-on-surface">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {pdfMessage && phase === "ready" && (
        <div className="fixed right-4 top-28 z-40 max-w-sm rounded-lg border border-secondary/30 bg-surface-lowest px-4 py-3 text-xs text-on-surface shadow-lg">
          <div className="flex items-start gap-3">
            <Download size={15} className="mt-0.5 shrink-0 text-secondary" />
            <span className="leading-relaxed">{pdfMessage}</span>
            <button type="button" onClick={() => setPdfMessage(null)} title="Dismiss" className="shrink-0 text-on-surface-variant hover:text-on-surface">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {teachingConfirmationOpen && phase === "ready" && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="teaching-confirmation-title"
        >
          <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-lowest shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant/35 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary/10 text-secondary">
                  <Sparkles size={18} />
                </span>
                <div>
                  <h2 id="teaching-confirmation-title" className="text-base font-semibold text-on-surface">
                    {teachingConfirmation.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                    {teachingConfirmation.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close teaching confirmation"
                onClick={() => setTeachingConfirmationOpen(false)}
                disabled={teachingBusy}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs leading-relaxed text-on-surface-variant">
                This is optional and private to your account. You can remove the example later from this resume.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-outline-variant/35 px-5 py-4">
              <button
                type="button"
                onClick={() => setTeachingConfirmationOpen(false)}
                disabled={teachingBusy}
                className="h-10 rounded-lg border border-outline-variant px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleTeachingToggle()}
                disabled={teachingBusy}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-on-surface px-4 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {teachingBusy && <Loader2 size={15} className="animate-spin" />}
                {teachingConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Workspace row ─── */}
      <div className="flex flex-1 pt-14 overflow-hidden">

        {/* ─── LEFT PANEL: JD Context ─── */}
        {phase === "needs-target" && (
          <section className="hidden md:flex w-[340px] bg-surface-lowest border-r border-outline-variant/50 flex-col shrink-0 overflow-y-auto">
            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-on-surface mb-1">
                  Target Your Role
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Tell us where you&apos;re applying and we&apos;ll tailor your resume to fit.
                </p>
              </div>

              {/* Company + Role */}
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Company
                  </label>
                  <div className="relative">
                    <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="e.g. Goldman Sachs"
                      disabled={submitting}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-outline-variant rounded-lg text-sm focus:outline-none focus:border-secondary transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Role
                  </label>
                  <div className="relative">
                    <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. VP of Product"
                      disabled={submitting}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-outline-variant rounded-lg text-sm focus:outline-none focus:border-secondary transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* JD */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                  <FileText size={11} />
                  Job Description
                </label>
                <textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  disabled={submitting}
                  placeholder="Paste the full job description..."
                  rows={8}
                  className="w-full px-3 py-2.5 bg-white border border-outline-variant rounded-lg text-sm focus:outline-none focus:border-secondary transition-colors resize-none leading-relaxed disabled:opacity-50"
                />
                <p className="text-[11px] text-on-surface-variant">
                  {jd.length} chars
                  {jd.trim().length > 0 && jd.trim().length <= 20
                    ? " · Need more text for effective tailoring"
                    : ""}
                </p>
              </div>

              {/* Tone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                  <Sliders size={11} />
                  Tone
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {toneOptions.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      disabled={submitting}
                      className={clsx(
                        "py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all",
                        tone === t
                          ? "border-on-surface bg-on-surface text-white"
                          : "border-outline-variant text-on-surface-variant hover:border-secondary"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Structure */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Structure
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {structureOptions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStructure(s)}
                      disabled={submitting}
                      className={clsx(
                        "py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-left",
                        structure === s
                          ? "border-secondary bg-secondary/5 text-secondary"
                          : "border-outline-variant text-on-surface-variant hover:border-secondary"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {targetError && (
                <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                  <X size={14} className="shrink-0 mt-0.5" />
                  <span className="text-xs">{targetError}</span>
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleTargetSubmit}
                disabled={!canSubmitTarget}
                className={clsx(
                  "w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all",
                  canSubmitTarget
                    ? "bg-on-surface text-white hover:opacity-90"
                    : "bg-surface-container text-on-surface-variant cursor-not-allowed"
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Target size={14} />
                    Generate Tailored Resume
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        {/* LEFT PANEL: JD Context */}
        {showReadyContextPanel && phase === "ready" && data && !leftCollapsed && (
          <section className="hidden md:flex w-[300px] bg-surface-lowest border-r border-outline-variant/30 flex-col shrink-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Job Context
                </h3>
                <button
                  onClick={() => setLeftCollapsed(true)}
                  className="p-1 hover:bg-surface-container rounded transition-colors"
                  title="Collapse panel"
                >
                  <ChevronDown size={14} className="text-on-surface-variant rotate-90" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                    Company
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Company name"
                    className="mt-1 w-full px-3 py-2 bg-white border border-outline-variant rounded-lg text-sm font-semibold text-on-surface focus:outline-none focus:border-secondary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                    Role
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Target role"
                    className="mt-1 w-full px-3 py-2 bg-white border border-outline-variant rounded-lg text-sm font-semibold text-on-surface focus:outline-none focus:border-secondary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 flex items-center gap-1.5">
                    <FileText size={11} />
                    Job Description
                  </label>
                  <textarea
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    placeholder="Keep the job description beside the resume while you edit."
                    rows={10}
                    className="mt-1 w-full px-3 py-2.5 bg-white border border-outline-variant rounded-lg text-xs text-on-surface focus:outline-none focus:border-secondary transition-colors resize-none leading-relaxed"
                  />
                  <p className="mt-1 text-[11px] text-on-surface-variant">
                    {jd.length > 0 ? `${jd.length} characters in context` : "Paste or adjust the JD here."}
                  </p>
                </div>
              </div>

              {/* Target info */}
              <div className="hidden">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                    Company
                  </span>
                  <p className="text-sm font-semibold text-on-surface">{data.targetCompany ?? "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                    Role
                  </span>
                  <p className="text-sm font-semibold text-on-surface">{data.targetRole}</p>
                </div>
              </div>

              {/* Scores */}
              {keywordScore !== null && (
                <div className="bg-surface-container-low rounded-lg p-3 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                    Match Score
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold text-secondary">{keywordScore}</span>
                    <span className="text-xs text-on-surface-variant">%</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary rounded-full transition-all duration-500"
                      style={{ width: `${keywordScore}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Section nav */}
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/30">
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                  Sections
                </span>
                {data.sections.filter((s) => s.visible).map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-1.5 px-2 rounded text-xs text-on-surface hover:bg-surface-container-low transition-colors cursor-default"
                  >
                    <CheckCircle2 size={12} className="text-secondary shrink-0" />
                    <span>{s.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                  </div>
                ))}
              </div>

              {/* Tip */}
              <div className="bg-surface-container/40 rounded-lg p-3 mt-auto">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles size={12} className="text-secondary" />
                  <span className="text-[10px] font-bold text-on-surface">Tip</span>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Click any bullet to get AI rewrite suggestions tailored to this role.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Collapsed left panel toggle */}
        {showReadyContextPanel && phase === "ready" && leftCollapsed && (
          <button
            onClick={() => setLeftCollapsed(false)}
            className="hidden md:flex w-8 bg-surface-lowest border-r border-outline-variant/30 items-center justify-center hover:bg-surface-container-low transition-colors shrink-0"
            title="Show job context"
          >
            <ChevronUp size={14} className="text-on-surface-variant rotate-90" />
          </button>
        )}

        {/* LEFT PANEL: Generating progress */}
        {phase === "generating" && (
          <section className="hidden md:flex w-[280px] bg-surface-lowest border-r border-outline-variant/30 flex-col shrink-0">
            <div className="p-5 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-on-surface mb-1">
                  Crafting Your Resume
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Building a tailored resume for your target role.
                </p>
              </div>

              {/* Progress */}
              <div className="space-y-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-secondary">{progress}</span>
                  <span className="text-sm text-on-surface-variant">%</span>
                </div>
                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full bg-secondary rounded-full transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-on-surface-variant">{statusLabel}</p>
              </div>

              {/* Elapsed */}
              <div className="bg-surface-container-low rounded-lg p-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 block mb-1">
                  Elapsed
                </span>
                <span className="text-lg font-semibold text-on-surface">
                  {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
                </span>
                {elapsedSec > 120 && progress < 95 && (
                  <p className="text-[11px] text-on-surface-variant/70 mt-1">
                    Complex resumes take a bit longer
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ─── CENTER: Resume Document ─── */}
        <section className={clsx(
          "flex-1 bg-surface-container-lowest overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-outline-variant [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent px-4 py-8 md:py-10 flex flex-col items-center",
          phase === "ready" ? "md:px-8 xl:px-14" : "md:px-8"
        )}>

          {/* Loading state */}
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface-variant">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Loading your workspace...</p>
            </div>
          )}

          {/* Error state */}
          {phase === "error" && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <AlertCircle size={32} className="text-error" />
              <p className="text-sm text-on-surface-variant text-center max-w-xs">{errorMsg}</p>
              <Link
                href="/upload"
                className="px-4 py-2 bg-on-surface text-white rounded-lg text-xs font-semibold hover:opacity-90"
              >
                Start Over
              </Link>
            </div>
          )}

          {/* Failed state */}
          {phase === "failed" && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <AlertCircle size={32} className="text-error" />
              <p className="text-base font-semibold text-on-surface">Generation Failed</p>
              <p className="text-sm text-on-surface-variant text-center max-w-xs">
                Something went wrong. Your data is safe — you can try again.
              </p>
              <button
                onClick={() => {
                  setPhase("needs-target");
                  setProgress(5);
                  setElapsedSec(0);
                }}
                className="px-5 py-2 bg-on-surface text-white rounded-lg text-sm font-semibold hover:opacity-90"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Needs-target: show placeholder resume */}
          {phase === "needs-target" && (
            <div className="w-full max-w-[760px] relative">
              {/* Blurred placeholder */}
              <div className="bg-white px-14 py-12 shadow-sm border border-outline-variant/20 blur-[2px] opacity-40 pointer-events-none select-none" style={{ minHeight: "900px" }}>
                <div className="text-center mb-8 pb-6 border-b border-outline-variant">
                  <div className="h-8 bg-surface-container w-2/5 rounded mx-auto mb-2" />
                  <div className="h-3 bg-surface-container-low w-1/3 rounded mx-auto" />
                </div>
                <div className="space-y-3">
                  <div className="h-4 bg-surface-container w-1/4 rounded" />
                  <div className="h-2 bg-surface-container-low w-full rounded" />
                  <div className="h-2 bg-surface-container-low w-5/6 rounded" />
                  <div className="h-2 bg-surface-container-low w-4/5 rounded" />
                </div>
                <div className="space-y-3 mt-8">
                  <div className="h-4 bg-surface-container w-1/4 rounded" />
                  {[100, 85, 92, 78].map((w, i) => (
                    <div key={i} className="h-2 bg-surface-container-low rounded" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>

              {/* Overlay message */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/95 backdrop-blur-sm rounded-xl px-8 py-6 text-center shadow-lg border border-outline-variant/30 max-w-sm">
                  <Target size={28} className="text-on-surface-variant mx-auto mb-3" />
                  <p className="text-base font-semibold text-on-surface mb-1">
                    Set your target role
                  </p>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Fill in the job details on the left to generate your tailored resume.
                  </p>
                  <div className="md:hidden mt-5 space-y-3 text-left">
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Company"
                      disabled={submitting}
                      className="w-full px-3 py-2.5 bg-white border border-outline-variant rounded-lg text-sm focus:outline-none focus:border-secondary disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="Role"
                      disabled={submitting}
                      className="w-full px-3 py-2.5 bg-white border border-outline-variant rounded-lg text-sm focus:outline-none focus:border-secondary disabled:opacity-50"
                    />
                    <textarea
                      value={jd}
                      onChange={(e) => setJd(e.target.value)}
                      disabled={submitting}
                      placeholder="Paste the job description"
                      rows={5}
                      className="w-full px-3 py-2.5 bg-white border border-outline-variant rounded-lg text-sm focus:outline-none focus:border-secondary resize-none disabled:opacity-50"
                    />
                    <button
                      onClick={handleTargetSubmit}
                      disabled={!canSubmitTarget}
                      className={clsx(
                        "w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all",
                        canSubmitTarget
                          ? "bg-on-surface text-white hover:opacity-90"
                          : "bg-surface-container text-on-surface-variant cursor-not-allowed"
                      )}
                    >
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
                      Generate Tailored Resume
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Generating: show progress on blurred doc */}
          {phase === "generating" && (
            <div className="w-full max-w-[760px] relative">
              <div className="bg-white px-14 py-12 shadow-sm border border-outline-variant/20 blur-[2px] opacity-30 pointer-events-none select-none" style={{ minHeight: "900px" }}>
                <div className="text-center mb-8 pb-6 border-b border-outline-variant">
                  <div className="h-8 bg-surface-container w-2/5 rounded mx-auto mb-2" />
                  <div className="h-3 bg-surface-container-low w-1/3 rounded mx-auto" />
                </div>
                <div className="space-y-3">
                  <div className="h-4 bg-surface-container w-1/4 rounded" />
                  <div className="h-2 bg-surface-container-low w-full rounded" />
                  <div className="h-2 bg-surface-container-low w-5/6 rounded" />
                </div>
                <div className="space-y-3 mt-8">
                  <div className="h-4 bg-surface-container w-1/4 rounded" />
                  {[100, 85, 92, 78, 88].map((w, i) => (
                    <div key={i} className="h-2 bg-surface-container-low rounded" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/95 backdrop-blur-sm rounded-xl px-8 py-6 text-center shadow-lg border border-outline-variant/30">
                  <Loader2 size={32} className="animate-spin text-secondary mx-auto mb-3" />
                  <p className="text-base font-semibold text-on-surface mb-1">
                    Building your resume
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    {statusLabel}
                  </p>
                  {/* Mobile progress bar */}
                  <div className="mt-4 w-48 mx-auto">
                    <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full bg-secondary rounded-full transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">{progress}% complete</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ready: Full resume document */}
          {phase === "ready" && data && (
            <>
              <div className="sticky top-0 z-20 w-full border-b border-outline-variant/35 bg-surface/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto flex w-full max-w-[980px] flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/50 bg-surface-lowest p-2 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/50 bg-white px-2 py-1">
                    <Type size={15} className="text-on-surface-variant" />
                    <select
                      value={resumeFont}
                      onChange={(event) => handlePresentationChange({
                        font: event.target.value as ResumeFont,
                        scale: resumeScale,
                        density: resumeDensity,
                      })}
                      className="bg-transparent text-xs font-semibold text-on-surface outline-none"
                      aria-label="Resume font"
                    >
                      <option value="sans">Modern</option>
                      <option value="serif">Classic</option>
                      <option value="system">ATS</option>
                    </select>
                  </div>

                  <div className="inline-flex rounded-lg border border-outline-variant/50 bg-white p-1">
                    {(["compact", "normal", "large"] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => handlePresentationChange({
                          font: resumeFont,
                          scale: size,
                          density: resumeDensity,
                        })}
                        className={clsx(
                          "rounded-md px-2 py-1 text-xs font-semibold capitalize transition-colors",
                          resumeScale === size
                            ? "bg-on-surface text-white"
                            : "text-on-surface-variant hover:bg-surface-container"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>

                  <div className="inline-flex rounded-lg border border-outline-variant/50 bg-white p-1">
                    {(["tight", "balanced", "open"] as const).map((density) => (
                      <button
                        key={density}
                        type="button"
                        onClick={() => handlePresentationChange({
                          font: resumeFont,
                          scale: resumeScale,
                          density,
                        })}
                        className={clsx(
                          "rounded-md px-2 py-1 text-xs font-semibold capitalize transition-colors",
                          resumeDensity === density
                            ? "bg-on-surface text-white"
                            : "text-on-surface-variant hover:bg-surface-container"
                        )}
                      >
                        {density}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {saveState !== "idle" && (
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 px-2 text-xs font-medium",
                        saveState === "error" ? "text-red-700" : "text-on-surface-variant"
                      )}
                      role={saveState === "error" ? "alert" : "status"}
                    >
                      {saveState === "saving" && <Loader2 size={13} className="animate-spin" />}
                      {saveState === "saved" && <CheckCircle2 size={13} className="text-secondary" />}
                      {saveState === "error" && <AlertCircle size={13} />}
                      {saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveError ?? "Save failed"}
                    </span>
                  )}
                  <div className="inline-flex rounded-lg border border-outline-variant/50 bg-white p-1">
                    <button
                    type="button"
                    onClick={() => void handleUndo()}
                    disabled={!bulletHistoryRef.current.canUndo && !editor?.can().undo()}
                    className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
                    aria-label="Undo"
                  >
                    <Undo2 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRedo()}
                    disabled={!bulletHistoryRef.current.canRedo && !editor?.can().redo()}
                    className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
                    aria-label="Redo"
                  >
                    <Redo2 size={15} />
                  </button>
                  </div>
                </div>
              </div>
              </div>

              <div className="w-full overflow-x-auto px-4 py-8">
                <div
                  data-testid="resume-editor-document"
                  className="mx-auto flex min-h-0 w-full max-w-full flex-col overflow-visible bg-white px-5 py-7 text-on-surface shadow-sm ring-1 ring-outline-variant/25 sm:min-h-[1056px] sm:w-[816px] sm:px-14 md:max-h-[calc(100vh-11rem)] md:overflow-y-auto md:overflow-x-hidden lg:px-16 [&_*]:max-w-full [&_li]:break-words [&_li]:text-[length:var(--resume-body-size)] [&_li]:leading-[var(--resume-line-height)] [&_p]:break-words [&_p]:text-[length:var(--resume-body-size)] [&_p]:leading-[var(--resume-line-height)]"
                  style={resumeDocumentStyle}
                >
              {/* Resume header */}
              <header className="order-0 mb-5 border-b border-outline-variant/70 pb-4 text-center">
                <h2 className="mb-2 text-[30px] font-bold uppercase leading-none tracking-normal text-on-surface">
                  {data.candidateName ?? "Your Name"}
                </h2>
                {data.candidateHeadline && (
                  <p className="mb-1 text-[12px] font-semibold text-on-surface">
                    {data.candidateHeadline}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] leading-tight text-on-surface-variant">
                  {contactItems.length > 0 ? (
                    contactItems.map((item, index) => (
                      <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
                        {index > 0 && <span className="text-on-surface-variant/50">•</span>}
                        <span>{item}</span>
                      </span>
                    ))
                  ) : (
                    <Link
                      href={withReturnTo("/memory", `/workspace/${resumeId}`)}
                      className="font-semibold text-secondary underline-offset-4 hover:underline"
                    >
                      Add phone, LinkedIn, and location in Career Profile.
                    </Link>
                  )}
                </div>
                <div className="hidden">
                  {data.candidateEmail && <span>{data.candidateEmail}</span>}
                  {data.candidateEmail && <span>•</span>}
                  <span>{role || data.targetRole}</span>
                  {(company || data.targetCompany) && <><span>•</span><span>{company || data.targetCompany}</span></>}
                </div>
              </header>

              {/* Summary */}
              {data.summaryText && (
                <section className="group relative order-1 mb-5">
                  <h3 className="mb-2 inline-block border-b-2 border-surface-container pb-1 text-[14px] font-bold text-on-surface">
                    Professional Summary
                  </h3>
                  <EditorContent editor={editor} />
                </section>
              )}

              {/* Experience */}
              {data.workHistory.length > 0 && (
                <section className="order-3 mb-5">
                  <h3 className="mb-3 inline-block border-b-2 border-surface-container pb-1 text-[14px] font-bold text-on-surface">
                    Experience
                  </h3>
                  {data.workHistory.map((wh) => (
                    <div key={wh.workHistoryId} className="group relative mb-3.5">
                      <div className="mb-0.5 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                        <h4 className="min-w-0 break-words text-[13px] font-bold text-on-surface">{wh.title}</h4>
                        <span className="shrink-0 whitespace-nowrap text-xs italic text-on-surface-variant">
                          {formatPeriod(wh.startDate, wh.endDate, wh.current, wh.dateLabel)}
                        </span>
                      </div>
                      <p className="mb-1.5 text-[12px] font-semibold text-secondary">
                        {wh.company}{wh.location ? ` • ${wh.location}` : ""}
                      </p>
                      {wh.bullets.length > 0 ? (
                        <ul className="list-disc space-y-0.5 pl-5">
                          {wh.bullets.map((bullet) => (
                            <li
                              key={bullet.bulletId}
                              className="group/bullet relative rounded-sm px-1 py-0.5 text-[12px] leading-[1.38] text-on-surface transition-colors hover:bg-secondary/5"
                            >
                              <span
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => handleBulletEdit(bullet.bulletId, e.currentTarget.textContent ?? "")}
                                className="block rounded-sm focus:bg-surface-container-low focus:outline-none focus:ring-1 focus:ring-secondary/25"
                              >
                                {bullet.content}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleBulletClick(bullet.content, bullet.bulletId)}
                                className="absolute -left-6 top-1 opacity-0 transition-opacity group-hover/bullet:opacity-100"
                                aria-label="Open AI rewrite suggestions"
                              >
                                <Sparkles size={14} className="text-secondary" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-on-surface-variant italic">No bullets generated</p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Projects are intentionally role-aware in the content API. */}
              {data.projects.length > 0 && (
                <section className="order-4 mb-5">
                  <h3 className="mb-3 inline-block border-b-2 border-surface-container pb-1 text-[14px] font-bold text-on-surface">
                    Projects
                  </h3>
                  <div className="space-y-3">
                    {data.projects.map((project) => (
                      <article key={project.id}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <h4 className="text-[12.5px] font-bold text-on-surface">{project.name}</h4>
                          {(project.startDate || project.endDate) && (
                            <span className="text-xs italic text-on-surface-variant">
                              {[formatYear(project.startDate), formatYear(project.endDate)]
                                .filter(Boolean)
                                .join(" - ")}
                            </span>
                          )}
                        </div>
                        {project.technologies.length > 0 && (
                          <p className="mt-0.5 text-[11.5px] font-semibold text-secondary">
                            {project.technologies.join(" | ")}
                          </p>
                        )}
                        {project.description && (
                          <p className="mt-1 text-[12px] leading-[1.38] text-on-surface">
                            {project.description}
                          </p>
                        )}
                        {project.url && (
                          <p className="mt-1 break-all text-[11px] text-on-surface-variant">
                            {project.url}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {/* Empty resume sections are omitted from the document. */}
              {data.education.length > 0 && (
                <section className="order-5 mb-5">
                  <h3 className="mb-3 inline-block border-b-2 border-surface-container pb-1 text-[14px] font-bold text-on-surface">
                    Education
                  </h3>
                  {
                  data.education.map((edu, i) => (
                    <div key={i} className="mt-1.5">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
                        <p className="min-w-0 break-words text-[12.5px] font-bold text-on-surface">
                          {edu.degree} — {edu.institution}
                        </p>
                        <p className="shrink-0 whitespace-nowrap text-xs text-on-surface-variant">
                          {edu.dateLabel?.trim() || formatEducationDateUtc(edu.graduationDate, edu.inProgress)}
                        </p>
                      </div>
                      {edu.details && (
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-on-surface-variant">
                          {edu.details}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Certifications */}
              {data.certifications.length > 0 && (
                <section className="order-6 mb-5">
                  <h3 className="mb-3 inline-block border-b-2 border-surface-container pb-1 text-[14px] font-bold text-on-surface">
                    Certifications
                  </h3>
                  <p className="text-[12px] leading-relaxed text-on-surface">
                    {data.certifications
                      .map(formatCertificationLabel)
                      .join(" | ")}
                  </p>
                </section>
              )}

              {/* Skills */}
              <section className="order-2 mb-5">
                <h3 className="mb-3 inline-block border-b-2 border-surface-container pb-1 text-[14px] font-bold text-on-surface">
                  Core Skills
                </h3>
                {data.skills.length > 0 ? (
                  <div className="space-y-1.5 text-[12px] leading-relaxed text-on-surface">
                    {groupSkillsByCategory(data.skills).map(([category, skills]) => (
                      <p key={category}>
                        <span className="font-bold">{category}:</span>{" "}
                        {skills.join(" | ")}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant italic">No skills found</p>
                )}
              </section>
                </div>
            </div>
            </>
          )}

        </section>

        {/* ─── RIGHT PANEL: AI Assistant (only in ready state, when no bullet selected) ─── */}
        {phase === "ready" && data && !panelOpen && false && (
          <section className="hidden xl:flex w-[240px] bg-surface-lowest border-l border-outline-variant/30 flex-col shrink-0">
            <div className="p-4 border-b border-outline-variant/20">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-secondary" />
                <h3 className="text-xs font-bold text-on-surface">AI Assistant</h3>
              </div>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Select a bullet to review alternate phrasing without changing the rest of the resume.
              </p>
            </div>
            <div className="p-4 space-y-3">
              {(keywordScore !== null || atsScore !== null) && (
                <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Available Scores
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {keywordScore !== null && (
                      <div>
                        <p className="text-on-surface-variant">Keyword</p>
                        <p className="text-lg font-semibold text-on-surface">{keywordScore}%</p>
                      </div>
                    )}
                    {atsScore !== null && (
                      <div>
                        <p className="text-on-surface-variant">ATS</p>
                        <p className="text-lg font-semibold text-on-surface">{atsScore}%</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Job Target
                </p>
                <p className="mt-2 text-xs font-semibold text-on-surface">{role || data?.targetRole}</p>
                {(company || data?.targetCompany) && (
                  <p className="text-[11px] text-on-surface-variant">{company || data?.targetCompany}</p>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Scores only appear here when the backend returns real values. The resume page stays clean for editing and export review.
              </p>
            </div>
          </section>
        )}
      </div>

      {/* AI Rewrite panel (slides in from right) */}
      <AIRewritePanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        resumeId={resumeId}
        selectedText={selectedBullet || undefined}
        bulletId={selectedBulletId || undefined}
        onAccept={handleAcceptRewrite}
      />
    </div>
  );
}
