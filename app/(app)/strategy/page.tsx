import { redirect } from "next/navigation";

/**
 * Strategy is handled internally by the pipeline — the user never lands here.
 * The /generating page shows strategy progress as Phase 2.
 * Redirect to dashboard if someone navigates here directly.
 */
export default function StrategyPage() {
  redirect("/dashboard");
}
