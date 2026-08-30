import {
  extractCandidateNameFromSourceText,
  normalizeCandidateName,
  resolveCandidateName,
} from "./candidate-identity";

describe("candidate identity resolution", () => {
  it("rejects one-character and contact-like names", () => {
    expect(normalizeCandidateName(" S ")).toBeNull();
    expect(normalizeCandidateName("avery.morgan@example.com")).toBeNull();
  });

  it("extracts the candidate name from the uploaded resume header", () => {
    const source = [
      "AVERY MORGAN",
      "Columbus, OH | 202-555-0147 | avery.morgan@example.com | linkedin.com/in/avery-morgan",
      "PROFESSIONAL SUMMARY",
      "Operations leader with six years of experience.",
    ].join("\n");

    expect(extractCandidateNameFromSourceText(source)).toBe("AVERY MORGAN");
  });

  it("does not mistake a section heading or job title for a candidate name", () => {
    const source = [
      "PROFESSIONAL SUMMARY",
      "Production Planning Supervisor",
      "Experienced operations leader.",
    ].join("\n");

    expect(extractCandidateNameFromSourceText(source)).toBeNull();
  });

  it("prefers a valid parsed header, then source evidence, then the account name", () => {
    expect(resolveCandidateName({
      headerName: "Jordan Smith",
      sourceResumeText: "AVERY MORGAN\nPROFESSIONAL SUMMARY",
      accountName: "Account Owner",
    })).toBe("Jordan Smith");

    expect(resolveCandidateName({
      headerName: "S",
      sourceResumeText: "AVERY MORGAN\nPROFESSIONAL SUMMARY",
      accountName: "A",
    })).toBe("AVERY MORGAN");

    expect(resolveCandidateName({
      headerName: null,
      sourceResumeText: "",
      accountName: "Account Owner",
    })).toBe("Account Owner");
  });
});
