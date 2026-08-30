"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Target form is now integrated into the workspace left panel.
 * Redirect to workspace if a resume ID is provided, otherwise dashboard.
 */
function TargetRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");

  useEffect(() => {
    if (resumeId) {
      router.replace(`/workspace/${resumeId}`);
    } else {
      router.replace("/dashboard");
    }
  }, [resumeId, router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-on-surface-variant" />
    </div>
  );
}

export default function TargetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-on-surface-variant" />
        </div>
      }
    >
      <TargetRedirect />
    </Suspense>
  );
}
