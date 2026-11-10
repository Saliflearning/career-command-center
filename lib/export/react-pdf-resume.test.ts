import os from "os";
import path from "path";
import fs from "fs";
import { renderStructuredResumePdfReactPdf } from "./react-pdf-resume";
import type { StructuredResumeExportInput } from "./structured-resume-pdf";

const SAMPLE: StructuredResumeExportInput = {
  targetRole: "Operations & Cloud Delivery",
  targetCompany: null,
  roleType: "OPERATIONS",
  headline: "Operations & Cloud Delivery",
  candidate: {
    name: "Jordan Candidate",
    email: "jordan@example.com",
    phone: "555-0100",
    linkedin: "linkedin.com/in/jordan-candidate",
    location: "Indianapolis, IN",
    website: null,
  },
  summary:
    "Customer-focused operations and cloud professional with experience leading teams of 100+ associates, translating performance data into practical improvements, and supporting technical delivery across customer-facing environments.",
  jobs: [
    {
      id: "1",
      title: "Operations & Fulfillment Leadership",
      company: "Large E-commerce Company",
      location: "Indianapolis, IN",
      startDate: "2017-01-01",
      endDate: "2024-12-01",
      current: false,
      sortOrder: 0,
      bullets: [
        "Led teams of 100+ associates across inbound and problem-solving operations while maintaining safety, productivity, and delivery standards.",
        "Analyzed operational data across multiple workflows and supported improvements that reduced peak weekly defects by 41%.",
        "Built Python reporting workflows that surfaced operating trends and process gaps for site performance reviews.",
      ],
    },
    {
      id: "2",
      title: "Associate Cloud Engineer",
      company: "Technology Consultancy",
      location: "Indianapolis, IN",
      startDate: "2024-06-01",
      endDate: "2025-05-01",
      current: false,
      sortOrder: 1,
      bullets: [
        "Coordinated technical workflow tracking and documentation across teams to maintain consistent delivery and operational continuity.",
        "Validated reporting and issue tracking in Jira, Confluence, SharePoint, and Excel to support timely decisions.",
      ],
    },
  ],
  skills: [
    { name: "Team Leadership", category: "Leadership" },
    { name: "Stakeholder Communication", category: "Leadership" },
    { name: "KPI Tracking", category: "Operations" },
    { name: "Process Improvement", category: "Operations" },
    { name: "AWS", category: "Cloud & Tools" },
    { name: "Python", category: "Cloud & Tools" },
    { name: "Jira", category: "Cloud & Tools" },
    { name: "Excel", category: "Cloud & Tools" },
  ],
  education: [
    { degree: "Master of Science, Human-Computer Interaction", institution: "State University", graduationDate: "2026-05-01", inProgress: true },
    { degree: "Bachelor of Science, Informatics", institution: "State University", graduationDate: "2023-12-01", inProgress: false },
  ],
  certifications: [
    { name: "AWS Certified Solutions Architect - Associate", issuingBody: null, issueDate: null },
    { name: "Microsoft Azure Fundamentals", issuingBody: null, issueDate: null },
  ],
};

describe("renderStructuredResumePdfReactPdf", () => {
  it("renders a one-page premium PDF from canonical facts", async () => {
    const result = await renderStructuredResumePdfReactPdf(SAMPLE);
    expect(result.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.pageCount).toBe(1);
    expect(typeof result.density).toBe("string");
    expect(result.omittedContent).toEqual([]);

    // Dump a preview to the OS temp dir for visual inspection (harmless in CI).
    const out = path.join(os.tmpdir(), "react-pdf-resume.preview.pdf");
    fs.writeFileSync(out, result.pdf);
    // eslint-disable-next-line no-console
    console.log("preview written:", out, `(${result.pdf.length} bytes, density=${result.density})`);
  }, 30000);

  it("rejects content with no candidate name", async () => {
    await expect(
      renderStructuredResumePdfReactPdf({ ...SAMPLE, candidate: { ...SAMPLE.candidate, name: null } })
    ).rejects.toThrow(/candidate name/i);
  });
});
