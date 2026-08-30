import {
  buildDeterministicIntakeBlocks,
  prepareExtractedResumeText,
} from "./index";

jest.mock("@/lib/ai/router", () => ({
  route: jest.fn(),
}));

describe("intake deterministic sectionizer", () => {
  it("restores section boundaries from dense PDF text", () => {
    const denseText = [
      "CANDIDATE NAME Columbus, OH | (415) 555-0192 | candidate@example.com | linkedin.com/in/candidate-name",
      "PROFESSIONAL SUMMARY Operations and team leadership professional with more than 5 years of progressive experience.",
      "CORE SKILLS Operations Leadership | Team Supervision | Workflow Coordination | KPI Tracking | Data Analysis",
      "PROFESSIONAL EXPERIENCE NORTHSTAR Operations & Fulfillment Leadership Experience | Columbus, OH | 2018 - 2023",
      "Operations Leadership Experience  Supported daily operations within high-volume fulfillment center environments",
      " Led and supported teams of 75+ associates across inbound operations and problem-solving operational areas",
      "Blue Ridge Technology | Associate Cloud Engineer Columbus, OH | Feb 2024 - Nov 2025",
      " Supported operational documentation, workflow tracking, and cross-functional coordination activities",
      "EDUCATION Master of Science, Information Systems | Lakeside State University | June 2025",
      "Bachelor of Science, Business Analytics | Lakeside State University | 2020",
      "CERTIFICATIONS AWS Certified Solutions Architect - Associate (2025) | Microsoft Azure Fundamentals AZ-900 (2024)",
    ].join(" ");

    const prepared = prepareExtractedResumeText(denseText);
    const blocks = buildDeterministicIntakeBlocks(prepared);

    expect(blocks).not.toBeNull();
    expect(blocks?.header).toContain("CANDIDATE NAME");
    expect(blocks?.skills).toContain("Operations Leadership");
    expect(blocks?.experience).toContain("NORTHSTAR");
    expect(blocks?.experience).toContain("2018 - 2023");
    expect(blocks?.experience).toContain("Feb 2024 - Nov 2025");
    expect(blocks?.education).toContain("Master of Science");
    expect(blocks?.education).toContain("AWS Certified Solutions Architect");
  });

  it("falls back to LLM intake when no experience heading exists", () => {
    const prepared = prepareExtractedResumeText(
      "Candidate Name email@example.com Projects Built a portfolio site Skills React TypeScript"
    );

    expect(buildDeterministicIntakeBlocks(prepared)).toBeNull();
  });
});
