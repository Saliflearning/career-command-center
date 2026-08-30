import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Verify Email | Career Command Center",
  description: "Verify the email address for your Career Command Center account.",
};

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return children;
}
