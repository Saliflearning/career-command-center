"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gavel,
  Briefcase,
  MessageSquare,
  Save,
  Sparkles,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { clsx } from "clsx";

const settingsNav = [
  { id: "profile", label: "Profile" },
  { id: "generation", label: "Generation" },
];

const toneOptions = [
  { id: "professional", label: "Professional", desc: "Clear, polished, broadly safe", icon: Briefcase },
  { id: "leadership", label: "Leadership-first", desc: "Owns scope, teams, and decisions", icon: Gavel },
  { id: "technical", label: "Technical", desc: "Highlights systems, tools, and execution", icon: MessageSquare },
  { id: "executive", label: "Executive", desc: "Sharper positioning for senior roles", icon: Sparkles },
];

const bulletStyleOptions = [
  { id: "impact", label: "Evidence-first", desc: "Start with verified outcomes and scope" },
  { id: "metric", label: "Metric-led", desc: "Prioritize numbers when evidence supports them" },
  { id: "action", label: "Action verbs", desc: "Use direct, active phrasing" },
];

const lengthOptions = [
  {
    id: "auto",
    label: "Auto Detect",
    desc: "Recommended. Uses job type, seniority, years of experience, content density, and LaTeX page-fit rules.",
  },
  { id: "one-page", label: "One Page", desc: "Force compact output for most roles." },
  { id: "two-page", label: "Two Pages", desc: "Manual override for senior or executive roles." },
];

function normalizeTone(value: string) {
  if (value === "formal") return "professional";
  if (value === "conversational") return "professional";
  if (value === "Leadership-first") return "leadership";
  if (value === "Technical") return "technical";
  if (value === "Executive") return "executive";
  return value || "professional";
}

