"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ShieldCheck, Mail, Loader2, KeyRound } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setLoading("google");
    setError(null);
    await signIn("google", { callbackUrl: "/admin/overview" });
  };

  const handleLinkedIn = async () => {
    setLoading("linkedin");
    setError(null);
    await signIn("linkedin", { callbackUrl: "/admin/overview" });
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading("password");
    setError(null);
    try {
      const result = await signIn("admin-password", {
        password,
        callbackUrl: "/admin/overview",
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setError("Incorrect admin password.");
      } else {
        window.location.href = "/admin/overview";
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("email");
    setError(null);
    try {
      const result = await signIn("email", {
        email: email.trim().toLowerCase(),
        callbackUrl: "/admin/overview",
        redirect: false,
      });
      if (result?.error) {
        setError("Could not send magic link. Check your email address and try again.");
      } else {
        setEmailSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 mb-4">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white">Admin Portal</h1>
          <p className="mt-1 text-sm text-white/40">Career Command Center</p>
        </div>

        {emailSent ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mx-auto mb-4">
              <Mail size={22} className="text-emerald-400" />
            </div>
            <h2 className="text-base font-semibold text-white mb-2">Check your inbox</h2>
            <p className="text-sm text-white/50">
              We sent a sign-in link to <span className="text-white/80 font-medium">{email}</span>.
              Click the link in the email to access the admin panel.
            </p>
            <button
              onClick={() => { setEmailSent(false); setEmail(""); }}
              className="mt-5 text-xs text-white/40 hover:text-white/60 underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-3">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "google" ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Sign in with Google
            </button>

            {/* LinkedIn */}
            <button
              onClick={handleLinkedIn}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "linkedin" ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#0A66C2">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              )}
              Sign in with LinkedIn
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-xs text-white/25">or</span>
              <div className="flex-1 border-t border-white/10" />
            </div>

            {/* Admin password */}
            <form onSubmit={handlePassword} className="space-y-2.5">
              <div>
                <label className="block text-white/40 mb-1.5 font-medium tracking-wide uppercase" style={{ fontSize: "10px" }}>
                  Admin password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading !== null || !password.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === "password" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <KeyRound size={15} />
                )}
                {loading === "password" ? "Signing in…" : "Sign in with password"}
              </button>
            </form>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-xs text-white/25">or</span>
              <div className="flex-1 border-t border-white/10" />
            </div>

            {/* Email magic link */}
            <form onSubmit={handleEmail} className="space-y-2.5">
              <div>
                <label className="block text-xs text-white/40 mb-1.5 font-medium tracking-wide uppercase" style={{ fontSize: "10px" }}>
                  Email magic link
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading !== null || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === "email" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Mail size={15} />
                )}
                {loading === "email" ? "Sending…" : "Send magic link"}
              </button>
            </form>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-white/20">
          Admin access only. Unauthorized attempts are logged.
        </p>
      </div>
    </div>
  );
}
