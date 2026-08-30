"use client";

import { useState } from "react";
import { CheckCircleIcon } from "lucide-react";

const tabs = [
  {
    id: "memory",
    label: "Career Memory",
    headline: "Keep reusable career evidence in one place.",
    body: "Store work history, education, skills, certifications, projects, and achievements so future drafts can reuse facts you have reviewed.",
    features: [
      "Structured experience storage",
      "Reusable skills and credentials",
      "Manual review and editing",
    ],
  },
  {
    id: "tailoring",
    label: "AI Tailoring",
    headline: "Tailoring grounded in your source evidence.",
    body: "The generator uses your resume, Career Profile, and target job to create a draft that remains open to your review and edits.",
    features: [
      "Role-specific section planning",
      "Context-aware skill selection",
      "Claim verification before export",
    ],
  },
  {
    id: "ats",
    label: "Resume Scan",
    headline: "See how the resume aligns with the job.",
    body: "The scan reports matched language, missing evidence, and formatting readiness. Scores are estimates from the supplied resume and job description, not hiring guarantees.",
    features: [
      "Explainable match estimate",
      "Keyword gap analysis",
      "Structure and evidence checks",
    ],
  },
];

export default function FeatureTabs() {
  const [activeTab, setActiveTab] = useState("tailoring");
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[1];

  return (
    <div className="bg-primary-container rounded-[32px] p-8 md:p-12 overflow-hidden relative min-h-[480px]">
      {/* Tab row */}
      <div className="flex flex-wrap gap-3 mb-10 relative z-10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-white text-primary shadow-md"
                : "bg-white/10 text-white/70 hover:bg-white/20 border border-white/20"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center relative z-10">
        <div className="space-y-5 text-white">
          <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
            {current.headline}
          </h2>
          <p className="text-lg text-white/75 leading-relaxed">{current.body}</p>
          <ul className="space-y-3 pt-2">
            {current.features.map((feat) => (
              <li key={feat} className="flex items-center gap-3 text-sm">
                <CheckCircleIcon className="w-5 h-5 text-amber-300 shrink-0" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Visual placeholder */}
        <div className="relative">
          <div className="bg-white/10 rounded-2xl p-6 border border-white/20 backdrop-blur-sm">
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <span className="text-white text-sm font-medium">
                  Resume Preview
                </span>
                <span className="font-mono text-[11px] tracking-[0.05em] uppercase text-amber-300">
                  INPUT-BASED SCAN
                </span>
              </div>
              {[90, 70, 80, 55, 75].map((w, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full ${i === 1 ? "bg-amber-300" : "bg-white/30"}`}
                  style={{ width: `${w}%` }}
                />
              ))}
              <div className="mt-6 grid grid-cols-3 gap-2 pt-4 border-t border-white/20">
                {["Keywords", "Format", "Impact"].map((label) => (
                  <div key={label} className="text-center">
                    <p className="text-white text-lg font-bold">
                      Review
                    </p>
                    <p className="text-white/60 text-xs">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BG decoration */}
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}
