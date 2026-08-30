"use client";

import { useEffect, useState } from "react";
import { Users, FileText, Download, Briefcase, RefreshCw, Loader2 } from "lucide-react";

interface StatsData {
  totalUsers: number;
  totalResumes: number;
  totalApplications: number;
  exportedResumes: number;
  resumesByState: { state: string; count: number }[];
  recentUsers: {
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
    _count: { resumes: number; applications: number };
  }[];
}

const STATE_COLORS: Record<string, string> = {
  UPLOADED: "bg-gray-200 text-gray-700",
  PARSED: "bg-blue-100 text-blue-700",
  NORMALIZED: "bg-blue-100 text-blue-700",
  VERIFIED: "bg-indigo-100 text-indigo-700",
  JD_ANALYZED: "bg-purple-100 text-purple-700",
  STRATEGY_READY: "bg-violet-100 text-violet-700",
  GENERATING: "bg-amber-100 text-amber-700",
  QA_REVIEWED: "bg-cyan-100 text-cyan-700",
  USER_EDITING: "bg-sky-100 text-sky-700",
  EXPORTED: "bg-emerald-100 text-emerald-700",
  TRACKED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="px-8 py-8 max-w-6xl">
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">Platform-wide metrics and recent activity</p>
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

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      ) : data ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 mb-8">
            <StatCard
              label="Total Users"
              value={data.totalUsers}
              icon={Users}
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              label="Resumes Created"
              value={data.totalResumes}
              icon={FileText}
              color="bg-purple-50 text-purple-600"
            />
            <StatCard
              label="PDFs Exported"
              value={data.exportedResumes}
              icon={Download}
              color="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              label="Applications"
              value={data.totalApplications}
              icon={Briefcase}
              color="bg-amber-50 text-amber-600"
            />
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Pipeline state breakdown */}
            <div className="col-span-1 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">Resume Pipeline States</h2>
              {data.resumesByState.length === 0 ? (
                <p className="text-sm text-gray-400">No resumes yet</p>
              ) : (
                <div className="space-y-2">
                  {data.resumesByState.map(({ state, count }) => (
                    <div key={state} className="flex items-center justify-between">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_COLORS[state] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {state}
                      </span>
                      <span className="text-sm font-medium text-gray-700">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent signups */}
            <div className="col-span-2 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">Recent Signups</h2>
              {data.recentUsers.length === 0 ? (
                <p className="text-sm text-gray-400">No users yet</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 font-medium border-b border-gray-100">
                      <th className="pb-2 font-medium">User</th>
                      <th className="pb-2 font-medium text-right">Resumes</th>
                      <th className="pb-2 font-medium text-right">Apps</th>
                      <th className="pb-2 font-medium text-right">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentUsers.map((u) => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5">
                          <div className="font-medium text-gray-800">{u.name ?? "—"}</div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </td>
                        <td className="py-2.5 text-right text-gray-600">{u._count.resumes}</td>
                        <td className="py-2.5 text-right text-gray-600">{u._count.applications}</td>
                        <td className="py-2.5 text-right text-gray-400 whitespace-nowrap">
                          {fmt(u.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
