"use client";

import { AlertCircle, CloudOff, FileX, RefreshCw, Download } from "lucide-react";

// --- Variant 1: File Parse Failure ---
export function ParseFailureState({
  filename = "resume_final_draft_v2.pdf",
  onRetry,
}: {
  filename?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-surface-lowest rounded-xl p-6 border border-outline-variant shadow-sm flex flex-col h-full">
      <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center mb-4">
        <CloudOff size={24} className="text-error" />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-error mb-1">
        Ingestion Error
      </span>
      <h3 className="text-xl font-semibold text-on-surface mb-3">
        We could not read this file
      </h3>
      <p className="text-on-surface-variant text-sm leading-relaxed mb-4 flex-grow">
        The document format appears to be protected or corrupted. Our system
        requires a clear text layer to extract your career milestones accurately.
      </p>

      {/* File pill */}
      <div className="bg-background rounded-lg p-3 mb-5 border border-outline-variant">
        <div className="flex items-center gap-2 mb-2">
          <FileX size={16} className="text-on-surface-variant" />
          <span className="text-sm font-semibold truncate">{filename}</span>
        </div>
        <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
          <div className="bg-error w-1/3 h-full rounded-full" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={onRetry}
          className="w-full bg-on-surface text-white py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Try Another File
        </button>
        <button className="w-full text-on-surface-variant py-2 text-sm hover:text-on-surface transition-colors">
          Contact Support
        </button>
      </div>
    </div>
  );
}

// --- Variant 2: Generation Failure ---
const steps = [
  { label: "Profile Deconstruction", done: true },
  { label: "Industry Benchmarking", done: true },
  { label: "Narrative Synthesis", done: false, failed: true },
  { label: "Final Refinement", done: false, pending: true },
];

export function GenerationFailureState({ onResume }: { onResume?: () => void }) {
  return (
    <div className="bg-surface-lowest rounded-xl p-6 border border-outline-variant shadow-sm">
      <div className="w-12 h-12 rounded-lg bg-yellow-50 flex items-center justify-center mb-4">
        <AlertCircle size={24} className="text-yellow-600" />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-yellow-700 mb-1 block">
        Processing Timeout
      </span>
      <h3 className="text-xl font-semibold text-on-surface mb-3">
        Something went wrong
      </h3>
      <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
        Our analysis engine hit an unexpected roadblock while synthesizing your
        narrative. Most progress has been saved.
      </p>

      {/* Pipeline steps */}
      <div className="space-y-4 mb-6 relative">
        <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-outline-variant/40" />
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-4 relative z-10">
            <div
              className={`w-5 h-5 rounded-full border-4 border-surface-lowest shrink-0 ${
                step.failed
                  ? "bg-error"
                  : step.done
                  ? "bg-secondary"
                  : "bg-outline-variant"
              }`}
            />
            <span
              className={`text-sm ${
                step.failed
                  ? "font-bold text-on-surface"
                  : step.pending
                  ? "text-on-surface-variant opacity-40"
                  : "text-on-surface-variant"
              }`}
            >
              {step.label}
            </span>
            {step.done && (
              <span className="ml-auto text-xs text-secondary font-bold">✓</span>
            )}
            {step.failed && (
              <AlertCircle size={14} className="ml-auto text-error" />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onResume}
        className="w-full bg-secondary text-white py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Resume Generation
      </button>
    </div>
  );
}

// --- Variant 3: PDF Render Failure ---
export function PDFRenderFailureState({ onDownload }: { onDownload?: () => void }) {
  return (
    <div className="bg-surface-lowest rounded-xl p-6 border border-outline-variant shadow-sm">
      <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center mb-4">
        <FileX size={24} className="text-on-surface" />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface mb-1 block">
        Display Exception
      </span>
      <h3 className="text-xl font-semibold text-on-surface mb-3">
        Resume ready, but preview failed
      </h3>
      <p className="text-on-surface-variant text-sm leading-relaxed mb-5">
        Your resume is fully generated and stored. Our viewer is experiencing a
        slight delay rendering the preview.
      </p>

      {/* Placeholder preview area */}
      <div className="aspect-[4/5] bg-surface-container rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-outline-variant mb-5 cursor-pointer group hover:bg-surface-container-high transition-colors">
        <FileX size={48} className="text-outline-variant mb-3" strokeWidth={1} />
        <p className="text-xs text-on-surface-variant italic">
          Preview temporarily unavailable
        </p>
        <div className="mt-3 flex gap-2">
          <div className="w-2 h-2 rounded-full bg-outline-variant animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-outline-variant animate-pulse delay-75" />
          <div className="w-2 h-2 rounded-full bg-outline-variant animate-pulse delay-150" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onDownload}
          className="flex-1 bg-on-surface text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Download size={16} />
          Download Anyway
        </button>
        <button className="p-3 border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>
    </div>
  );
}
