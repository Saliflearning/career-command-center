"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  MoreHorizontal,
  TrendingUp,
  Calendar,
  Award,
  Activity,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { clsx } from "clsx";

const statusColors: Record<string, string> = {
  READY_TO_APPLY: "bg-primary-container/20 text-on-surface border border-primary/20",
  "Ready To Apply": "bg-primary-container/20 text-on-surface border border-primary/20",
  APPLIED: "bg-surface-container text-on-surface-variant",
  Applied: "bg-surface-container text-on-surface-variant",
  "Phone Screen": "bg-surface-container-high text-on-surface",
  INTERVIEWING: "bg-secondary-container/20 text-on-surface border border-secondary/20",
  Interview: "bg-secondary-container/20 text-on-surface border border-secondary/20",
  OFFER: "bg-secondary-container/30 text-on-surface border border-secondary/20",
  Offer: "bg-secondary-container/30 text-on-surface border border-secondary/20",
  REJECTED: "bg-error/10 text-error border border-error/20",
  Rejected: "bg-error/10 text-error border border-error/20",
  Ghosted: "bg-surface-container text-on-surface-variant",
};

interface Application {
  id: string;
  company: string;
  role: string;
  date: string;
  status: string;
  resume: string;
  resumeId: string | null;
  followUp: string;
  matchScore: number | null;
}

export default function TrackerPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadApplications() {
      try {
        const res = await fetch("/api/applications", { cache: "no-store" });
        if (res.ok) {
          setApplications((await res.json()) as Application[]);
        }
      } catch {
        setApplications([]);
      } finally {
        setLoading(false);
      }
    }
    loadApplications();
  }, []);

  const filtered = applications.filter(
    (a) =>
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = applications.filter((a) => !["REJECTED", "Rejected", "Ghosted"].includes(a.status)).length;
  const interviewCount = applications.filter((a) => ["INTERVIEWING", "Interview", "Phone Screen"].includes(a.status)).length;
  const offerCount = applications.filter((a) => ["OFFER", "Offer"].includes(a.status)).length;
  const successRate = applications.length > 0 ? `${Math.round((offerCount / applications.length) * 100)}%` : "—";

  const stats = [
    { label: "Active Applications", value: String(activeCount), icon: Activity, accent: "text-on-surface" },
    { label: "Interviews Scheduled", value: String(interviewCount), icon: Calendar, accent: "text-secondary" },
    { label: "Offers Received", value: String(offerCount), icon: Award, accent: "text-secondary" },
    { label: "Success Rate", value: successRate, icon: TrendingUp, accent: "text-on-surface" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-10">
        {/* Header section */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-2xl font-semibold text-on-surface">Applications</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-surface-container rounded-full p-1">
                {(["table", "kanban"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={clsx(
                      "px-4 py-1.5 text-sm rounded-full transition-all font-medium",
                      view === v
                        ? "bg-surface-lowest shadow-sm text-on-surface font-bold"
                        : "text-on-surface-variant hover:text-on-surface"
                    )}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <Link
                href="/upload"
                className="flex items-center gap-2 px-4 py-2 bg-on-surface text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Add Application</span>
                <span className="sm:hidden">Add</span>
              </Link>
            </div>
          </div>
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
        </div>

        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map(({ label, value, icon: Icon, accent }) => (
              <div
                key={label}
                className="bg-surface-lowest p-4 rounded-xl border border-outline-variant/10 shadow-sm flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    {label}
                  </p>
                  <p className={`text-2xl font-bold ${accent}`}>{value}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
                  <Icon size={20} className={accent} />
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          {view === "table" && (
            <div className="bg-surface-lowest rounded-xl border border-outline-variant/10 shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    {["Company", "Role", "Date Applied", "Status", "Resume", "Next Follow-up", "Match", ""].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3.5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10"
                      >
                        {h && (
                          <span className="flex items-center gap-1">
                            {h} {h !== "" && <ChevronDown size={12} />}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <Loader2 size={22} className="mx-auto animate-spin text-on-surface-variant" />
                      </td>
                    </tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <div className="mx-auto max-w-sm">
                          <Activity size={28} className="mx-auto mb-3 text-on-surface-variant" />
                          <p className="text-sm font-bold text-on-surface">No applications tracked yet</p>
                          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                            Tailor and export a resume first, then add the application here when you apply.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filtered.map((app) => (
                    <tr
                      key={app.id}
                      className="hover:bg-surface-container/30 transition-colors cursor-pointer border-b border-outline-variant/10 last:border-0"
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-on-surface">{app.company}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-on-surface-variant">{app.role}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs text-on-surface-variant">{app.date}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            statusColors[app.status] || "bg-surface-container text-on-surface-variant"
                          }`}
                        >
                          {app.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-medium text-secondary underline underline-offset-2 cursor-pointer">
                          {app.resume}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs text-on-surface-variant">{app.followUp}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          {app.matchScore !== null ? (
                            <>
                              <div className="h-1.5 w-16 bg-surface-container rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-secondary rounded-full"
                                  style={{ width: `${app.matchScore}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-on-surface">{app.matchScore}%</span>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-on-surface-variant">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <button className="p-1.5 hover:bg-surface-container rounded-md transition-colors text-on-surface-variant">
                          <MoreHorizontal size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Kanban view */}
          {view === "kanban" && (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Object.keys(statusColors).map((status) => {
                const apps = filtered.filter((a) => a.status === status);
                return (
                  <div key={status} className="min-w-[220px] flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                        {status}
                      </span>
                      <span className="text-xs bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant font-bold">
                        {apps.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {apps.map((app) => (
                        <div
                          key={app.id}
                          className="bg-surface-lowest rounded-xl p-4 border border-outline-variant shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        >
                          <p className="text-sm font-bold text-on-surface">{app.company}</p>
                          <p className="text-xs text-on-surface-variant mt-0.5">{app.role}</p>
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-on-surface-variant">{app.date}</span>
                            <span className="text-xs font-bold text-secondary">
                              {app.matchScore !== null ? `${app.matchScore}%` : "—"}
                            </span>
                          </div>
                        </div>
                      ))}
                      <button className="w-full py-2.5 border-2 border-dashed border-outline-variant rounded-xl text-xs text-on-surface-variant hover:border-secondary hover:text-secondary transition-all flex items-center justify-center gap-1.5">
                        <Plus size={12} />
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
