import { placeConfirmedEvidence } from "./evidence-placement";

const jobs = [
  {
    company: "Northstar Logistics",
    title: "Operations Leadership Experience",
    bullets: ["Led daily operations."],
  },
  {
    company: "Northstar Logistics",
    title: "Process Improvement Internship",
    bullets: ["Analyzed operational defects."],
  },
  {
    company: "Blue Ridge Technology",
    title: "Associate Cloud Engineer",
    bullets: ["Documented cloud workflows."],
  },
];

describe("confirmed evidence placement", () => {
  it("attaches evidence to one explicitly named employer and role", () => {
    const result = placeConfirmedEvidence(jobs, [
      {
        term: "WMS",
        category: "Operational technology",
        source: "Northstar Logistics - Operations Leadership",
        details: "Used WMS dashboards to review inbound throughput each shift.",
      },
    ]);

    expect(result.jobs[0].bullets).toContain(
      "Used WMS dashboards to review inbound throughput each shift."
    );
    expect(result.jobs[1].bullets).toEqual(jobs[1].bullets);
    expect(result.unmatched).toEqual([]);
    expect(result.evidenceBulletKeys).toContain(
      "used wms dashboards to review inbound throughput each shift."
    );
  });

  it("does not guess when an employer appears in multiple roles", () => {
    const evidence = {
      term: "WMS",
      category: "Operational technology",
      source: "Northstar Logistics",
      details: "Used WMS dashboards to review inbound throughput each shift.",
    };
    const result = placeConfirmedEvidence(jobs, [evidence]);

    expect(result.jobs).toEqual(jobs);
    expect(result.unmatched).toEqual([evidence]);
    expect(result.evidenceBulletKeys.size).toBe(0);
  });

  it("does not place evidence from a vague or mismatched role label", () => {
    const evidence = {
      term: "WMS",
      category: "Operational technology",
      source: "Northstar Logistics - Operations Manager",
      details: "Used WMS dashboards to review inbound throughput each shift.",
    };
    const result = placeConfirmedEvidence(jobs, [evidence]);

    expect(result.jobs).toEqual(jobs);
    expect(result.unmatched).toEqual([evidence]);
  });

  it("does not duplicate evidence already present in the source resume", () => {
    const result = placeConfirmedEvidence(
      [
        {
          company: "Blue Ridge Technology",
          title: "Associate Cloud Engineer",
          bullets: ["Built Python reporting workflows."],
        },
      ],
      [
        {
          term: "Python",
          category: "Technical skill",
          source: "Blue Ridge Technology - Associate Cloud Engineer",
          details: "Built Python reporting workflows.",
        },
      ]
    );

    expect(result.jobs[0].bullets).toHaveLength(1);
    expect(result.evidenceBulletKeys.size).toBe(0);
  });
});
