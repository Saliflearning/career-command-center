import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account | Career Command Center",
  description: "Sign in or create your Career Command Center account.",
};

/**
 * Minimal layout for auth pages (sign in / sign up).
 * Intentionally omits the main application sidebar and top navigation bar
 * so the split-panel auth UI is the sole focus of the viewport.
 *
 * This is a route-group layout — it is nested inside the root app/layout.tsx
 * which already provides <html> and <body>. No need to repeat them here.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
