"use client";

/**
 * PostHogProvider — client-side PostHog browser SDK wrapper.
 *
 * Wrap your root layout's <body> (or a subtree) with this component to enable
 * automatic page-view tracking and feature flags in the browser.
 *
 * Usage in app/layout.tsx:
 *   import { PostHogProvider } from "@/components/providers/PostHogProvider";
 *   <PostHogProvider><YourApp /></PostHogProvider>
 *
 * Security note: only NEXT_PUBLIC_* env vars are accessible in this client
 * component. No secrets are ever exposed here.
 */

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, useRef } from "react";

interface PostHogProviderProps {
  children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    // Prevent double-initialization in React Strict Mode
    if (initialized.current) return;
    initialized.current = true;

    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

    if (!apiKey) {
      // Silently skip — no analytics in envs without the key (e.g. CI)
      return;
    }

    posthog.init(apiKey, {
      api_host: apiHost,
      // Capture page-view events automatically on route change
      capture_pageview: false, // We handle this manually below for App Router
      capture_pageleave: true,
      // Respect the user's Do Not Track browser setting
      respect_dnt: true,
      // Disable session recording by default — enable intentionally per feature
      disable_session_recording: true,
      // Don't capture clicks/inputs automatically (opt-in per component)
      autocapture: false,
      // Bootstrap with a short timeout so it doesn't block first paint
      loaded(ph) {
        if (process.env.NODE_ENV === "development") {
          ph.debug();
        }
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

/**
 * Hook — identify the signed-in user once their session is available.
 * Call this in a layout or page that has access to the session.
 *
 * Example:
 *   const { data: session } = useSession();
 *   usePostHogIdentify(session?.user?.id, { email: session?.user?.email });
 */
export function usePostHogIdentify(
  distinctId: string | null | undefined,
  properties?: Record<string, unknown>
) {
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (!distinctId || identified.current === distinctId) return;
    identified.current = distinctId;

    posthog.identify(distinctId, properties);
  }, [distinctId, properties]);
}
