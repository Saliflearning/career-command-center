import { shouldAllowVerifiedEmailAccountLinking } from "./oauth-account-linking";

describe("verified email OAuth account linking", () => {
  it("allows Google to link an existing account by its verified email", () => {
    expect(shouldAllowVerifiedEmailAccountLinking("google")).toBe(true);
  });

  it.each(["linkedin", "email", "credentials", "unknown"])(
    "does not allow automatic linking for %s",
    (providerId) => {
      expect(shouldAllowVerifiedEmailAccountLinking(providerId)).toBe(false);
    }
  );
});
