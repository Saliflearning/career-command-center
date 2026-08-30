const WORKSPACE_STAGES = [
  { label: "Career profile", detail: "Verified source facts" },
  { label: "Job context", detail: "Role-specific requirements" },
  { label: "Tailored draft", detail: "Review before export" },
  { label: "Export", detail: "Editable and downloadable" },
] as const;

export function AuthWorkspacePreview() {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-[11px] font-medium uppercase text-white/40">
          One workspace
        </span>
      </div>
      <ol className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
        {WORKSPACE_STAGES.map((stage, index) => (
          <li
            key={stage.label}
            className="flex min-h-20 items-center gap-3 bg-[#141d31] px-4 py-3"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/15 text-xs font-semibold text-white/70">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white/90">
                {stage.label}
              </span>
              <span className="block text-xs leading-5 text-white/45">
                {stage.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
