"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  XCircle,
} from "lucide-react";
import {
  MIN_PASSWORD_LENGTH,
  evaluatePassword,
  passwordPolicyMessage,
} from "@/lib/auth/password-policy";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkLooksValid = /^[a-f0-9]{64}$/.test(token) && email.includes("@");
  const passwordAssessment = evaluatePassword(password);
  const confirmationStarted = confirmation.length > 0;
  const passwordsMatch = confirmationStarted && password === confirmation;
  const canSubmit = passwordAssessment.valid && passwordsMatch && !loading;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!passwordAssessment.valid) {
      setError(
        passwordPolicyMessage(passwordAssessment.reason) ??
          "Choose a valid password."
      );
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "This password reset link is invalid or expired.");
        return;
      }
      setComplete(true);
    } catch {
      setError("Password reset failed. Please request a new link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7F9] px-6 py-12">
      <section className="w-full max-w-md rounded-lg border border-[#DDE1E5] bg-white p-7 shadow-sm">
        {complete ? (
          <div className="space-y-5 text-center" role="status">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#E8F5E9] text-[#1B6E32]">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-[#191C1E]">Password updated</h1>
              <p className="text-sm leading-6 text-[#5F6368]">Your reset link has been used and cannot be used again.</p>
            </div>
            <Link href="/signin" className="block rounded-lg bg-[#111827] px-4 py-3 text-sm font-semibold text-white">
              Sign in with your new password
            </Link>
          </div>
        ) : !linkLooksValid ? (
          <div className="space-y-5 text-center">
            <h1 className="text-2xl font-semibold text-[#191C1E]">Invalid reset link</h1>
            <p className="text-sm leading-6 text-[#5F6368]">This link is incomplete. Request a new password reset email.</p>
            <Link href="/forgot-password" className="block rounded-lg bg-[#111827] px-4 py-3 text-sm font-semibold text-white">
              Request a new link
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#EAF2FF] text-[#0058BE]">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-[#191C1E]">Choose a new password</h1>
                <p className="text-sm leading-6 text-[#5F6368]">
                  Create a long passphrase you have not used for this account.
                  This link works once.
                </p>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-[#FFBABA] bg-[#FFF0F0] px-4 py-3 text-sm text-[#BA1A1A]">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="text-sm font-medium text-[#191C1E]">New password</label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    aria-describedby="password-rules password-length-status"
                    aria-invalid={password.length > 0 && !passwordAssessment.valid}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-[#8A8D93] bg-white px-3 py-2.5 pr-12 text-sm text-[#191C1E] caret-[#191C1E] outline-none placeholder:text-[#76777D] focus:border-[#2170E4] focus:ring-2 focus:ring-[#2170E4]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide new password" : "Show new password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide new password" : "Show new password"}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#45464D] hover:text-[#191C1E] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2170E4]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <p
                  id="password-length-status"
                  className={`text-xs ${password.length > 0 && !passwordAssessment.valid ? "text-[#BA1A1A]" : "text-[#5F6368]"}`}
                >
                  {passwordAssessment.reason === "too-long"
                    ? "Password is too long. Use a shorter passphrase."
                    : `${passwordAssessment.characterCount} characters; ${MIN_PASSWORD_LENGTH} minimum`}
                </p>
              </div>

              <div id="password-rules" className="rounded-lg border border-[#DDE1E5] bg-[#F7F8FA] px-4 py-3">
                <p className="text-xs font-semibold uppercase text-[#45464D]">Password rules</p>
                <ul className="mt-2 space-y-2 text-sm text-[#45464D]">
                  <li className="flex items-start gap-2">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${passwordAssessment.characterCount >= MIN_PASSWORD_LENGTH ? "text-[#1B6E32]" : "text-[#76777D]"}`} aria-hidden="true" />
                    <span>{MIN_PASSWORD_LENGTH} characters or more</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#76777D]" aria-hidden="true" />
                    <span>Choose a password different from your current one</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#76777D]" aria-hidden="true" />
                    <span>Spaces are allowed; no special-character formula is required</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="text-sm font-medium text-[#191C1E]">Confirm new password</label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmation ? "text" : "password"}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    aria-describedby="password-match-status"
                    aria-invalid={confirmationStarted && !passwordsMatch}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="w-full rounded-lg border border-[#8A8D93] bg-white px-3 py-2.5 pr-12 text-sm text-[#191C1E] caret-[#191C1E] outline-none placeholder:text-[#76777D] focus:border-[#2170E4] focus:ring-2 focus:ring-[#2170E4]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmation((visible) => !visible)}
                    aria-label={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}
                    aria-pressed={showConfirmation}
                    title={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#45464D] hover:text-[#191C1E] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2170E4]"
                  >
                    {showConfirmation ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <div id="password-match-status" aria-live="polite" className="min-h-5 text-xs">
                  {confirmationStarted && (
                    <span className={`flex items-center gap-1.5 ${passwordsMatch ? "text-[#1B6E32]" : "text-[#BA1A1A]"}`}>
                      {passwordsMatch ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                      {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg bg-[#111827] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Updating password..." : "Update password"}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F7F9]" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
