import { mergeParsedSkills, parseStructuredSkillsFallback } from "@/agents/normalizer";
import { sanitizeSummaryText } from "@/agents/summary-writer";
import { retainQuantifiedSourceEvidence } from "./evidence-retention";
import { reconcileExperienceEntries } from "./experience-reconciliation";
import { formatEducationDateUtc, formatMonthYearRangeUtc } from "./date-format";
import { inferJobDetails } from "./job-target-detection";
import {
  reconcileCertificationFacts,
  reconcileEducationFacts,
} from "./source-fact-reconciliation";
import { analyzeResumeAgainstJob } from "./scan-analysis";
import {
  productionPlanningJobDescription,
  productionPlanningSourceResume,
  unsupportedPlanningClaims,
} from "@/tests/fixtures/production-planning-supervisor.fixture";

describe("Production Planning Supervisor source fidelity regression", () => {
  it("detects the exact role and stylized employer from the pasted job-board header", () => {
    expect(inferJobDetails(productionPlanningJobDescription)).toEqual({
      role: "Production Planning Supervisor",
      company: "EXAMPLE MANUFACTURING GROUP",
    });
  });

  it("preserves source dates and keeps the internship evidence in the Northstar Logistics record", () => {
    const jobs = reconcileExperienceEntries([
      {
        company: "NORTHSTAR LOGISTICS",
        title: "Operations Leadership Experience",
        startDate: "2018-01",
        endDate: null,
        current: true,
        location: "Columbus, OH",
        employmentType: null,
        bullets: ["Led and supported teams of 75+ associates across inbound operations and problem-solving operational areas."],
      },
      {
        company: "NORTHSTAR LOGISTICS",
        title: "Process Improvement Internship",
        startDate: "2018-01",
        endDate: "2018-12",
        current: false,
        location: "Columbus, OH",
        employmentType: "Internship",
        bullets: [
          "Analyzed operational data across multiple workflows and supported initiatives that reduced peak weekly defects by 28%.",
          "Built Python-based reporting and data analysis workflows to improve visibility into operational trends and process inefficiencies.",
        ],
      },
      {
        company: "Blue Ridge Technology",
        title: "Associate Cloud Engineer",
        startDate: "2024-02",
        endDate: "2025-11",
        current: false,
        location: "Columbus, OH",
        employmentType: null,
        bullets: ["Supported operational documentation and workflow tracking."],
      },
    ], productionPlanningSourceResume);

    expect(jobs).toHaveLength(2);
    expect(formatMonthYearRangeUtc(jobs[0].startDate, jobs[0].endDate ?? null, jobs[0].current)).toBe("2018 - 2023");
    expect(formatMonthYearRangeUtc(jobs[1].startDate, jobs[1].endDate ?? null, jobs[1].current)).toBe("Feb 2024 - Nov 2025");
    expect(jobs[0].bullets.join(" ")).toContain("28%");
    expect(jobs[0].bullets.join(" ")).toContain("Python-based reporting");
  });

  it("uses source education and keeps the apprenticeship only as a certification", () => {
    const education = reconcileEducationFacts([
      { degree: "Master of Science", school: "Lakeside State University", graduationDate: null, expected: true },
      { degree: "Bachelor of Science", school: "Lakeside State University", graduationDate: "2022", expected: false },
      { degree: "Cloud Operations Apprenticeship", school: "Lakeside Technical Institute", graduationDate: "2024", expected: false },
    ], productionPlanningSourceResume);
    const certifications = reconcileCertificationFacts([], productionPlanningSourceResume);

    expect(education).toEqual([
      expect.objectContaining({ degree: "Master of Science, Information Systems", graduationDate: "2025-06", expected: false }),
      expect.objectContaining({ degree: "Bachelor of Science, Business Analytics", graduationDate: "2020-01", expected: false }),
    ]);
    expect(education.some((entry) => /apprenticeship/i.test(entry.degree))).toBe(false);
    expect(certifications.filter((entry) => /Cloud Operations Apprenticeship/i.test(entry.name))).toHaveLength(1);
    expect(education.map((entry) => formatEducationDateUtc(entry.graduationDate ?? null, entry.expected))).toEqual([
      "Jun 2025",
      "2020",
    ]);
  });

  it("merges every explicit source skill instead of trusting a partial model list", () => {
    const skillsBlock = productionPlanningSourceResume.split("CORE SKILLS\n")[1].split("PROFESSIONAL EXPERIENCE")[0];
    const sourceSkills = parseStructuredSkillsFallback(skillsBlock);
    const merged = mergeParsedSkills(
      [{ name: "Excel", qualifier: null, category: "Tools" }],
      sourceSkills
    );

    expect(merged.map((skill) => skill.name)).toEqual(expect.arrayContaining([
      "Operations Leadership",
      "KPI Tracking",
      "Process Improvement",
      "Excel",
      "Python",
      "Data Analysis",
    ]));
    expect(merged.every((skill) => Boolean(skill.category))).toBe(true);
  });

  it("retains the truthful 28% result and Python reporting proof under a four-bullet budget", () => {
    const source = [
      "Led and supported teams of 75+ associates across inbound operations.",
      "Analyzed operational data and reduced peak weekly defects by 28%.",
      "Built Python-based reporting and data analysis workflows to improve visibility into operational trends.",
    ];
    const generated = [
      "Coordinated daily warehouse workflows across inbound operations.",
      "Reviewed performance indicators with cross-functional leaders.",
      "Supported staffing decisions during peak operational periods.",
      "Maintained safety and quality standards across daily shifts.",
    ];

    const result = retainQuantifiedSourceEvidence(source, generated, 4, productionPlanningJobDescription);
    expect(result.bullets.join(" ")).toContain("28%");
    expect(result.bullets.join(" ")).toContain("Python-based reporting");
  });

  it("keeps unsupported planning requirements out of the source and exposes them as gaps", () => {
    const source = productionPlanningSourceResume.toLowerCase();
    unsupportedPlanningClaims.forEach((claim) => expect(source).not.toContain(claim));

    const analysis = analyzeResumeAgainstJob(productionPlanningSourceResume, productionPlanningJobDescription);
    const gaps = analysis.missingTermDetailsAll.map((item) => item.term.toLowerCase()).join(" | ");
    expect(gaps).toMatch(/forecast|capacity planning|erp|mrp|s&op|lean|six sigma/);
  });

  it("removes intent language from a tailored summary", () => {
    expect(sanitizeSummaryText(
      "Operations leader with team and KPI experience. Looking to leverage analytical skills in production planning."
    )).toBe("Operations leader with team and KPI experience. Brings analytical skills in production planning.");
    expect(sanitizeSummaryText(
      "Operations leader with team and KPI experience. Poised to apply analytical skills in production planning."
    )).toBe("Operations leader with team and KPI experience. Brings analytical skills in production planning.");
  });
});
