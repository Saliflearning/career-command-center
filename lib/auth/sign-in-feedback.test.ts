import { getSignInErrorFeedback } from "./sign-in-feedback";

describe("getSignInErrorFeedback", () => {
  it("explains an account-linking conflict without exposing provider diagnostics", () => {
    expect(getSignInErrorFeedback("OAuthAccountNotLinked")).toEqual({
      title: "Use your existing sign-in method",
      message:
        "This email already belongs to an account. Sign in with the method you used before, then try the provider again.",
    });
  });

  it("returns a safe retry message for other Auth.js callback failures", () => {
    expect(getSignInErrorFeedback("OAuthCallback")).toEqual({
      title: "Sign-in could not be completed",
      message: "Please try again. If the problem continues, use another sign-in method.",
    });
  });

  it("does not echo unknown query-string content", () => {
    const feedback = getSignInErrorFeedback("database password=secret");

    expect(feedback).toEqual({
      title: "Sign-in could not be completed",
      message: "Please try again. If the problem continues, use another sign-in method.",
    });
    expect(JSON.stringify(feedback)).not.toContain("secret");
  });

  it("returns null when no callback error is present", () => {
    expect(getSignInErrorFeedback(null)).toBeNull();
  });
});
