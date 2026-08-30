"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";
import { AuthWorkspacePreview } from "@/components/auth/AuthWorkspacePreview";
import {
  MIN_PASSWORD_LENGTH,
  evaluatePassword,
  passwordPolicyMessage,
} from "@/lib/auth/password-policy";
import {
  getSignInProviderAvailability,
  type SignInProviderAvailability,
} from "@/lib/auth/sign-in-providers";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="#0077B5">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke={light ? "#fff" : "#0058BE"} strokeWidth="4" />
      <path className="opacity-75" fill={light ? "#fff" : "#0058BE"} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SignUpForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState<"google" | "linkedin" | "register" | null>(null);
  const [success, setSuccess] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerAvailability, setProviderAvailability] =
    useState<SignInProviderAvailability>(() =>
      getSignInProviderAvailability(null)
    );
  const hasOAuthProvider =
    providerAvailability.google || providerAvailability.linkedin;
  const passwordAssessment = evaluatePassword(password);
  const confirmationStarted = confirmation.length > 0;
  const passwordsMatch = confirmationStarted && password === confirmation;
  const canSubmit = passwordAssessment.valid && passwordsMatch;

  useEffect(() => {
    let cancelled = false;

    getProviders()
      .then((providers) => {
        if (!cancelled) {
          setProviderAvailability(getSignInProviderAvailability(providers));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderAvailability(getSignInProviderAvailability(null));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleOAuth(provider: "google" | "linkedin") {
    setError(null);
    setIsLoading(provider);
    try {
      await signIn(provider, { callbackUrl });
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(null);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!passwordAssessment.valid) {
      setError(
        passwordPolicyMessage(passwordAssessment.reason) ??
          "Choose a valid password."
      );
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading("register");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create account. Please try again.");
        setIsLoading(null);
        return;
      }
      if (data.verificationRequired) {
        setVerificationRequired(true);
        setVerificationSent(Boolean(data.verificationSent));
        setSuccess(true);
        setIsLoading(null);
        return;
      }
      // Account created — sign in immediately
      const result = await signIn("email-password", {
        email: email.trim().toLowerCase(),
        password,
        callbackUrl,
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setSuccess(true); // account exists, just need to sign in
        setIsLoading(null);
        return;
      }
      window.location.href = result?.url ?? callbackUrl;
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12" style={{ backgroundColor: "#0F1729" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#2170E4" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 9h12M9 3l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">Career Command Center</span>
        </div>

        <div className="space-y-10">
          <AuthWorkspacePreview />

          {/* Product commitment, not a testimonial. Human review remains required. */}
          <div className="space-y-4">
            <p className="text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
              Structure your experience, compare it with a target role, and
              review each generated claim against the evidence you supplied.
            </p>
            <p className="text-xs uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>
              Evidence in. Reviewable drafts out.
            </p>
          </div>
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>© {new Date().getFullYear()} Career Command Center</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#191C1E" }}>Create your account</h1>
            <p className="text-sm" style={{ color: "#45464D" }}>Build and review role-specific resume drafts.</p>
          </div>

          {success ? (
            <div className="rounded-xl p-5 text-center space-y-3" style={{ backgroundColor: "#F0F6FF", border: "1px solid #C3D9FF" }}>
              <p className="font-medium" style={{ color: "#0058BE" }}>
                {verificationRequired
                  ? verificationSent
                    ? "Check your inbox"
                    : "Email verification pending"
                  : "Account created"}
              </p>
              <p className="text-sm" style={{ color: "#45464D" }}>
                {verificationRequired
                  ? verificationSent
                    ? `We sent a verification link to ${email.trim().toLowerCase()}. Verify your email, then sign in.`
                    : "Your account was created, but the verification email was not delivered. Request a fresh link before signing in."
                  : "Your account is ready. Sign in to continue."}
              </p>
              {verificationRequired && !verificationSent ? (
                <Link
                  href={`/verify-email?email=${encodeURIComponent(
                    email.trim().toLowerCase()
                  )}`}
                  className="inline-block text-sm font-medium underline"
                  style={{ color: "#0058BE" }}
                >
                  Send a new verification link
                </Link>
              ) : (
                <Link href="/signin" className="inline-block text-sm underline font-medium" style={{ color: "#0058BE" }}>Go to sign in</Link>
              )}
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#FFF0F0", color: "#BA1A1A", border: "1px solid #FFBABA" }}>
                  {error}
                </div>
              )}

              {/* OAuth */}
              <div className="space-y-3">
                {providerAvailability.google && (
                  <button onClick={() => handleOAuth("google")} disabled={isLoading !== null}
                    className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#fff", border: "1.5px solid #C6C6CD", color: "#191C1E" }}>
                    {isLoading === "google" ? <Spinner /> : <GoogleIcon />}
                    Continue with Google
                  </button>
                )}
                {providerAvailability.linkedin && (
                  <button onClick={() => handleOAuth("linkedin")} disabled={isLoading !== null}
                    className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#0077B5", border: "1.5px solid #0077B5", color: "#fff" }}>
                    {isLoading === "linkedin" ? <Spinner light /> : <LinkedInIcon />}
                    Continue with LinkedIn
                  </button>
                )}
              </div>

              {hasOAuthProvider && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ backgroundColor: "#E6E8EA" }} />
                  <span className="text-xs font-medium" style={{ color: "#76777D" }}>OR</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "#E6E8EA" }} />
                </div>
              )}

              {/* Email + password registration */}
              <form onSubmit={handleRegister} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="name" className="block text-sm font-medium" style={{ color: "#191C1E" }}>Full name</label>
                  <input
                    id="name" type="text" autoComplete="name"
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Jordan Smith"
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                    style={{ border: "1.5px solid #C6C6CD", color: "#191C1E", backgroundColor: "#fff" }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-sm font-medium" style={{ color: "#191C1E" }}>Email address</label>
                  <input
                    id="email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                    style={{ border: "1.5px solid #C6C6CD", color: "#191C1E", backgroundColor: "#fff" }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-sm font-medium" style={{ color: "#191C1E" }}>Password</label>
                  <div className="relative">
                    <input
                      id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH}
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      aria-describedby="signup-password-rules"
                      aria-invalid={password.length > 0 && !passwordAssessment.valid}
                      placeholder="Use a long passphrase"
                      className="w-full rounded-lg bg-white px-3.5 py-2.5 pr-12 text-sm text-[#191C1E] caret-[#191C1E] transition placeholder:text-[#76777D] focus:outline-none focus:ring-2"
                      style={{ border: "1.5px solid #C6C6CD" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      title={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#45464D] hover:text-[#191C1E] focus:outline-none focus:ring-2 focus:ring-inset"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <p id="signup-password-rules" className="text-xs leading-5" style={{ color: password.length > 0 && !passwordAssessment.valid ? "#BA1A1A" : "#5F6368" }}>
                    {passwordAssessment.reason === "too-long"
                      ? "Password is too long. Use a shorter passphrase."
                      : `${passwordAssessment.characterCount} characters; ${MIN_PASSWORD_LENGTH} minimum. Spaces are allowed; no special-character formula.`}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="block text-sm font-medium" style={{ color: "#191C1E" }}>Confirm password</label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showConfirmation ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      aria-describedby="signup-password-match-status"
                      aria-invalid={confirmationStarted && !passwordsMatch}
                      className="w-full rounded-lg bg-white px-3.5 py-2.5 pr-12 text-sm text-[#191C1E] caret-[#191C1E] transition placeholder:text-[#76777D] focus:outline-none focus:ring-2"
                      style={{ border: "1.5px solid #C6C6CD" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmation((visible) => !visible)}
                      aria-label={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}
                      aria-pressed={showConfirmation}
                      title={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#45464D] hover:text-[#191C1E] focus:outline-none focus:ring-2 focus:ring-inset"
                    >
                      {showConfirmation ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <div id="signup-password-match-status" aria-live="polite" className="min-h-5 text-xs">
                    {confirmationStarted && (
                      <span className={`flex items-center gap-1.5 ${passwordsMatch ? "text-[#1B6E32]" : "text-[#BA1A1A]"}`}>
                        {passwordsMatch ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                        {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="submit" disabled={isLoading !== null || !canSubmit}
                  className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "#0058BE", color: "#fff" }}
                >
                  {isLoading === "register" && <Spinner light />}
                  Create account
                </button>
              </form>

              <p className="text-xs text-center leading-relaxed" style={{ color: "#76777D" }}>
                By creating an account you agree to our{" "}
                <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>{" "}and{" "}
                <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
              </p>
            </>
          )}

          <p className="text-sm text-center" style={{ color: "#45464D" }}>
            Already have an account?{" "}
            <Link href="/signin" className="font-medium underline underline-offset-2" style={{ color: "#0058BE" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
