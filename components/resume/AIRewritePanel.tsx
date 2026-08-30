"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  Sparkles,
  X,
  Minimize2,
  Zap,
  Target,
  Terminal,
  Crown,
  Minus,
  Loader2,
  AlertCircle,
  RotateCcw,
  Send,
} from "lucide-react";

// ── Refinement option definitions ───────────────────────────────────────────

interface RewriteOption {
  icon: typeof Sparkles;
  label: string;
  instruction: string;
}

const rewriteOptions: RewriteOption[] = [
  {
    icon: Minimize2,
    label: "Make more concise",
    instruction: "Make this bullet more concise — cut filler words and tighten the sentence while preserving all facts and metrics.",
  },
  {
    icon: Zap,
    label: "Add more impact",
    instruction: "Rewrite this bullet to emphasize impact and results. Use stronger action verbs and quantify outcomes where the data supports it.",
  },
  {
    icon: Target,
    label: "Improve ATS fit",
    instruction: "Rewrite this bullet to better match ATS keyword scanning. Weave in relevant JD keywords naturally without stuffing.",
  },
  {
    icon: Terminal,
    label: "More technical tone",
    instruction: "Rewrite this bullet with a more technical tone — use precise technical terminology and emphasize systems, tools, and engineering practices.",
  },
  {
    icon: Crown,
    label: "Add leadership angle",
    instruction: "Rewrite this bullet to highlight leadership — emphasize team guidance, stakeholder management, strategic decision-making, and cross-functional influence.",
  },
  {
    icon: Minus,
    label: "Reduce to one line",
    instruction: "Compress this bullet into a single line (under 100 characters) while preserving the core achievement and any metrics.",
  },
];

// ── API response type ───────────────────────────────────────────────────────

interface RewriteResponse {
  original: string;
  rewritten: string;
  explanation: string;
  instruction: string;
  bulletId: string | null;
}

// ── Component props ─────────────────────────────────────────────────────────

interface AIRewritePanelProps {
  isOpen: boolean;
  onClose: () => void;
  resumeId: string;
  selectedText?: string;
  bulletId?: string;
  onAccept?: (originalText: string, newText: string) => void | Promise<void>;
}

