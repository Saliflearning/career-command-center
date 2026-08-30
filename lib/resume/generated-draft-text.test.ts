import { draftToComparableText } from "./generated-draft-text";
import { analyzeResumeAgainstJob } from "./scan-analysis";

describe("draftToComparableText", () => {
  it("preserves structured section labels and bullet boundaries for comparable scoring", () => {
    const text = draftToComparableText({
      candidateName: "Avery Test",
      candidateEmail: "avery@example.com",
      candidatePhone: "317-555-0199",
      candidateLinkedin: "linkedin.com/in/avery-test",
      candidateWebsite: null,
      candidateLocation: "Indianapolis, IN",
      targetRole: "Operations Excellence Manager",
      targetCompany: "Meridian Warehousing",
      summaryText: "Operations leader improving distribution performance.",
      workHistory: [
        {
          company: "Northstar Logistics",
          title: "Distribution Operations Manager",
          location: "Indianapolis, IN",
          startDate: "2021-01-01T00:00:00.000Z",
          endDate: null,
          current: true,
          bullets: [
            { content: "Led 35 associates across two warehouse shifts." },
            { content: "Reduced shipping defects by 18% through standard work." },
          ],
        },
      ],
      education: [
        {
          degree: "B.S. Supply Chain Management",
          institution: "State University",
          graduationDate: "2020-05-01T00:00:00.000Z",
          inProgress: false,
        },
      ],
      certifications: [{ name: "Lean Six Sigma Green Belt", issuingBody: "ASQ", issueDate: null }],
      skills: [
        { name: "Excel", category: "Tools" },
        { name: "WMS", category: "Tools" },
      ],
    });

    expect(text).toContain("CONTACT\nAvery Test");
    expect(text).toContain("SUMMARY\nOperations leader improving distribution performance.");
    expect(text).toContain("EXPERIENCE\nDistribution Operations Manager | Northstar Logistics");
    expect(text).toContain("- Led 35 associates across two warehouse shifts.");
    expect(text).toContain("- Reduced shipping defects by 18% through standard work.");
    expect(text).toContain("EDUCATION\nB.S. Supply Chain Management | State University");
    expect(text).toContain("CERTIFICATIONS\nLean Six Sigma Green Belt | ASQ");
    expect(text).toContain("SKILLS\nTools: Excel, WMS");
    expect(text.split("\n")).toEqual(expect.arrayContaining(["EXPERIENCE", "EDUCATION", "CERTIFICATIONS", "SKILLS"]));

    const analysis = analyzeResumeAgainstJob(
      text,
      "Lead warehouse operations using WMS, Excel, standard work, and measurable quality improvements."
    );
    // The projection must preserve ATS-recognizable structure: it must score
    // strictly better than the same content flattened to one unlabelled line
    // (the regression this module exists to prevent).
    const flattened = analyzeResumeAgainstJob(
      text.replace(/\n+/g, " "),
      "Lead warehouse operations using WMS, Excel, standard work, and measurable quality improvements."
    );
    expect(analysis.atsScore).toBeGreaterThanOrEqual(75);
    expect(analysis.atsScore).toBeGreaterThan(flattened.atsScore);
    expect(analysis.evidenceScore).toBeGreaterThanOrEqual(85);
  });

  it("omits empty sections instead of adding scanner-friendly labels without content", () => {
    const text = draftToComparableText({
      candidateName: "Avery Test",
      candidateEmail: null,
      candidatePhone: null,
      candidateLinkedin: null,
      candidateWebsite: null,
      candidateLocation: null,
      targetRole: "Operations Manager",
      targetCompany: null,
      summaryText: null,
      workHistory: [],
      education: [],
      certifications: [],
      skills: [],
    });

    expect(text).toBe("CONTACT\nAvery Test\n\nTARGET\nOperations Manager");
    expect(text).not.toMatch(/SUMMARY|EXPERIENCE|EDUCATION|CERTIFICATIONS|SKILLS/);
  });
});