interface SettingsData {
  profile: { name: string; email: string; location: string; linkedinUrl: string };
  generation: { tone: string; aggression: number; bulletStyle: string; lengthPref: string };
  notifications: { emailNotif: boolean; aiSuggestions: boolean; autoSave: boolean };
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("generation");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile state
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileLinkedin, setProfileLinkedin] = useState("");

  // Generation state
  const [tone, setTone] = useState("formal");
  const [aggression, setAggression] = useState(50);
  const [bulletStyle, setBulletStyle] = useState("impact");
  const [lengthPref, setLengthPref] = useState("auto");

  // Notification state
  const [emailNotif, setEmailNotif] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState(true);
  const [autoSave, setAutoSave] = useState(true);

  // Load settings on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = (await res.json()) as SettingsData;
          setProfileName(data.profile.name);
          setProfileEmail(data.profile.email);
          setProfileLocation(data.profile.location);
          setProfileLinkedin(data.profile.linkedinUrl);
          setTone(normalizeTone(data.generation.tone));
          setAggression(data.generation.aggression);
          setBulletStyle(data.generation.bulletStyle);
          setLengthPref(data.generation.lengthPref);
          setEmailNotif(data.notifications.emailNotif);
          setAiSuggestions(data.notifications.aiSuggestions);
          setAutoSave(data.notifications.autoSave);
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = useCallback(async (section: string) => {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {};

      if (section === "profile") {
        body.profile = {
          name: profileName,
          location: profileLocation,
          linkedinUrl: profileLinkedin,
        };
      } else if (section === "generation") {
        body.generation = { tone, aggression, bulletStyle, lengthPref };
        body.notifications = { emailNotif, aiSuggestions, autoSave };
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      // silent fail for now
    } finally {
      setSaving(false);
    }
  }, [profileName, profileLocation, profileLinkedin, tone, aggression, bulletStyle, lengthPref, emailNotif, aiSuggestions, autoSave]);

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-on-surface-variant" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-on-surface">Settings</h2>
            {saved && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-secondary">
                <CheckCircle2 size={14} />
                Saved
              </span>
            )}
          </div>
          <button
            onClick={() => handleSave(activeSection)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-on-surface text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="mb-5 overflow-x-auto">
          <nav
            aria-label="Settings sections"
            className="flex min-w-max gap-1 rounded-xl border border-outline-variant/20 bg-surface-lowest p-1 shadow-sm"
          >
          {settingsNav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={clsx(
                "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                activeSection === item.id
                  ? "bg-on-surface text-white shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              )}
            >
              {item.label}
            </button>
          ))}
          </nav>
        </div>

        <section className="space-y-5">
            {/* Generation Preferences */}
            {activeSection === "generation" && (
              <>
                <div className="bg-surface-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-on-surface mb-1">
                      Generation Preferences
                    </h2>
                    <p className="text-sm text-on-surface-variant">
                      Configure how the AI crafts your professional narratives.
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
                      <div className="flex items-start gap-3">
                        <Sparkles size={18} className="mt-0.5 shrink-0 text-secondary" />
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            Defaults, not hard rules
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                            The job description, verified resume evidence, and page-fit checks still take priority.
                            These settings guide new drafts when there is room for style choice.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Length preference */}
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                          Resume Length
                        </label>
                        <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                          Auto recommended
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {lengthOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setLengthPref(opt.id)}
                            className={clsx(
                              "min-h-[128px] rounded-lg border-2 p-4 text-left transition-all",
                              lengthPref === opt.id
                                ? "border-on-surface bg-on-surface/5"
                                : "border-outline-variant/30 hover:border-on-surface"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {opt.id === "auto" && (
                                <Sparkles
                                  size={16}
                                  className={lengthPref === opt.id ? "text-secondary" : "text-on-surface-variant"}
                                />
                              )}
                              <p className="text-sm font-bold text-on-surface">{opt.label}</p>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tone */}
                    <div className="pt-5 border-t border-outline-variant/10">
                      <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-3">
                        Narrative Voice
                      </label>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {toneOptions.map(({ id, label, desc, icon: Icon }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setTone(id)}
                            className={clsx(
                              "rounded-lg border-2 p-3 text-left transition-all",
                              tone === id
                                ? "border-secondary bg-secondary/5"
                                : "border-outline-variant/30 hover:border-secondary"
                            )}
                          >
                            <Icon
                              size={18}
                              className={tone === id ? "text-secondary" : "text-on-surface-variant"}
                            />
                            <p className="mt-2 text-sm font-bold text-on-surface">{label}</p>
                            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bullet style */}
                    <div className="pt-5 border-t border-outline-variant/10">
                      <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-3">
                        Bullet Emphasis
                      </label>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {bulletStyleOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setBulletStyle(opt.id)}
                            className={clsx(
                              "rounded-lg border-2 p-3 text-left transition-all",
                              bulletStyle === opt.id
                                ? "border-secondary bg-secondary/5"
                                : "border-outline-variant/30 hover:border-secondary"
                            )}
                          >
                            <p
                              className={clsx(
                                "text-sm font-bold",
                                bulletStyle === opt.id ? "text-secondary" : "text-on-surface"
                              )}
                            >
                              {opt.label}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notifications card */}
                <div className="bg-surface-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
                  <h3 className="text-base font-bold text-on-surface mb-5">
                    Notification Preferences
                  </h3>
                  <div className="space-y-4">
                    {[
                      { label: "Email notifications", sublabel: "Receive updates via email", value: emailNotif, setter: setEmailNotif },
                      { label: "AI suggestions", sublabel: "Show real-time writing suggestions", value: aiSuggestions, setter: setAiSuggestions },
                      { label: "Auto-save", sublabel: "Automatically save changes every 30s", value: autoSave, setter: setAutoSave },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between py-3 border-b border-outline-variant/20 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-semibold text-on-surface">{item.label}</p>
                          <p className="text-xs text-on-surface-variant mt-0.5">{item.sublabel}</p>
                        </div>
                        <button
                          onClick={() => item.setter(!item.value)}
                          className={clsx(
                            "w-11 h-6 rounded-full flex items-center px-1 transition-colors",
                            item.value ? "bg-secondary" : "bg-outline-variant"
                          )}
                        >
                          <div
                            className={clsx(
                              "w-4 h-4 bg-white rounded-full shadow-sm transition-transform",
                              item.value ? "translate-x-5" : "translate-x-0"
                            )}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleSave("generation")}
                    disabled={saving}
                    className="flex items-center gap-2 px-8 py-3 bg-on-surface text-white font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? "Saving..." : "Save Preferences"}
                  </button>
                </div>
              </>
            )}

            {/* Profile */}
            {activeSection === "profile" && (
              <div className="bg-surface-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm">
                <h2 className="text-xl font-semibold text-on-surface mb-6">Profile Settings</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-secondary transition-colors bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={profileEmail}
                      disabled
                      className="w-full border border-outline-variant rounded-lg px-4 py-3 text-sm bg-surface-container text-on-surface-variant cursor-not-allowed"
                    />
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      Email is linked to your login and cannot be changed here.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                      Location
                    </label>
                    <input
                      type="text"
                      value={profileLocation}
                      onChange={(e) => setProfileLocation(e.target.value)}
                      placeholder="City, State"
                      className="w-full border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-secondary transition-colors bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                      LinkedIn URL
                    </label>
                    <input
                      type="url"
                      value={profileLinkedin}
                      onChange={(e) => setProfileLinkedin(e.target.value)}
                      placeholder="linkedin.com/in/yourprofile"
                      className="w-full border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-secondary transition-colors bg-white"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => handleSave("profile")}
                    disabled={saving}
                    className="flex items-center gap-2 px-8 py-3 bg-on-surface text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? "Saving..." : "Update Profile"}
                  </button>
                </div>
              </div>
            )}

        </section>
      </div>
    </main>
  );
}
