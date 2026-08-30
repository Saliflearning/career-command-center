import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/(auth)/signup/page.tsx"),
  "utf8"
);

describe("signup password UX contract", () => {
  it("uses the shared password policy and blocks invalid submission", () => {
    expect(source).toContain('from "@/lib/auth/password-policy"');
    expect(source).toContain("minLength={MIN_PASSWORD_LENGTH}");
    expect(source).toContain("!passwordAssessment.valid");
    expect(source).toContain("no special-character formula");
  });

  it("provides an accessible show and hide control", () => {
    expect(source).toContain('aria-label={showPassword ? "Hide password" : "Show password"}');
    expect(source).toContain('type={showPassword ? "text" : "password"}');
    expect(source).toContain('aria-label={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}');
    expect(source).toContain('type={showConfirmation ? "text" : "password"}');
    expect(source).toContain("<EyeOff");
    expect(source).toContain("<Eye");
  });

  it("requires confirmation and reports live match state", () => {
    expect(source).toContain('id="confirm-password"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Passwords match");
    expect(source).toContain("Passwords do not match");
    expect(source).toContain("passwordsMatch");
    expect(source).toContain("!canSubmit");
  });

  it("shows the same live length guidance as password reset", () => {
    expect(source).toContain("passwordAssessment.characterCount");
    expect(source).toContain("characters; ${MIN_PASSWORD_LENGTH} minimum");
  });

  it("keeps password text, caret, border, and background visibly distinct", () => {
    expect(source).toContain("bg-white");
    expect(source).toContain("text-[#191C1E]");
    expect(source).toContain("caret-[#191C1E]");
    expect(source).toContain('border: "1.5px solid #C6C6CD"');
  });
});
