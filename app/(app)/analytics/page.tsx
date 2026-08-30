"use client";

import Link from "next/link";
import {
  BarChart2,
  Target,
  TrendingUp,
  FileText,
  ArrowRight,
} from "lucide-react";

export default function AnalyticsPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="fixed top-0 left-0 md:left-56 right-0 h-14 bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 flex items-center justify-between px-6 z-40">
        <h2 className="text-xl font-semibold text-on-surface">Analytics</h2>
      </header>

      <div className="pt-24 pb-12 px-6 max-w-5xl mx-auto">
        {/* Stats row — all zeros, real data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Resumes Created", value: "0", icon: FileText },
            { label: "Applications Tracked", value: "0", icon: Target },
            { label: "Avg Match Score", value: "--", icon: TrendingUp },
            { label: "Interviews", value: "0", icon: BarChart2 },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="bg-surface-lowest p-5 rounded-xl border border-outline-variant/10 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  {label}
                </p>
                <Icon size={16} className="text-on-surface-variant" />
              </div>
              <p className="text-3xl font-bold text-on-surface">{value}</p>
            </div>
          ))}
        </div>

        {/* Empty state */}
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-12 text-center max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-full bg-surface-container mx-auto mb-6 flex items-center justify-center">
            <BarChart2 size={28} className="text-on-surface-variant" />
          </div>
          <h3
            className="text-2xl font-semibold text-on-surface mb-3"
            style={{ fontFamily: "'IBM Plex Serif', serif" }}
          >
            Your insights will appear here
          </h3>
          <p className="text-sm text-on-surface-variant leading-relaxed max-w-md mx-auto mb-8">
            Generate your first tailored resume and track an application to start
            seeing match scores, response rates, and career trends.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-6 py-3 bg-on-surface text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Create a Resume
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/tracker"
              className="inline-flex items-center gap-2 px-6 py-3 border border-outline-variant text-on-surface rounded-lg text-sm font-semibold hover:bg-surface-container transition-colors"
            >
              Track an Application
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
