import { getSignInProviderAvailability } from "./sign-in-providers";

describe("getSignInProviderAvailability", () => {
  it("does not offer optional sign-in actions that the server did not advertise", () => {
    expect(
      getSignInProviderAvailability({
        "email-password": { id: "email-password" },
        google: { id: "google" },
      })
    ).toEqual({
      development: false,
      emailMagicLink: false,
      google: true,
      linkedin: false,
    });
  });

  it("recognizes every supported optional provider by its server id", () => {
    expect(
      getSignInProviderAvailability({
        "dev-login": { id: "dev-login" },
        email: { id: "email" },
        google: { id: "google" },
        linkedin: { id: "linkedin" },
      })
    ).toEqual({
      development: true,
      emailMagicLink: true,
      google: true,
      linkedin: true,
    });
  });

  it("fails closed while provider discovery is unavailable", () => {
    expect(getSignInProviderAvailability(null)).toEqual({
      development: false,
      emailMagicLink: false,
      google: false,
      linkedin: false,
    });
  });
});
