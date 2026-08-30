"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from "lucide-react";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Password recovery is temporarily unavailable.");
        return;
      }
      setSent(true);
    } catch {
      setError("Password recovery is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(320px,0.8fr)_minmax(480px,1.2fr)]">
      <section className="hidden bg-[#0F1729] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Career Command Center
        </Link>
        <div className="max-w-sm space-y-5">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#2170E4]">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="font-serif text-4xl leading-tight">Recover access securely.</h1>
          <p className="text-sm leading-6 text-white/70">
            Reset links expire after one hour and work once. We never reveal whether an email belongs to an account.
          </p>
        </div>
        <p className="text-xs text-white/35">Career Command Center account security</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-7">
          <Link href="/signin" className="inline-flex items-center gap-2 text-sm font-medium text-[#0058BE]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>

          {sent ? (
            <div className="space-y-5" role="status">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#E8F5E9] text-[#1B6E32]">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-[#191C1E]">Check your inbox</h2>
                <p className="text-sm leading-6 text-[#5F6368]">
                  If an account exists for that email, a password reset link is on its way. Check spam if it does not arrive within a few minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-sm font-semibold text-[#0058BE] underline underline-offset-4"
              >
                Try another email
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-[#191C1E]">Forgot your password?</h2>
                <p className="text-sm leading-6 text-[#5F6368]">
                  Enter the email used for your account. We will send a secure reset link if the account exists.
                </p>
              </div>

              {error && (
                <div role="alert" className="rounded-lg border border-[#FFBABA] bg-[#FFF0F0] px-4 py-3 text-sm text-[#BA1A1A]">
                  {error}
                </div>
              )}

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="recovery-email" className="text-sm font-medium text-[#191C1E]">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[#76777D]" aria-hidden="true" />
                    <input
                      id="recovery-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-lg border border-[#C6C6CD] py-2.5 pl-10 pr-3 text-sm text-[#191C1E] outline-none focus:ring-2 focus:ring-[#2170E4]"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#111827] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending secure link..." : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
