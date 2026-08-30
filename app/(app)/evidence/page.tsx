import { redirect } from "next/navigation";

/**
 * Evidence review is handled within the workspace — the user never lands here
 * as a standalone page. Redirect to dashboard if someone navigates directly.
 */
export default function EvidencePage() {
  redirect("/dashboard");
}
