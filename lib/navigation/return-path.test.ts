import { safeInternalReturnPath, withReturnTo } from "./return-path";

describe("return path helpers", () => {
  it("preserves an internal workspace return path", () => {
    expect(
      safeInternalReturnPath("/workspace/resume-123?from=profile")
    ).toBe("/workspace/resume-123?from=profile");
  });

  it("preserves an upload preview return path with its resume id", () => {
    expect(
      safeInternalReturnPath("/upload?resumeId=resume-123")
    ).toBe("/upload?resumeId=resume-123");
  });

  it("preserves a saved-resume query through the Career Profile handoff", () => {
    const href = withReturnTo(
      "/memory",
      "/upload?resumeId=cmrmg0uyy0001ub3zbu1u7syn"
    );
    const encodedReturnTo = new URL(href, "https://career-command.local")
      .searchParams.get("returnTo");

    expect(href).toBe(
      "/memory?returnTo=%2Fupload%3FresumeId%3Dcmrmg0uyy0001ub3zbu1u7syn"
    );
    expect(safeInternalReturnPath(encodedReturnTo)).toBe(
      "/upload?resumeId=cmrmg0uyy0001ub3zbu1u7syn"
    );
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "javascript:alert(1)",
    "\\\\evil.example\\steal",
    "https://attacker.example/resume",
    "//attacker.example/resume",
    "/\\attacker.example/resume",
  ])("rejects an unsafe return path: %s", (value) => {
    expect(safeInternalReturnPath(value, "/dashboard")).toBe("/dashboard");
  });

  it("encodes a return path onto a destination", () => {
    expect(
      withReturnTo("/memory", "/upload?resumeId=resume-123")
    ).toBe("/memory?returnTo=%2Fupload%3FresumeId%3Dresume-123");
  });
});