export default function AIRewritePanel({
  isOpen,
  onClose,
  resumeId,
  selectedText,
  bulletId,
  onAccept,
}: AIRewritePanelProps) {
  const [activeOption, setActiveOption] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RewriteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState("");

  // Reset state when selectedText changes (new bullet selected)
  useEffect(() => {
    setResult(null);
    setError(null);
    setActiveOption(null);
    setCustomInstruction("");
    setLoading(false);
  }, [selectedText]);

  // ── Call rewrite API ────────────────────────────────────────────────────────

  const requestRewrite = useCallback(
    async (instruction: string) => {
      if (!selectedText || loading) return;

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch(`/api/resume/${resumeId}/rewrite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bulletText: selectedText,
            instruction,
            bulletId: bulletId ?? undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? "Rewrite failed"
          );
        }

        const data = (await res.json()) as RewriteResponse;
        setResult(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Rewrite failed. Please try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedText, resumeId, bulletId, loading]
  );

  // ── Handle option click ─────────────────────────────────────────────────────

  const handleOptionClick = (option: RewriteOption) => {
    setActiveOption(option.label);
    requestRewrite(option.instruction);
  };

  const handleCustomSubmit = () => {
    const instruction = customInstruction.trim();
    if (!instruction || loading) return;
    setActiveOption("Custom instruction");
    requestRewrite(instruction);
  };

  // ── Handle accept ───────────────────────────────────────────────────────────

  const handleAccept = async () => {
    if (result && selectedText) {
      setLoading(true);
      setError(null);
      try {
        await onAccept?.(selectedText, result.rewritten);
        setResult(null);
        setActiveOption(null);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The rewrite could not be saved.");
      } finally {
        setLoading(false);
      }
    }
  };

  // ── Handle try again ────────────────────────────────────────────────────────

  const handleTryAgain = () => {
    if (activeOption) {
      const option = rewriteOptions.find((o) => o.label === activeOption);
      if (option) {
        requestRewrite(option.instruction);
      }
    }
  };

  return (
    <div
      className={clsx(
        "fixed right-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-[min(360px,calc(100vw-1rem))] flex-col border-l border-outline-variant bg-surface-lowest shadow-2xl transition-transform duration-300",
        "max-xl:top-0 max-xl:z-50 max-xl:h-screen max-xl:w-[min(360px,100vw)]",
        "xl:shadow-none",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
      aria-hidden={!isOpen}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-outline-variant/20 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-secondary" fill="currentColor" />
          <h2 className="text-lg font-semibold text-on-surface tracking-tight">
            AI Suggestions
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-surface-container rounded-full transition-colors"
        >
          <X size={18} className="text-on-surface-variant" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-outline-variant [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {/* Original text */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant block">
            Original Content
          </label>
          <div className="p-3 bg-surface-container-low border-l-4 border-outline-variant rounded-r-lg">
            <p className="text-sm text-on-surface leading-relaxed italic">
              &ldquo;{selectedText}&rdquo;
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 size={24} className="animate-spin text-secondary" />
            <p className="text-xs text-on-surface-variant">Rewriting with AI...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Rewrite result */}
        {result && !loading && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-white border border-secondary/20 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs bg-secondary/20 text-secondary font-bold px-2 py-1 rounded">
                  {activeOption ?? "Rewritten"}
                </span>
                <Sparkles size={14} className="text-secondary" />
              </div>
              <p className="text-sm text-on-surface leading-relaxed mb-3">
                {result.rewritten}
              </p>
              <div className="pt-3 border-t border-outline-variant/20">
                <p className="text-xs text-on-surface-variant italic leading-relaxed">
                  {result.explanation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Custom instruction */}
        <div className="space-y-2">
          <label
            htmlFor="customRewriteInstruction"
            className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant"
          >
            Tell AI what to do
          </label>
          <div className="rounded-xl border border-outline-variant bg-surface-lowest p-2 transition-colors focus-within:border-secondary">
            <textarea
              id="customRewriteInstruction"
              value={customInstruction}
              onChange={(event) => setCustomInstruction(event.target.value)}
              disabled={loading}
              rows={4}
              maxLength={500}
              placeholder="Example: make this stronger for senior operations leadership, but keep every metric true."
              className="min-h-[92px] w-full resize-y bg-transparent px-2 py-2 text-sm leading-relaxed text-on-surface outline-none placeholder:text-on-surface-variant disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3 border-t border-outline-variant/40 px-2 pt-2">
              <span className="text-[11px] text-on-surface-variant">
                {customInstruction.trim().length}/500
              </span>
              <button
                type="button"
                onClick={handleCustomSubmit}
                disabled={!customInstruction.trim() || loading}
                className={clsx(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors",
                  customInstruction.trim() && !loading
                    ? "bg-on-surface text-white hover:opacity-90"
                    : "cursor-not-allowed bg-surface-container text-on-surface-variant"
                )}
              >
                {loading && activeOption === "Custom instruction" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Ask AI
              </button>
            </div>
          </div>
        </div>

        {/* Refinement options */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant block">
            {result ? "Try a Different Angle" : "Choose a Refinement"}
          </label>
          <div className="flex flex-col gap-2">
            {rewriteOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.label}
                  onClick={() => handleOptionClick(option)}
                  disabled={loading}
                  className={clsx(
                    "flex items-center gap-3 w-full p-3 rounded-lg border text-left transition-all text-sm",
                    loading && "opacity-50 cursor-not-allowed",
                    activeOption === option.label
                      ? "border-secondary bg-secondary/5 shadow-sm"
                      : "border-outline-variant hover:border-secondary hover:bg-surface-container"
                  )}
                >
                  <Icon
                    size={18}
                    className={clsx(
                      "shrink-0",
                      activeOption === option.label
                        ? "text-secondary"
                        : "text-on-surface-variant"
                    )}
                  />
                  <span
                    className={clsx(
                      "font-medium",
                      activeOption === option.label
                        ? "text-on-surface font-bold"
                        : "text-on-surface"
                    )}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer — only show action buttons when we have a result */}
      <div className="p-4 border-t border-outline-variant/20 bg-surface-lowest shrink-0">
        <div className="flex flex-col gap-2">
          {result && !loading ? (
            <>
              <button
                onClick={handleAccept}
                className="w-full bg-on-surface text-white py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Accept Rewrite
              </button>
              <button
                onClick={handleTryAgain}
                className="w-full flex items-center justify-center gap-2 border border-outline text-on-surface py-3 rounded-lg text-sm font-semibold hover:bg-surface-container transition-colors"
              >
                <RotateCcw size={14} />
                Try Again
              </button>
            </>
          ) : (
            <p className="text-xs text-on-surface-variant text-center py-2">
              {loading
                ? "Generating rewrite..."
                : "Type an instruction or choose a refinement option above."}
            </p>
          )}
          <button
            onClick={onClose}
            className="w-full text-on-surface-variant py-2 rounded-lg text-xs hover:text-on-surface transition-colors text-center"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
