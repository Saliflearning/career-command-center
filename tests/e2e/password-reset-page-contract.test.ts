import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();

describe("reset password page contract", () => {
  const source = readFileSync(
    path.join(root, "app", "(auth)", "reset-password", "page.tsx"),
    "utf8"
  );

  it("offers visible password controls and live confirmation feedback", () => {
    expect(source).toContain("Show new password");
    expect(source).toContain("Hide new password");
    expect(source).toContain("Show password confirmation");
    expect(source).toContain("Hide password confirmation");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Passwords match");
    expect(source).toContain("Passwords do not match");
  });

  it("renders the shared password rules and blocks an invalid submission", () => {
    expect(source).toContain("MIN_PASSWORD_LENGTH");
    expect(source).toContain("evaluatePassword");
    expect(source).toContain("passwordAssessment.valid");
    expect(source).toContain("Choose a password different from your current one");
  });

  it("uses explicit readable input colors instead of browser defaults", () => {
    expect(source).toContain("bg-white");
    expect(source).toContain("text-[#191C1E]");
    expect(source).toContain("caret-[#191C1E]");
  });
});
