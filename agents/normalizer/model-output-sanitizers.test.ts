import {
  parseStructuredSkillsFallback,
  retainSourceGroundedExperienceMetrics,
  sanitizeCertificationOutput,
  sanitizeExperienceOutput,
  sanitizeHeaderOutput,
  sanitizeSkillsOutput,
} from "./index";

describe("normalizer model-output sanitizers", () => {
  it("removes null and non-string bullets before experience reconciliation", () => {
    expect(sanitizeExperienceOutput([
      {
        company: "  Example Co  ",
        title: " Engineer ",
        startDate: "2024-01",
        endDate: null,
        current: true,
        bullets: [" Built a reporting workflow. ", null, 42, ""],
      },
      { company: null, title: "Invalid", bullets: [] },
    ])).toEqual([{
      company: "Example Co",
      title: "Engineer",
      startDate: "2024-01",
      endDate: null,
      current: true,
      location: null,
      employmentType: null,
      bullets: ["Built a reporting workflow."],
    }]);
  });

  it("keeps only typed header, skill, and certification fields", () => {
    expect(sanitizeHeaderOutput({
      name: " Candidate ", email: " candidate@example.com ", phone: 123,
    })).toMatchObject({
      name: "Candidate", email: "candidate@example.com", phone: null,
    });

    expect(sanitizeSkillsOutput([
      { name: " Python ", qualifier: " basic ", category: null },
      { name: null, qualifier: "expert" },
    ])).toEqual([{ name: "Python", qualifier: "basic", category: null }]);

    expect(sanitizeCertificationOutput([
      { name: " AWS Certification ", issuingBody: " AWS ", year: 2025 },
      { name: null, year: "2024" },
    ])).toEqual([{
      name: "AWS Certification", issuingBody: "AWS", year: 2025,
    }]);
  });

  it("rejects a one-character candidate name instead of persisting it", () => {
    expect(sanitizeHeaderOutput({
      name: " S ",
      email: "candidate@example.com",
    })).toMatchObject({
      name: null,
      email: "candidate@example.com",
    });
  });
});

describe("parseStructuredSkillsFallback", () => {
  it("recovers grouped source skills and preserves explicit qualifiers", () => {
    expect(parseStructuredSkillsFallback([
      "CORE SKILLS",
      "Programming Languages: Python | basic SQL | Bash",
      "Cloud Platforms: AWS, Azure",
    ].join("\n"))).toEqual([
      { name: "Python", qualifier: null, category: "Programming Languages" },
      { name: "SQL", qualifier: "basic", category: "Programming Languages" },
      { name: "Bash", qualifier: null, category: "Programming Languages" },
      { name: "AWS", qualifier: null, category: "Cloud Platforms" },
      { name: "Azure", qualifier: null, category: "Cloud Platforms" },
    ]);
  });

  it("accepts compact standalone skills but rejects prose and headings", () => {
    expect(parseStructuredSkillsFallback([
      "Technical Skills",
      "Docker",
      "Built Python automation pipelines that reduced deployment time.",
      "some experience with Kubernetes",
    ].join("\n"))).toEqual([
      { name: "Docker", qualifier: null, category: null },
      { name: "Kubernetes", qualifier: "some experience with", category: null },
    ]);
  });

  it("deduplicates source skills case-insensitively", () => {
    expect(parseStructuredSkillsFallback("Tools: Python | python | Git")).toEqual([
      { name: "Python", qualifier: null, category: "Tools" },
      { name: "Git", qualifier: null, category: "Tools" },
    ]);
  });
});

describe("retainSourceGroundedExperienceMetrics", () => {
  it("drops a parsed bullet with a number absent from the uploaded source", () => {
    const jobs = sanitizeExperienceOutput([{
      company: "Example Co",
      title: "Analyst",
      startDate: "2024-01",
      current: false,
      bullets: [
        "Reduced defects by 41%.",
        "Supported 750 users across the program.",
        "Documented program requirements.",
      ],
    }]);

    expect(retainSourceGroundedExperienceMetrics(
      jobs,
      "Reduced defects by 41%. Documented program requirements."
    )[0].bullets).toEqual([
      "Reduced defects by 41%.",
      "Documented program requirements.",
    ]);
  });

  it("allows formatting variants of a source-grounded number", () => {
    const jobs = sanitizeExperienceOutput([{
      company: "Example Co",
      title: "Manager",
      startDate: "2024-01",
      current: false,
      bullets: ["Led 1,200+ associates."],
    }]);

    expect(retainSourceGroundedExperienceMetrics(
      jobs,
      "Led 1200 associates across the operation."
    )[0].bullets).toEqual(["Led 1,200+ associates."]);
  });
});
