"use client";

import { useEffect, useState, useCallback } from "react";
import { Eye, EyeOff, Save, RefreshCw, CheckCircle2, XCircle, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { clsx } from "clsx";

const MANAGED_KEYS = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API Key",
    description: "Primary AI provider — Claude Haiku (tier 1) and Claude Sonnet (tier 2/3).",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/keys",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API Key",
    description: "Fallback AI provider — GPT-4o-mini (tier 1) and GPT-4o (tier 2/3).",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    key: "LATEX_WORKER_URL",
    label: "LaTeX Worker URL",
    description: "URL for the LaTeX PDF renderer Docker worker. Default: http://localhost:4000",
    placeholder: "http://localhost:4000",
    docsUrl: null,
  },
] as const;

type KeyName = (typeof MANAGED_KEYS)[number]["key"];
type Source = "db" | "env" | "missing";

interface KeyState {
  source: Source;
  inputValue: string;
  showValue: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

const defaultKeyState = (): KeyState => ({
  source: "missing",
  inputValue: "",
  showValue: false,
  saving: false,
  saved: false,
  error: null,
});

function SourceBadge({ source }: { source: Source }) {
  if (source === "db") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
        <ShieldCheck size={11} />
        Saved in DB (encrypted)
      </span>
    );
  }
  if (source === "env") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
        ENV variable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 border border-red-200">
      <XCircle size={11} />
      Not set
    </span>
  );
}

export default function AdminConfigPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyStates, setKeyStates] = useState<Record<KeyName, KeyState>>(
    () =>
      Object.fromEntries(
        MANAGED_KEYS.map((k) => [k.key, defaultKeyState()])
      ) as Record<KeyName, KeyState>
  );

  const loadSources = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/config");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Failed to load config");
      }
      const data: { keys: Record<KeyName, Source> } = await res.json();
      setKeyStates((prev) => {
        const next = { ...prev };
        for (const k of MANAGED_KEYS) {
          next[k.key] = { ...next[k.key], source: data.keys[k.key] ?? "missing" };
        }
        return next;
      });
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const setField = (key: KeyName, patch: Partial<KeyState>) => {
    setKeyStates((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSave = async (key: KeyName) => {
    const value = keyStates[key].inputValue.trim();
    setField(key, { saving: true, error: null, saved: false });
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setField(key, { saving: false, saved: true, source: data.source, inputValue: "" });
      setTimeout(() => setField(key, { saved: false }), 3000);
    } catch (e: unknown) {
      setField(key, { saving: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  };

  const handleRemove = async (key: KeyName) => {
    if (!confirm(`Remove the DB-stored value for ${key}? The system will fall back to the .env file.`))
      return;
    setField(key, { saving: true, error: null });
    try {
      const res = await fetch("/api/admin/config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setField(key, { saving: false, source: data.source, inputValue: "" });
    } catch (e: unknown) {
      setField(key, { saving: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  };

  return (
    <div className="px-8 py-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">API Configuration</h1>
        <p className="mt-1 text-sm text-gray-500">
          Keys are encrypted with AES-256-GCM and stored in the database. Changes take effect
          within 60 seconds — no restart needed.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
          <button onClick={loadSources} className="ml-3 underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading configuration…
        </div>
      ) : (
        <div className="space-y-5">
          {MANAGED_KEYS.map((def) => {
            const state = keyStates[def.key];
            return (
              <div
                key={def.key}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4 mb-1">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{def.label}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>
                  </div>
                  <SourceBadge source={state.source} />
                </div>

                {def.docsUrl && (
                  <a
                    href={def.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline mb-3 inline-block"
                  >
                    Get a key →
                  </a>
                )}

                {state.source === "db" && (
                  <div className="mt-3 mb-2 flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    A value is saved. Paste a new key below to replace it.
                    <button
                      onClick={() => handleRemove(def.key)}
                      disabled={state.saving}
                      className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                )}

                <div className="relative mt-3 flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={state.showValue ? "text" : "password"}
                      value={state.inputValue}
                      onChange={(e) => setField(def.key, { inputValue: e.target.value })}
                      placeholder={
                        state.source !== "missing"
                          ? "Paste to replace current value…"
                          : def.placeholder
                      }
                      className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 pl-3 pr-10 text-sm font-mono text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-400"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && state.inputValue.trim()) handleSave(def.key);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setField(def.key, { showValue: !state.showValue })}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {state.showValue ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  <button
                    onClick={() => handleSave(def.key)}
                    disabled={!state.inputValue.trim() || state.saving}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                      state.inputValue.trim() && !state.saving
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    {state.saving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : state.saved ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <Save size={14} />
                    )}
                    {state.saving ? "Saving…" : state.saved ? "Saved!" : "Save"}
                  </button>
                </div>

                {state.error && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <XCircle size={12} />
                    {state.error}
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex justify-end pt-1">
            <button
              onClick={loadSources}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              <RefreshCw size={12} />
              Refresh status
            </button>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
            <strong className="text-gray-700">Priority order:</strong> DB value (set here) overrides
            the <code className="rounded bg-gray-200 px-1 py-0.5 font-mono">.env</code> file. Remove
            a DB entry to fall back to the env file.
          </div>
        </div>
      )}
    </div>
  );
}
