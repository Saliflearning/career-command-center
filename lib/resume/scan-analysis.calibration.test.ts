import { analyzeResumeAgainstJob, extractJobTermDetails } from "./scan-analysis";

const ORACLE_HCM_JD = [
  "Company logo for, Example County.",
  "Example County",
  "IT Analyst",
  "Example County, VA - 1 week ago - 25 people clicked apply",
  "Responses managed off LinkedIn",
  "Hybrid",
  "Full-time",
  "Apply",
  "Saved",
  "BETA - Is this information helpful?",
  "About the job",
  "This Position Will",
  "Support the Human Capital Management team in administering Oracle Workforce Management.",
  "Conduct user account audits and support HR and Payroll teams with FOIA data requests.",
  "Develop and maintain complex reports.",
  "Create reports, perform testing, and provide tier 3 end-user support.",
  "Candidates Should",
  "Show strong SQL and Fast Formula building skills.",
  "Have experience providing operational support for cloud-based solutions.",
  "Document user guides, test cases, test scripts, process diagrams, and architectural diagrams.",
  "Minimum Requirements",
  "5 years of progressive experience in computer information systems.",
  "Preferences",
  "Bachelor's degree in information technology or a related field.",
  "3 years of hands-on experience supporting enterprise-grade IT solutions.",
  "3 years of experience writing custom reports using Oracle SQL.",
  "3 years of technical experience supporting HCM or HRIS systems such as Oracle, UKG, Workday, or ADP.",
  "Benefits",
  "Employee Assistance Program (EAP)",
  "01",
  "By submitting this application, I acknowledge the application instructions.",
  "NOTE: Only verified application answers will be credited.",
].join("\n");

const CLOUD_SUPPORT_RESUME = [
  "ALEX EXAMPLE",
  "City, ST | (317) 555-0100 | alex@example.com | linkedin.com/in/example",
  "PROFESSIONAL SUMMARY",
  "Application support and cloud operations professional supporting enterprise applications and users.",
  "TECHNICAL SKILLS",
  "ServiceNow | Jira | AWS | Azure | Windows | Microsoft Excel",
  "PROFESSIONAL EXPERIENCE",
  "Associate Cloud Engineer | Example Consulting | 2024 - 2025",
  "- Investigated deployment failures, permissions, logs, and application behavior across cloud environments.",
  "- Coordinated a device rollout for 400 users and tracked exceptions through resolution.",
  "Technical Support Associate | Example Services | 2022 - 2023",
  "- Provided Tier 2 enterprise support for 200 users through ServiceNow.",
  "- Documented troubleshooting, resolution steps, escalations, and service-level expectations.",
  "EDUCATION",
  "B.S. Informatics | Example University",
  "CERTIFICATIONS",
  "AWS Certified Cloud Practitioner",
].join("\n");

describe("resume match calibration", () => {
  it("keeps critical role requirements and excludes job-board or employer noise", () => {
    const terms = extractJobTermDetails(ORACLE_HCM_JD).map((item) => item.term.toLowerCase());
    const joined = terms.join(" | ");

    expect(joined).toMatch(/it analyst/);
    expect(joined).toMatch(/oracle/);
    expect(joined).toMatch(/sql/);
    expect(joined).toMatch(/hcm|human capital management/);
    expect(joined).toMatch(/report/);
    expect(joined).toMatch(/test/);
    expect(joined).not.toMatch(/example county|linkedin|beta|eap|note|clicked apply/);
    expect(terms).not.toContain("a field");
    expect(terms).not.toContain("supporting");
  });

  it("does not let strong formatting inflate a weak Oracle HCM match", () => {
    const result = analyzeResumeAgainstJob(CLOUD_SUPPORT_RESUME, ORACLE_HCM_JD);

    expect(result.atsScore).toBeGreaterThanOrEqual(85);
    expect(result.score).toBeLessThan(40);
    expect(result.fitLabel).toBe("Limited alignment");
    expect(result.requirementDetails.find((item) => item.term === "it analyst")).toMatchObject({
      importance: "critical",
      kind: "role",
      source: "IT Analyst",
    });
    expect(result.missingTermDetailsAll.map((item) => item.term).join(" ")).toMatch(
      /oracle|sql|hcm|human capital management/i
    );
  });

  it("keeps job alignment stable when only resume formatting changes", () => {
    const structured = analyzeResumeAgainstJob(CLOUD_SUPPORT_RESUME, ORACLE_HCM_JD);
    const flattened = analyzeResumeAgainstJob(CLOUD_SUPPORT_RESUME.replace(/\n+/g, " "), ORACLE_HCM_JD);

    expect(structured.atsScore).toBeGreaterThan(flattened.atsScore);
    expect(structured.score).toBe(flattened.score);
    expect(structured.keywordScore).toBe(flattened.keywordScore);
    expect(structured.signalScore).toBe(flattened.signalScore);
  });

  it("raises alignment only from source-backed requirement evidence", () => {
    const evidence = "- Supported Oracle HCM, wrote Oracle SQL reports, and executed test cases for payroll releases.";
    const base = analyzeResumeAgainstJob(CLOUD_SUPPORT_RESUME, ORACLE_HCM_JD);
    const proven = analyzeResumeAgainstJob(`${CLOUD_SUPPORT_RESUME}\n${evidence}`, ORACLE_HCM_JD);

    expect(proven.score).toBeGreaterThan(base.score + 10);
    expect(proven.requirementDetails.some((item) =>
      item.status === "matched" && item.evidence === evidence
    )).toBe(true);
  });

  it("makes the overall formula reproducible from job-derived components", () => {
    const result = analyzeResumeAgainstJob(CLOUD_SUPPORT_RESUME, ORACLE_HCM_JD);

    expect(result.score).toBe(Math.round(result.keywordScore * 0.4 + result.signalScore * 0.6));
  });
});
