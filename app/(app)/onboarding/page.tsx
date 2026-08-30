"use client";

import Link from "next/link";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

const steps = [
  { number: 1, label: "Upload resume", status: "active" as const },
  { number: 2, label: "Review data", status: "pending" as const },
  { number: 3, label: "Set targets", status: "pending" as const },
];

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-surface to-surface-container flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl bg-surface-lowest rounded-xl p-12 shadow-sm border border-outline-variant flex flex-col items-center text-center">
        {/* Icon */}
        <div className="w-24 h-24 rounded-full bg-surface-container flex items-center justify-center mb-6">
          <Sparkles size={40} className="text-on-surface" strokeWidth={1.5} />
        </div>

        <h2 className="text-3xl font-semibold text-on-surface mb-2">
          Welcome to Career Command
        </h2>
        <p className="text-base text-on-surface-variant mb-10 max-w-md leading-relaxed">
          Upload your resume and we&apos;ll build your professional workspace.
        </p>

        {/* Stepper */}
        <div className="w-full grid grid-cols-3 gap-2 mb-10 relative">
          {/* connector line */}
          <div className="absolute top-5 left-[calc(50%/3)] right-[calc(50%/3)] h-0.5 bg-outline-variant z-0" />

          {steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col items-center gap-2 relative z-10"
            >
              <div
                className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shadow-sm",
                  step.status === "active"
                    ? "bg-on-surface text-white"
                    : "bg-surface-container-high border-2 border-outline-variant text-on-surface-variant"
                )}
              >
                {step.number}
              </div>
              <span
                className={clsx(
                  "text-xs font-semibold",
                  step.status === "active" ? "text-on-surface" : "text-outline"
                )}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Feature chips */}
        <div className="grid grid-cols-2 gap-3 w-full mb-10">
          {[
            "AI-powered extraction",
            "ATS-safe formatting",
            "Career memory vault",
            "Smart job targeting",
          ].map((feat) => (
            <div
              key={feat}
              className="flex items-center gap-2 bg-surface-container-low rounded-lg p-3 text-sm text-on-surface-variant"
            >
              <CheckCircle2 size={16} className="text-secondary shrink-0" />
              <span>{feat}</span>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex gap-3 w-full">
          <Link
            href="/upload"
            className="flex-1 py-3 bg-on-surface text-white font-semibold rounded-lg hover:opacity-90 transition-opacity text-center text-sm"
          >
            Upload My Resume
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 py-3 border border-outline-variant text-on-surface font-semibold rounded-lg hover:bg-surface-container transition-colors text-center text-sm"
          >
            Skip for now
          </Link>
        </div>

        <p className="mt-6 text-xs text-on-surface-variant">
          Review the privacy policy before uploading sensitive career data.
        </p>
      </div>
    </main>
  );
}
