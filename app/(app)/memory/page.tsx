"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Award, Briefcase, CheckCircle2, GraduationCap, Loader2,
  Pencil, Plus, Search, Terminal, Trash2, Upload, X, Zap,
} from "lucide-react";
import { clsx } from "clsx";
import { safeInternalReturnPath } from "@/lib/navigation/return-path";

type Category = "experience" | "education" | "skills" | "certifications" | "projects";

type ProfileEntry = {
  id: string;
  title: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  location?: string;
  bullets?: string[];
  tags?: string[];
  date?: string;
  expected?: boolean;
  qualifier?: string;
  year?: string;
  description?: string;
  technologies?: string[];
  verified: boolean;
  source: string;
  usedInResumes?: number;
};

type ProfileData = Record<Category, ProfileEntry[]>;

const EMPTY_PROFILE: ProfileData = {
  experience: [], education: [], skills: [], certifications: [], projects: [],
};

const categories = [
  { id: "experience" as const, label: "Work Experience", icon: Briefcase },
  { id: "education" as const, label: "Education", icon: GraduationCap },
  { id: "skills" as const, label: "Skills", icon: Zap },
  { id: "certifications" as const, label: "Certifications", icon: Award },
  { id: "projects" as const, label: "Projects", icon: Terminal },
];

type EntryDraft = {
  title: string; company: string; startDate: string; endDate: string;
  current: boolean; location: string; bullets: string; date: string;
  expected: boolean; qualifier: string; year: string; description: string;
  technologies: string;
};

const EMPTY_DRAFT: EntryDraft = {
  title: "", company: "", startDate: "", endDate: "", current: false,
  location: "", bullets: "", date: "", expected: false, qualifier: "",
  year: "", description: "", technologies: "",
};

