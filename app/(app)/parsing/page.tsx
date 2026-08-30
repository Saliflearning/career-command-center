import { redirect } from "next/navigation";

/**
 * Parsing is handled internally by the pipeline — the user never lands here.
 * The /generating page shows parsing progress as Phase 1.
 * Redirect to dashboard if someone navigates here directly.
 */
export default function ParsingPage() {
  redirect("/dashboard");
}
