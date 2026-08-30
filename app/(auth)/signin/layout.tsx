import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign In | Career Command Center",
  description: "Sign in to your Career Command Center account.",
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
