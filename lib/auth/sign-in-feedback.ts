export interface SignInErrorFeedback {
  title: string;
  message: string;
}

const ACCOUNT_LINKING_FEEDBACK: SignInErrorFeedback = {
  title: "Use your existing sign-in method",
  message:
    "This email already belongs to an account. Sign in with the method you used before, then try the provider again.",
};

const GENERIC_SIGN_IN_FEEDBACK: SignInErrorFeedback = {
  title: "Sign-in could not be completed",
  message: "Please try again. If the problem continues, use another sign-in method.",
};

export function getSignInErrorFeedback(
  errorCode: string | null
): SignInErrorFeedback | null {
  if (!errorCode) return null;
  if (errorCode === "OAuthAccountNotLinked") return ACCOUNT_LINKING_FEEDBACK;
  return GENERIC_SIGN_IN_FEEDBACK;
}
