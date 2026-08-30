export interface VerificationFeedback {
  tone: "success" | "error";
  title: string;
  message: string;
}

const FEEDBACK: Record<string, VerificationFeedback> = {
  success: {
    tone: "success",
    title: "Email verified",
    message: "Your account is ready. Sign in to continue.",
  },
  expired: {
    tone: "error",
    title: "Verification link expired",
    message: "Request a new link before signing in with a password.",
  },
  invalid: {
    tone: "error",
    title: "Verification link is invalid",
    message: "The link may already have been used. Request a new one if needed.",
  },
  error: {
    tone: "error",
    title: "Verification could not be completed",
    message: "Please try the link again or request a new one.",
  },
};

export function getVerificationFeedback(
  status: string | null
): VerificationFeedback | null {
  if (!status) return null;
  return FEEDBACK[status] ?? null;
}
