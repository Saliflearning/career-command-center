"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, MailCheck } from "lucide-react";

function VerifyEmailForm() {
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
      const response = await fetch("/api/auth/verification/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Email verification is temporarily unavailable.");
        return;
      }
      setSent(true);
    } catch {
      setError("Email verification is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7F9] px-6 py-12">
      <section className="w-full max-w-md rounded-lg border border-[#DDE1E5] bg-white p-7 shadow-sm">
        <div className="space-y-7">
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#0058BE]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>

          {sent ? (
            <div className="space-y-5" role="status">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#E8F5E9] text-[#1B6E32]">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-[#191C1E]">
                  Check your inbox
                </h1>
                <p className="text-sm leading-6 text-[#5F6368]">
                  If an unverified account exists for that email, a fresh link is
                  on its way. The link expires after 24 hours and works once.
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
              <div className="space-y-3">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#EAF2FF] text-[#0058BE]">
                  <MailCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold text-[#191C1E]">
                    Send a new verification link
                  </h1>
                  <p className="text-sm leading-6 text-[#5F6368]">
                    Enter your account email. We do not reveal whether an account
                    exists.
                  </p>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#FFBABA] bg-[#FFF0F0] px-4 py-3 text-sm text-[#BA1A1A]"
                >
                  {error}
                </div>
              )}

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <label
                    htmlFor="verification-email"
                    className="text-sm font-medium text-[#191C1E]"
                  >
                    Email address
                  </label>
                  <input
                    id="verification-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-[#C6C6CD] px-3 py-2.5 text-sm text-[#191C1E] outline-none focus:ring-2 focus:ring-[#2170E4]"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#111827] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending secure link..." : "Send verification link"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7F9]" />}>
      <VerifyEmailForm />
    </Suspense>
  );
}
