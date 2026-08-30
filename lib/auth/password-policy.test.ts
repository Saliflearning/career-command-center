import {
  MIN_PASSWORD_LENGTH,
  evaluatePassword,
} from "./password-policy";

describe("password policy", () => {
  it("requires a long passphrase for password-only authentication", () => {
    expect(evaluatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatchObject({
      valid: false,
      reason: "too-short",
    });
    expect(evaluatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toMatchObject({
      valid: true,
      reason: null,
    });
  });

  it("allows spaces without imposing composition rules", () => {
    expect(evaluatePassword("a private phrase only")).toMatchObject({
      valid: true,
      reason: null,
    });
  });

  it("enforces bcrypt's byte boundary for multibyte passwords", () => {
    expect(evaluatePassword("e".repeat(72))).toMatchObject({
      valid: true,
      reason: null,
    });
    expect(evaluatePassword("\u00e9".repeat(37))).toMatchObject({
      valid: false,
      reason: "too-long",
    });
  });
});
