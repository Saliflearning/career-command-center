import { shouldEnableDevelopmentAuth } from "./development-auth";

describe("shouldEnableDevelopmentAuth", () => {
  it.each([undefined, "true", "false"])(
    "never enables development auth in production when flag is %s",
    (flag) => {
      expect(shouldEnableDevelopmentAuth("production", flag)).toBe(false);
    }
  );

  it("defaults development auth on for local development", () => {
    expect(shouldEnableDevelopmentAuth("development", undefined)).toBe(true);
  });

  it("honors an explicit local-development opt-out", () => {
    expect(shouldEnableDevelopmentAuth("development", "false")).toBe(false);
  });

  it("requires an explicit opt-in outside development and production", () => {
    expect(shouldEnableDevelopmentAuth("test", undefined)).toBe(false);
    expect(shouldEnableDevelopmentAuth("test", "true")).toBe(true);
  });
});
