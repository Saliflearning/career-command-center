import { analyzeResumeAgainstJob } from "./scan-analysis";

describe("analyzeResumeAgainstJob", () => {
  it("scores matching resume language and returns missing job terms", () => {
    const result = analyzeResumeAgainstJob(
      "Led 100 warehouse associates and improved safety and throughput by 18% using weekly KPI reviews.",
      "Senior Operations Manager responsible for warehouse safety, throughput, WMS automation, and P&L ownership."
    );

    expect(result.score).toBeGreaterThan(0);
    expect(result.keywordScore).toBeGreaterThan(0);
    expect(result.evidenceScore).toBeGreaterThan(0);
    expect(result.matchedCount).toBeGreaterThan(0);
    expect(result.totalKeywords).toBeGreaterThan(result.matchedCount);
    expect(result.missingTermDetailsAll.some((item) => item.term.includes("automation"))).toBe(true);
  });

  it("rewards concrete evidence without confusing it with keyword coverage", () => {
    const weak = analyzeResumeAgainstJob(
      "Worked with warehouse operations and teams.",
      "Lead warehouse operations, team development, safety, throughput, and continuous improvement."
    );
    const strong = analyzeResumeAgainstJob(
      "Led 100 people in warehouse operations and teams, improving output 18%.",
      "Lead warehouse operations, team development, safety, throughput, and continuous improvement."
    );

    expect(strong.evidenceScore).toBeGreaterThan(weak.evidenceScore);
    expect(strong.score).toBe(weak.score);
    expect(strong.keywordScore).toBe(weak.keywordScore);
  });

  it("does not penalize present-tense bullets for a current role", () => {
    const job = "Lead warehouse operations, team development, safety, throughput, dashboards, and process improvement.";
    const source = analyzeResumeAgainstJob(
      [
        "EXPERIENCE",
        "- Led 45 associates across inbound and outbound operations.",
        "- Reduced order cycle time by 18% through workflow redesign.",
        "- Implemented warehouse dashboards with engineering.",
      ].join("\n"),
      job
    );
    const currentRoleDraft = analyzeResumeAgainstJob(
      [
        "EXPERIENCE",
        "- Lead 45 associates across inbound and outbound operations.",
        "- Reduce order cycle time by 18% through workflow redesign.",
        "- Implement warehouse dashboards with engineering.",
        "- Collaborate with safety leaders on daily operating reviews.",
      ].join("\n"),
      job
    );

    expect(currentRoleDraft.evidenceScore).toBeGreaterThanOrEqual(source.evidenceScore);
  });

  it("recognizes Unicode bullets extracted from uploaded PDFs", () => {
    const result = analyzeResumeAgainstJob(
      [
        "EXPERIENCE",
        "• Led 100 associates and increased throughput by 18%.",
        "• Built Python reporting that reduced manual work by 40%.",
      ].join("\n"),
      "Lead operations teams, improve throughput, and automate reporting with Python."
    );

    expect(result.evidenceScore).toBeGreaterThanOrEqual(70);
    // "python" may surface alone or inside a JD phrase like "automate
    // reporting with python" — either way it must count as matched.
    expect(result.matchedKeywords.some((term) => term.includes("python"))).toBe(true);
    expect(result.matchedKeywords.some((term) => term.includes("throughput"))).toBe(true);
  });

  it("does not treat stop words as useful resume evidence", () => {
    const result = analyzeResumeAgainstJob(
      "the and with from this that",
      "The role needs Python, analytics, forecasting, and stakeholder management."
    );

    expect(result.score).toBeLessThan(30);
    expect(result.matchedKeywords).not.toContain("the");
  });

  it("prioritizes meaningful role phrases instead of job-board boilerplate", () => {
    const result = analyzeResumeAgainstJob(
      "Guided customer cloud adoption using AWS and coordinated executive stakeholders.",
      "Customer Solutions Manager. Apply today. Equal opportunity employer. Lead cloud adoption, customer engagement, change management, and C-suite relationships using AWS."
    );

    expect(result.matchedKeywords).toEqual(expect.arrayContaining(["cloud adoption", "aws"]));
    expect(result.missingKeywordDetails.map((item) => item.term)).toContain("change management");
    expect(result.missingKeywordDetails.map((item) => item.term)).not.toEqual(
      expect.arrayContaining(["apply", "employer", "opportunity"])
    );
  });

  it("recognizes labor planning as truthful workforce-planning evidence", () => {
    const job = "Lead workforce planning, throughput, safety, and inventory accuracy for warehouse operations.";
    const source = analyzeResumeAgainstJob(
      "Led warehouse operations with workforce planning, throughput, safety, and inventory accuracy.",
      job
    );
    const tailored = analyzeResumeAgainstJob(
      "Led warehouse operations with daily labor planning, throughput, safety, and inventory accuracy.",
      job
    );

    expect(tailored.matchedKeywords).toContain("workforce planning");
    expect(tailored.keywordScore).toBe(source.keywordScore);
  });

  it("matches common operational vocabulary without requiring JD command verbs", () => {
    const result = analyzeResumeAgainstJob(
      [
        "EXPERIENCE",
        "- Managed workforce planning and tracked key performance indicators for daily operations.",
        "- Improved workflow efficiency while maintaining safety compliance.",
        "- Produced weekly operational reports for leadership.",
      ].join("\n"),
      [
        "Operations Manager",
        "Compile operational reports.",
        "Develop efficient workflows and labor plans.",
        "Track performance indicators and uphold safety regulations.",
      ].join("\n")
    );

    expect(result.matchedKeywords).toEqual(expect.arrayContaining([
      "operational reports",
      "efficient workflows",
      "labor plans",
      "track performance indicators",
      "safety regulations",
    ]));
    expect(result.missingKeywordDetails.map((item) => item.term)).not.toEqual(
      expect.arrayContaining(["compile reports", "develop efficient workflows", "uphold safety regulations"])
    );
  });

  it("retains one-time requirements from a structured qualifications block", () => {
    const job = [
      "Production Planning Supervisor",
      "Meridian Manufacturing LLC",
      "Responsibilities",
      "Coordinate production, procurement, and warehouse teams to meet customer demand.",
      "Review output each hour and resolve material constraints with operations leaders.",
      "Qualifications",
      "- Advanced proficiency in Microsoft Excel.",
      "- Experience with production scheduling and capacity planning.",
      "- Strong knowledge of inventory management and demand forecasting.",
      "- Familiarity with ERP systems and OTIF reporting.",
    ].join("\n");
    const resume = [
      "JORDAN LEE",
      "jordan@example.com | (317) 555-0142 | linkedin.com/in/jordan",
      "EXPERIENCE",
      "Production Coordinator | Example Manufacturing | Jan 2020 - Present",
      "- Built weekly production schedules and capacity plans in Microsoft Excel.",
      "- Coordinated inventory with procurement and warehouse teams, raising schedule adherence 14%.",
      "EDUCATION",
      "Bachelor of Science, Operations Management",
      "SKILLS",
      "Microsoft Excel | Production scheduling | Capacity planning | Inventory management",
    ].join("\n");

    const result = analyzeResumeAgainstJob(resume, job);
    const vocabulary = [
      ...result.matchedKeywords,
      ...result.missingTermDetailsAll.map((item) => item.term),
    ];

    expect(vocabulary).toEqual(expect.arrayContaining([
      "microsoft excel",
      "production scheduling",
      "capacity planning",
      "inventory management",
    ]));
    expect(result.matchedKeywords).toEqual(expect.arrayContaining([
      "microsoft excel",
      "production scheduling",
      "capacity planning",
      "inventory management",
    ]));
    expect(result.keywordScore).toBeGreaterThanOrEqual(35);
  });

  it("does not tell a candidate to claim a missing target title", () => {
    const result = analyzeResumeAgainstJob(
      "EXPERIENCE\nProduction Coordinator\n- Built weekly production schedules in Excel.",
      "Production Planning Supervisor\nExample Manufacturing LLC\nQualifications\n- Capacity planning\n- Advanced Excel"
    );

    expect(result.missingKeywordDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ term: "production planning supervisor", category: "Target role" }),
    ]));
    expect(result.quickWins.join(" ")).toMatch(/only if it accurately describes/i);
    expect(result.quickWins.join(" ")).not.toMatch(/where you used production planning supervisor/i);
  });
});
