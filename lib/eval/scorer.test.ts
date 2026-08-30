import { candidateQualityFailures, scoreResumeAgainstTriple } from "./scorer";
import type { GoldenTriple } from "./golden-set";

const SOURCE = [
  "ALEX EXAMPLE",
  "City, ST | (202) 555-0100 | alex@example.com",
  "PROFESSIONAL EXPERIENCE",
  "Operations Lead | Example Fulfillment | 2018 - Present",
  "- Led 120 associates and reduced defects 28% using weekly KPI reviews.",
  "EDUCATION",
  "Bachelor of Science, Business | State University",
  "SKILLS",
  "Team Leadership, KPI Tracking, Safety Compliance",
].join("\n");

const JD = [
  "Senior Operations Manager",
  "Example Logistics Co",
  "",
  "Lead a team of supervisors and compile KPI reports; uphold safety compliance.",
].join("\n");

function triple(overrides: Partial<GoldenTriple> = {}): GoldenTriple {
  return {
    id: "t-1",
    track: "operations",
    sourceResumeText: SOURCE,
    jobDescription: JD,
    acceptedFinalText: "",
    holdout: false,
    ...overrides,
  };
}

describe("scoreResumeAgainstTriple", () => {
  it("gives an accepted final a high overall against itself", () => {
    const accepted = `${SOURCE}\nSelected Accomplishments: Improved weekly planning.`;
    const t = triple({ acceptedFinalText: accepted });
    const r = scoreResumeAgainstTriple(accepted, t);
    expect(r.overall).toBeGreaterThan(0.6);
    expect(r.dimensions.editDistance).not.toBeNull();
    expect(r.dimensions.editDistance!.score).toBeGreaterThan(0.9);
  });

  it("does not treat a copied source as an accepted quality ceiling", () => {
    const r = scoreResumeAgainstTriple(SOURCE, triple({ acceptedFinalText: SOURCE }));
    expect(r.dimensions.editDistance).toBeNull();
  });

  it("flags invented numbers as ungrounded", () => {
    const fabricated = SOURCE.replace("reduced defects 28%", "reduced defects 87% and saved $2.4M");
    const r = scoreResumeAgainstTriple(fabricated, triple());
    expect(r.dimensions.factualGrounding.score).toBeLessThan(1);
    expect(r.dimensions.factualGrounding.detail).toMatch(/not in source/);
  });

  it("treats every number matching the source as fully grounded", () => {
    const r = scoreResumeAgainstTriple(SOURCE, triple());
    expect(r.dimensions.factualGrounding.score).toBe(1);
  });

  it("does not treat ISO storage month and day components as invented claims", () => {
    const source = `${SOURCE}\nAssociate Engineer | May 2024 - Apr 2025`;
    const candidate = `${SOURCE}\nAssociate Engineer | 2024-05-01 - 2025-04-01`;
    const r = scoreResumeAgainstTriple(candidate, triple({ sourceResumeText: source }));
    expect(r.dimensions.factualGrounding.score).toBe(1);
  });

  it("penalizes forbidden buzzwords", () => {
    const buzzy = `${SOURCE}\n- Spearheaded a dynamic, results-driven team.`;
    const r = scoreResumeAgainstTriple(buzzy, triple());
    expect(r.dimensions.forbiddenWords.score).toBeLessThan(1);
  });

  it("penalizes resumes that overflow one page", () => {
    const long = `${SOURCE}\n` + "extra filler content ".repeat(600);
    const r = scoreResumeAgainstTriple(long, triple());
    expect(r.dimensions.onePageFit.score).toBeLessThan(0.5);
  });

  it("reports missing core sections", () => {
    const noSkills = SOURCE.replace(/SKILLS[\s\S]*$/, "");
    const r = scoreResumeAgainstTriple(noSkills, triple());
    expect(r.dimensions.sectionCoverage.score).toBeLessThan(1);
    expect(r.dimensions.sectionCoverage.detail).toMatch(/skills/);
  });

  it("omits edit distance when the triple has no accepted final", () => {
    const r = scoreResumeAgainstTriple(SOURCE, triple({ acceptedFinalText: "" }));
    expect(r.dimensions.editDistance).toBeNull();
    // Weight redistributes: overall is still a valid 0..1 number.
    expect(r.overall).toBeGreaterThan(0);
    expect(r.overall).toBeLessThanOrEqual(1);
  });
});

describe("candidateQualityFailures", () => {
  it("accepts a grounded candidate that preserves structure and improves alignment", () => {
    const t = triple();
    const source = scoreResumeAgainstTriple(SOURCE, t);
    const candidate = scoreResumeAgainstTriple(
      `${SOURCE}\nSQL reporting automation and data analysis`,
      t
    );

    expect(candidateQualityFailures(candidate, source)).toEqual([]);
  });

  it("rejects invented metrics and material JD-alignment regression", () => {
    const t = triple();
    const source = scoreResumeAgainstTriple(SOURCE, t);
    const candidate = scoreResumeAgainstTriple(
      "EXPERIENCE\nReduced costs by 99%.\nEDUCATION\nSchool\nSKILLS\nTyping",
      t
    );

    expect(candidateQualityFailures(candidate, source)).toEqual(expect.arrayContaining([
      "numeric claims are not fully grounded",
      "overall deterministic score is below 75%",
      "JD alignment regressed by more than 3 points from the source",
    ]));
  });
});

describe("date precision is not mistaken for invented metrics", () => {
  // Found during the first LIVE model run: a YYYY-MM employment date made the
  // scorer report "01, 06, 05" as fabricated numbers and fail the grounding
  // gate on a resume that invented nothing.
  const triple = {
    id: "date-precision", track: "operations",
    sourceResumeText: "Operations Lead, Acme, 2018 - 2024. Analyst, Acme, 2023 - 2024. Reduced defects by 28%. Led 75+ associates.",
    jobDescription: "Operations manager. Safety, KPIs, productivity.",
    acceptedFinalText: "", holdout: false,
  };

  it("treats YYYY-MM and YYYY-MM-DD as dates, not numeric claims", () => {
    const candidate = [
      "EXPERIENCE",
      "Acme | Operations Lead | 2018-01 - 2024-01",
      "Acme | Analyst | 2024-01-01 - 2023-12-31",
      "- Reduced defects by 28%.",
      "- Led 75+ associates.",
      "EDUCATION", "SKILLS",
    ].join("\n");
    const result = scoreResumeAgainstTriple(candidate, triple as never);
    expect(result.dimensions.factualGrounding.score).toBe(1);
  });

  it("still catches a genuinely invented metric", () => {
    const candidate = [
      "EXPERIENCE",
      "Acme | Operations Lead | 2018-01 - 2024-01",
      "- Reduced defects by 87%.",
      "EDUCATION", "SKILLS",
    ].join("\n");
    const result = scoreResumeAgainstTriple(candidate, triple as never);
    expect(result.dimensions.factualGrounding.score).toBeLessThan(1);
  });
});
