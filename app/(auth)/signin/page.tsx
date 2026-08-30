"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { getProviders, signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthWorkspacePreview } from "@/components/auth/AuthWorkspacePreview";
import { shouldEnableDevelopmentAuth } from "@/lib/auth/development-auth";
import {
  getSignInProviderAvailability,
  type SignInProviderAvailability,
} from "@/lib/auth/sign-in-providers";
import { getSignInErrorFeedback } from "@/lib/auth/sign-in-feedback";
import { getVerificationFeedback } from "@/lib/auth/verification-feedback";
import { safeInternalReturnPath } from "@/lib/navigation/return-path";

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

function SignInForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const callbackUrl = safeInternalReturnPath(
    searchParams.get("callbackUrl"),
    "/dashboard"
  );
  const verificationFeedback = getVerificationFeedback(searchParams.get("verify"));
  const signInErrorFeedback = getSignInErrorFeedback(searchParams.get("error"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailMode, setEmailMode] = useState<"magic" | "password">("password");
  const [isLoading, setIsLoading] = useState<"google" | "linkedin" | "email" | "password" | "dev" | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerAvailability, setProviderAvailability] =
    useState<SignInProviderAvailability>(() =>
      getSignInProviderAvailability(null)
    );
  const devAuthEnabled =
    shouldEnableDevelopmentAuth(
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH
    ) && providerAvailability.development;
  const hasAlternateProvider =
    devAuthEnabled ||
    providerAvailability.google ||
    providerAvailability.linkedin;

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

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  if (status !== "unauthenticated") {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-6">
        <div className="flex items-center gap-3 text-sm font-medium text-[#45464D]" role="status">
          <Spinner />
          {status === "authenticated"
            ? "Opening your workspace..."
            : "Checking your session..."}
        </div>
      </main>
    );
  }

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

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading("email");
    try {
      const result = await signIn("email", { email, callbackUrl, redirect: false });
      if (result?.error) {
        setError("Could not send magic link. Please try again.");
      } else {
        setEmailSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(null);
    }
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading("password");
    try {
      const result = await signIn("email-password", {
        email: email.trim().toLowerCase(),
        password,
        callbackUrl,
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setError(
          "Email or password was not accepted. Check your credentials or verify your email."
        );
        setIsLoading(null);
        return;
      }
      window.location.href = result?.url ?? callbackUrl;
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(null);
    }
  }

  async function handleDevSignIn() {
    setError(null);
    setIsLoading("dev");
    try {
      const result = await signIn("dev-login", {
        email: "dev@local.test",
        callbackUrl,
        redirect: false,
      });
      if (result?.error) {
        setError("Could not start the local test session.");
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
      {/* Left panel — dark navy */}
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
              Build your career history once, tailor it to a role, and review
              the evidence behind each generated draft before export.
            </p>
            <p className="text-xs uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>
              Evidence in. Reviewable drafts out.
            </p>
          </div>
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>© {new Date().getFullYear()} Career Command Center</p>
      </div>

      {/* Right panel — white form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#191C1E" }}>Welcome back</h1>
            <p className="text-sm" style={{ color: "#45464D" }}>Sign in to your Career Command Center account.</p>
          </div>

          {emailSent ? (
            <div className="rounded-xl p-5 text-center space-y-2" style={{ backgroundColor: "#F0F6FF", border: "1px solid #C3D9FF" }}>
              <p className="font-medium" style={{ color: "#0058BE" }}>Check your inbox</p>
              <p className="text-sm" style={{ color: "#45464D" }}>We sent a magic link to <strong>{email}</strong>. Click it to sign in.</p>
            </div>
          ) : (
            <>
              {signInErrorFeedback && (
                <div
                  role="alert"
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{
                    backgroundColor: "#FFF0F0",
                    borderColor: "#FFBABA",
                    color: "#8C1D18",
                  }}
                >
                  <p className="font-semibold">{signInErrorFeedback.title}</p>
                  <p className="mt-1 leading-5">{signInErrorFeedback.message}</p>
                </div>
              )}
              {verificationFeedback && (
                <div
                  role={verificationFeedback.tone === "error" ? "alert" : "status"}
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={
                    verificationFeedback.tone === "success"
                      ? {
                          backgroundColor: "#EEF8F0",
                          borderColor: "#B9DEC1",
                          color: "#1B5E2B",
                        }
                      : {
                          backgroundColor: "#FFF7E8",
                          borderColor: "#F0CF8A",
                          color: "#6E4B00",
                        }
                  }
                >
                  <p className="font-semibold">{verificationFeedback.title}</p>
                  <p className="mt-1 leading-5">{verificationFeedback.message}</p>
                  {verificationFeedback.tone === "error" && (
                    <Link
                      href="/verify-email"
                      className="mt-2 inline-block font-semibold underline underline-offset-2"
                    >
                      Send a new verification link
                    </Link>
                  )}
                </div>
              )}
              {error && (
                <div role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#FFF0F0", color: "#BA1A1A", border: "1px solid #FFBABA" }}>
                  {error}
                </div>
              )}

              <div className="space-y-3">
                {devAuthEnabled && (
                  <button onClick={handleDevSignIn} disabled={isLoading !== null}
                    className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#0F1729", border: "1.5px solid #0F1729", color: "#fff" }}>
                    {isLoading === "dev" && <Spinner light />}
                    Continue as local test user
                  </button>
                )}
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

              {hasAlternateProvider && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ backgroundColor: "#E6E8EA" }} />
                  <span className="text-xs font-medium" style={{ color: "#76777D" }}>OR</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "#E6E8EA" }} />
                </div>
              )}

              {/* Tab switcher */}
              {providerAvailability.emailMagicLink && (
                <div className="flex rounded-lg p-1 gap-1" style={{ backgroundColor: "#F2F4F6" }}>
                  <button
                    type="button"
                    onClick={() => { setEmailMode("password"); setError(null); }}
                    className="flex-1 rounded-md py-1.5 text-xs font-medium transition-all"
                    style={{
                      backgroundColor: emailMode === "password" ? "#fff" : "transparent",
                      color: emailMode === "password" ? "#191C1E" : "#76777D",
                      boxShadow: emailMode === "password" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    Email + password
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmailMode("magic"); setError(null); }}
                    className="flex-1 rounded-md py-1.5 text-xs font-medium transition-all"
                    style={{
                      backgroundColor: emailMode === "magic" ? "#fff" : "transparent",
                      color: emailMode === "magic" ? "#191C1E" : "#76777D",
                      boxShadow: emailMode === "magic" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    Magic link
                  </button>
                </div>
              )}

              {emailMode === "password" || !providerAvailability.emailMagicLink ? (
                <form onSubmit={handlePasswordSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email-pw" className="block text-sm font-medium" style={{ color: "#191C1E" }}>Email address</label>
                    <input
                      id="email-pw" type="email" autoComplete="email" required
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-lg px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                      style={{ border: "1.5px solid #C6C6CD", color: "#191C1E", backgroundColor: "#fff" }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="password" className="block text-sm font-medium" style={{ color: "#191C1E" }}>Password</label>
                      <Link
                        href={`/forgot-password${
                          email ? `?email=${encodeURIComponent(email)}` : ""
                        }`}
                        className="text-xs font-medium underline underline-offset-2"
                        style={{ color: "#0058BE" }}
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <input
                      id="password" type="password" autoComplete="current-password" required
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                      style={{ border: "1.5px solid #C6C6CD", color: "#191C1E", backgroundColor: "#fff" }}
                    />
                  </div>
                  <button
                    type="submit" disabled={isLoading !== null}
                    className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#0058BE", color: "#fff" }}
                  >
                    {isLoading === "password" && <Spinner light />}
                    Sign in
                  </button>
                </form>
              ) : (
                <form onSubmit={handleEmailSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email-magic" className="block text-sm font-medium" style={{ color: "#191C1E" }}>Email address</label>
                    <input
                      id="email-magic" type="email" autoComplete="email" required
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-lg px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2"
                      style={{ border: "1.5px solid #C6C6CD", color: "#191C1E", backgroundColor: "#fff" }}
                    />
                  </div>
                  <button
                    type="submit" disabled={isLoading !== null}
                    className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#0058BE", color: "#fff" }}
                  >
                    {isLoading === "email" && <Spinner light />}
                    Send magic link
                  </button>
                </form>
              )}
            </>
          )}

          <p className="text-sm text-center" style={{ color: "#45464D" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium underline underline-offset-2" style={{ color: "#0058BE" }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
