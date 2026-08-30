import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Create Account | Career Command Center",
  description: "Create your Career Command Center account.",
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
