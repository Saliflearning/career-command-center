"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface AdminResume {
  id: string;
  targetRole: string;
  targetCompany: string | null;
  state: string;
  atsScore: number | null;
  keywordScore: number | null;
  createdAt: string;
  exportedAt: string | null;
  user: { email: string; name: string | null };
}

const STATE_COLORS: Record<string, string> = {
  UPLOADED: "bg-gray-100 text-gray-600",
  PARSED: "bg-blue-50 text-blue-600",
  NORMALIZED: "bg-blue-50 text-blue-600",
  VERIFIED: "bg-indigo-50 text-indigo-600",
  JD_ANALYZED: "bg-purple-50 text-purple-600",
  STRATEGY_READY: "bg-violet-50 text-violet-600",
  GENERATING: "bg-amber-50 text-amber-700",
  QA_REVIEWED: "bg-cyan-50 text-cyan-700",
  USER_EDITING: "bg-sky-50 text-sky-700",
  EXPORTED: "bg-emerald-50 text-emerald-700",
  TRACKED: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-600",
};

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminResumesPage() {
  const [resumes, setResumes] = useState<AdminResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("ALL");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resumes");
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const data = await res.json();
      setResumes(data.resumes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const allStates = Array.from(new Set(resumes.map((r) => r.state))).sort();

  const filtered = resumes.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      r.targetRole.toLowerCase().includes(q) ||
      (r.targetCompany ?? "").toLowerCase().includes(q) ||
      r.user.email.toLowerCase().includes(q) ||
      (r.user.name ?? "").toLowerCase().includes(q);
    const matchState = stateFilter === "ALL" || r.state === stateFilter;
    return matchSearch && matchState;
  });

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Resumes</h1>
          <p className="mt-0.5 text-sm text-gray-500">All resumes across the platform (last 100)</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} —{" "}
          <button onClick={load} className="underline">retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search role, company, or user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
        >
          <option value="ALL">All states</option>
          {allStates.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs text-gray-500 font-medium">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Target Role</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3 text-center">ATS</th>
                <th className="px-5 py-3 text-center">KW</th>
                <th className="px-5 py-3 text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                    {search || stateFilter !== "ALL" ? "No resumes match your filters." : "No resumes yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-800">{r.user.name ?? "—"}</div>
                      <div className="text-xs text-gray-400">{r.user.email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-800">{r.targetRole}</div>
                      {r.targetCompany && (
                        <div className="text-xs text-gray-400">{r.targetCompany}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={clsx(
                          "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                          STATE_COLORS[r.state] ?? "bg-gray-100 text-gray-600"
                        )}
                      >
                        {r.state}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-gray-600">
                      {r.atsScore != null ? `${r.atsScore}%` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-center text-gray-600">
                      {r.keywordScore != null ? `${r.keywordScore}%` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-400 whitespace-nowrap">
                      {fmt(r.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {filtered.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-400">
              {filtered.length} {filtered.length === 1 ? "resume" : "resumes"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
