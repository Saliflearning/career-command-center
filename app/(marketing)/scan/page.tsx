import type { Metadata } from "next";
import PublicResumeScan from "@/components/marketing/PublicResumeScan";

export const metadata: Metadata = {
  title: "Free Resume Scan | Career Command Center",
  description:
    "Compare your resume with a job description before you sign up. Review explainable match, evidence, and formatting estimates without saving your documents.",
};

export default function FreeResumeScanPage() {
  return <PublicResumeScan />;
}