export default function MemoryPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [activeCategory, setActiveCategory] = useState<Category>("experience");
  const [search, setSearch] = useState("");
  const [returnTo, setReturnTo] = useState("/dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProfileEntry | null | "new">(null);
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_DRAFT);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/career-profile", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/signin?callbackUrl=%2Fmemory");
        return;
      }
      if (!response.ok) throw new Error("Career Profile could not be loaded.");
      setProfile((await response.json()) as ProfileData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Career Profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeInternalReturnPath(params.get("returnTo"), "/dashboard"));
    void loadProfile();
  }, [loadProfile]);

  const totalEntries = useMemo(
    () => Object.values(profile).reduce((sum, entries) => sum + entries.length, 0),
    [profile]
  );

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return profile[activeCategory];
    return profile[activeCategory].filter((item) =>
      [item.title, item.company, item.location, item.description, ...(item.bullets ?? []), ...(item.tags ?? []), ...(item.technologies ?? [])]
        .filter(Boolean).join(" ").toLowerCase().includes(query)
    );
  }, [activeCategory, profile, search]);

  function openEditor(entry?: ProfileEntry) {
    setEditing(entry ?? "new");
    setDraft(entry ? {
      ...EMPTY_DRAFT,
      title: entry.title,
      company: entry.company ?? "",
      startDate: entry.startDate ?? "",
      endDate: entry.endDate ?? "",
      current: entry.current ?? false,
      location: entry.location ?? "",
      bullets: (entry.bullets ?? []).join("\n"),
      date: entry.date ?? "",
      expected: entry.expected ?? false,
      qualifier: entry.qualifier ?? "",
      year: entry.year ?? "",
      description: entry.description ?? "",
      technologies: (entry.technologies ?? []).join(", "),
    } : EMPTY_DRAFT);
  }

  async function saveEntry() {
    if (!draft.title.trim()) {
      setError("Add a title or name before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/career-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editing === "new" ? "create" : "update",
          category: activeCategory,
          id: editing === "new" ? undefined : editing?.id,
          data: draft,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((result as { error?: string }).error ?? "Could not save this entry.");
      setEditing(null);
      await loadProfile();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this entry.");
    } finally {
      setSaving(false);
    }
  }

  async function performAction(action: "delete" | "verify", entry: ProfileEntry) {
    if (action === "delete" && !window.confirm(`Delete "${entry.title}" from your Career Profile?`)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/career-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, category: activeCategory, id: entry.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((result as { error?: string }).error ?? "Profile update failed.");
      await loadProfile();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Profile update failed.");
    } finally {
      setSaving(false);
    }
  }

  const returnsToResume = returnTo.startsWith("/workspace/") || (returnTo.startsWith("/upload") && returnTo.includes("resumeId="));

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-container px-4 py-7 md:px-8 md:py-9">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.push(returnTo)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant bg-surface-lowest px-3 text-sm font-semibold hover:bg-surface-container-low">
              <ArrowLeft size={16} />
              {returnsToResume ? "Back to resume" : "Back"}
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Reusable evidence</p>
              <h1 className="text-2xl font-semibold text-on-surface" style={{ fontFamily: "'IBM Plex Serif', serif" }}>Career Profile</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/upload" className="inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant bg-surface-lowest px-3 text-sm font-semibold hover:bg-surface-container-low">
              <Upload size={16} /> Import resume
            </Link>
            <button type="button" onClick={() => openEditor()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-on-surface px-4 text-sm font-semibold text-white hover:opacity-90">
              <Plus size={16} /> Add {categories.find((item) => item.id === activeCategory)?.label}
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-3 border-y border-outline-variant/35 py-4 sm:grid-cols-3">
          <div><p className="text-2xl font-semibold">{totalEntries}</p><p className="text-xs uppercase text-on-surface-variant">Profile facts</p></div>
          <div><p className="text-2xl font-semibold">{profile.experience.filter((item) => item.verified).length}</p><p className="text-xs uppercase text-on-surface-variant">Verified roles</p></div>
          <div><p className="text-2xl font-semibold">{profile.skills.length}</p><p className="text-xs uppercase text-on-surface-variant">Reusable skills</p></div>
        </section>

        {error && <div role="alert" className="mb-4 rounded-lg border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}

        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search profile" className="h-10 w-full rounded-lg border border-outline-variant bg-surface-lowest pl-9 pr-3 text-sm outline-none focus:border-secondary" />
            </div>
            <nav className="space-y-1">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <button key={category.id} type="button" onClick={() => setActiveCategory(category.id)} className={clsx("flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm", activeCategory === category.id ? "bg-on-surface font-semibold text-white" : "text-on-surface-variant hover:bg-surface-container-low")}>
                    <span className="flex items-center gap-2"><Icon size={17} />{category.label}</span>
                    <span>{profile[category.id].length}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{categories.find((item) => item.id === activeCategory)?.label}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Facts here can be reused by Scan and Generate. Verify only what is accurate.</p>
              </div>
            </div>

            {loading ? (
              <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-secondary" /></div>
            ) : items.length === 0 ? (
              <div className="border-y border-outline-variant/35 py-14 text-center">
                <p className="font-semibold">No {categories.find((item) => item.id === activeCategory)?.label.toLowerCase()} yet.</p>
                <p className="mt-2 text-sm text-on-surface-variant">Import a resume or add the first entry manually.</p>
                <button type="button" onClick={() => openEditor()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-on-surface px-4 text-sm font-semibold text-white"><Plus size={16} /> Add entry</button>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/35 border-y border-outline-variant/35">
                {items.map((entry) => (
                  <article key={entry.id} className="py-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">{entry.title}</h3>
                          {entry.verified && <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-1 text-[11px] font-semibold text-secondary"><CheckCircle2 size={12} /> Verified</span>}
                          <span className="rounded-full bg-surface-container-low px-2 py-1 text-[11px] font-semibold text-on-surface-variant">{entry.source.toLowerCase()}</span>
                        </div>
                        {entry.company && <p className="mt-1 text-sm font-medium text-on-surface-variant">{entry.company}</p>}
                        <p className="mt-1 text-xs text-on-surface-variant">{formatMeta(activeCategory, entry)}</p>
                        {entry.description && <p className="mt-3 text-sm leading-relaxed">{entry.description}</p>}
                        {(entry.bullets ?? []).length > 0 && <ul className="mt-3 space-y-2">{entry.bullets!.map((bullet, index) => <li key={index} className="flex gap-2 text-sm leading-relaxed"><span>•</span><span>{bullet}</span></li>)}</ul>}
                        {(entry.tags ?? entry.technologies ?? []).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{(entry.tags ?? entry.technologies ?? []).map((tag) => <span key={tag} className="rounded-md bg-surface-container-low px-2 py-1 text-xs text-on-surface-variant">{tag}</span>)}</div>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {!entry.verified && activeCategory === "experience" && <button type="button" onClick={() => void performAction("verify", entry)} className="h-9 rounded-lg px-3 text-xs font-semibold text-secondary hover:bg-secondary/10">Verify</button>}
                        <button type="button" aria-label="Edit entry" onClick={() => openEditor(entry)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-container-low"><Pencil size={15} /></button>
                        <button type="button" aria-label="Delete entry" onClick={() => void performAction("delete", entry)} className="grid h-9 w-9 place-items-center rounded-lg text-error hover:bg-error/10"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="Edit Career Profile entry">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface-lowest shadow-xl">
            <div className="flex items-center justify-between border-b border-outline-variant/35 px-5 py-4">
              <h2 className="text-lg font-semibold">{editing === "new" ? "Add" : "Edit"} {categories.find((item) => item.id === activeCategory)?.label}</h2>
              <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-container-low"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <Field label={titleLabel(activeCategory)} value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
              {activeCategory !== "skills" && <Field label={companyLabel(activeCategory)} value={draft.company} onChange={(value) => setDraft({ ...draft, company: value })} />}
              {activeCategory === "skills" && <><Field label="Category" value={draft.company} onChange={(value) => setDraft({ ...draft, company: value })} /><Field label="Qualifier" value={draft.qualifier} onChange={(value) => setDraft({ ...draft, qualifier: value })} placeholder="Basic, intermediate, advanced..." /></>}
              {activeCategory === "experience" && <>
                <div className="grid gap-3 sm:grid-cols-2"><Field type="date" label="Start date" value={draft.startDate} onChange={(value) => setDraft({ ...draft, startDate: value })} /><Field type="date" label="End date" value={draft.endDate} onChange={(value) => setDraft({ ...draft, endDate: value })} disabled={draft.current} /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.current} onChange={(event) => setDraft({ ...draft, current: event.target.checked, endDate: event.target.checked ? "" : draft.endDate })} /> I currently work here</label>
                <Field label="Location" value={draft.location} onChange={(value) => setDraft({ ...draft, location: value })} />
                <TextArea label="Evidence bullets" value={draft.bullets} onChange={(value) => setDraft({ ...draft, bullets: value })} placeholder="One truthful accomplishment per line" />
              </>}
              {activeCategory === "education" && <><Field type="date" label="Graduation date" value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.expected} onChange={(event) => setDraft({ ...draft, expected: event.target.checked })} /> Expected / in progress</label></>}
              {activeCategory === "certifications" && <Field label="Year" value={draft.year} onChange={(value) => setDraft({ ...draft, year: value })} />}
              {activeCategory === "projects" && <><TextArea label="Description" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} /><Field label="Technologies" value={draft.technologies} onChange={(value) => setDraft({ ...draft, technologies: value })} placeholder="Python, AWS, SQL" /></>}
            </div>
            <div className="flex justify-end gap-2 border-t border-outline-variant/35 px-5 py-4">
              <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-lg border border-outline-variant px-4 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void saveEntry()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-on-surface px-4 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />} Save entry</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; disabled?: boolean }) {
  return <label className="block text-sm font-semibold">{label}<input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm font-normal outline-none focus:border-secondary disabled:bg-surface-container-low" /></label>;
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block text-sm font-semibold">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={5} className="mt-1.5 w-full resize-y rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm font-normal outline-none focus:border-secondary" /></label>;
}

function formatMeta(category: Category, entry: ProfileEntry) {
  if (category === "experience") return [entry.startDate, entry.current ? "Present" : entry.endDate, entry.location].filter(Boolean).join(" · ");
  if (category === "education") return [entry.date, entry.expected ? "Expected" : ""].filter(Boolean).join(" · ");
  if (category === "skills") return entry.qualifier ?? "";
  if (category === "certifications") return entry.year ?? "";
  return entry.company ?? "";
}

function titleLabel(category: Category) {
  if (category === "experience") return "Role title";
  if (category === "education") return "Degree";
  if (category === "skills") return "Skill";
  if (category === "certifications") return "Certification";
  return "Project name";
}

function companyLabel(category: Category) {
  if (category === "experience") return "Company";
  if (category === "education") return "School";
  if (category === "certifications") return "Issuer";
  if (category === "projects") return "Project URL";
  return "Category";
}
