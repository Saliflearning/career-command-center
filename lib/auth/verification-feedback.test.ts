import { getVerificationFeedback } from "./verification-feedback";

describe("getVerificationFeedback", () => {
  it("maps successful verification to a sign-in-ready notice", () => {
    expect(getVerificationFeedback("success")).toEqual({
      tone: "success",
      title: "Email verified",
      message: "Your account is ready. Sign in to continue.",
    });
  });

  it.each(["expired", "invalid", "error"])(
    "maps %s to bounded recovery guidance",
    (status) => {
      const feedback = getVerificationFeedback(status);

      expect(feedback?.tone).toBe("error");
      expect(feedback?.title).toBeTruthy();
      expect(feedback?.message).toBeTruthy();
    }
  );

  it("ignores unknown query values", () => {
    expect(getVerificationFeedback("unexpected-provider-text")).toBeNull();
    expect(getVerificationFeedback(null)).toBeNull();
  });
});
