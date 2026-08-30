// Regression: header stripping vs role-title signal (C-001 follow-up).
//
// Codex's 2026-07-17 hardening strips job-board header lines so employer
// names never surface as nonsense keyword gaps ("add Northside"). Claude's
// probe showed the fix overreached: the ROLE TITLE was stripped too, so a
// resume that never mentions the target profession scored with no title gap
// flagged. The synthesis: employer stays excluded, title is re-injected as a
// scored term. Both properties are pinned here.
import { analyzeResumeAgainstJob } from "./scan-analysis";

const JD = [
  "Registered Nurse",
  "Northside Regional Medical Center",
  "",
  "Provide direct patient care on a 40-bed medical surgical unit.",
  "Administer medications and maintain clinical documentation in Epic.",
  "Requires BSN, active RN license, and BLS certification.",
].join("\n");

// Deliberately never says "nurse": strong adjacent evidence, missing title.
const RESUME_WITHOUT_TITLE = [
  "ALEX EXAMPLE",
  "City, ST | (317) 555-0100 | alex@example.com",
  "PROFESSIONAL EXPERIENCE",
  "Staff Clinician | Example Hospital | 2019 - Present",
  "- Provided direct patient care for 18 patients per shift.",
  "- Administered medications with clinical documentation in Epic.",
  "EDUCATION",
  "Bachelor of Science in Nursing (BSN)",
  "CERTIFICATIONS",
  "RN license | BLS certification",
].join("\n");

describe("job header stripping keeps the title signal", () => {
  const analysis = analyzeResumeAgainstJob(RESUME_WITHOUT_TITLE, JD);
  const allTerms = [
    ...analysis.matchedKeywords,
    ...analysis.missingKeywordDetails.map((d) => d.term),
  ];

  it("never surfaces the employer name as a keyword", () => {
    expect(allTerms.some((t) => t.toLowerCase().includes("northside"))).toBe(false);
  });

  it("keeps a repeated employer sentence out of scan terms", () => {
    const repeatedEmployer = [
      "Acme Logistics",
      "Senior Operations Manager",
      "Acme Logistics is hiring a Senior Operations Manager for its distribution site.",
      "Improve warehouse throughput using WMS and lean operations.",
    ].join("\n");

    const result = analyzeResumeAgainstJob(
      "Operations Manager\nLed warehouse throughput improvements.",
      repeatedEmployer
    );
    const terms = [
      ...result.matchedKeywords,
      ...result.missingTermDetailsAll.map((item) => item.term),
    ];

    expect(terms).toContain("senior operations manager");
    expect(terms.join(" ")).not.toMatch(/\bacme\b/i);
  });

  it("scores the role title from the stripped header line", () => {
    expect(allTerms).toContain("registered nurse");
  });

  it("flags the missing title for a resume that lacks the profession entirely", () => {
    expect(analysis.missingKeywordDetails.map((d) => d.term)).toContain("registered nurse");
  });

  it("rewards a resume that does carry the title", () => {
    const withTitle = analyzeResumeAgainstJob(
      RESUME_WITHOUT_TITLE.replace("Staff Clinician", "Registered Nurse"),
      JD
    );
    expect(withTitle.matchedKeywords).toContain("registered nurse");
    expect(withTitle.score).toBeGreaterThan(analysis.score);
  });

  it("finds the title when the employer is the first header row", () => {
    const employerFirst = [
      "Northside Regional Medical Center",
      "Registered Nurse",
      "Provide direct patient care and administer medications in Epic.",
    ].join("\n");

    const result = analyzeResumeAgainstJob(RESUME_WITHOUT_TITLE, employerFirst);
    const terms = [
      ...result.matchedKeywords,
      ...result.missingKeywordDetails.map((item) => item.term),
    ];

    expect(terms).toContain("registered nurse");
    expect(terms.join(" ")).not.toMatch(/northside|regional medical center/i);
  });

  it("ignores job metadata before the actual title", () => {
    const metadataFirst = [
      "Remote - Full Time",
      "Registered Nurse",
      "Provide direct patient care and administer medications in Epic.",
    ].join("\n");

    const result = analyzeResumeAgainstJob(RESUME_WITHOUT_TITLE, metadataFirst);
    const terms = [
      ...result.matchedKeywords,
      ...result.missingKeywordDetails.map((item) => item.term),
    ];

    expect(terms).toContain("registered nurse");
    expect(terms.join(" ")).not.toMatch(/remote full time/i);
  });

  it("keeps a legitimate title containing an employer-like word", () => {
    const titleWithEmployerWord = [
      "Northstar Logistics Operations Manager",
      "Example Logistics LLC",
      "Lead fulfillment operations and improve site throughput.",
    ].join("\n");
    const result = analyzeResumeAgainstJob("EXPERIENCE\nLed fulfillment operations.", titleWithEmployerWord);
    const terms = [
      ...result.matchedKeywords,
      ...result.missingKeywordDetails.map((item) => item.term),
    ];

    expect(terms).toContain("northstar logistics operations manager");
    expect(terms.join(" ")).not.toMatch(/example logistics/i);
  });
});
