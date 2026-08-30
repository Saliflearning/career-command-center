import type { ProjectEntry, SkillEntry, WorkHistoryEntry } from "@/lib/types";
import {
  projectResumeProjects,
  projectResumeSkills,
  projectGroundedJdSkillGaps,
  projectGroundedTargetHeadline,
  projectLinkedWorkHistory,
  restoreSourceWorkHistory,
  projectResumeSkillsWithKeywords,
  type ProjectedWorkHistory,
} from "./content-projection";

function sourceJob(overrides: Partial<WorkHistoryEntry> = {}): WorkHistoryEntry {
  return {
    id: "job-source",
    company: "Source Company",
    title: "Operations Manager",
    startDate: "2021-01-01T00:00:00.000Z",
    endDate: "2024-01-01T00:00:00.000Z",
    current: false,
    location: "Indianapolis, IN",
    employmentType: "Full-Time",
    bullets: [
      {
        id: "bullet-source",
        content: "Improved throughput by 18%.",
        contentType: "VERIFIED",
        metrics: ["18%"],
        keywords: ["throughput"],
        locked: false,
        usedInResumeCount: 0,
      },
    ],
    sourceType: "UPLOADED",
    verified: true,
    locked: false,
    sortOrder: 0,
    ...overrides,
  };
}

function skill(
  name: string,
  category: string | null = null,
  proficiencyLabel: string | null = null
): SkillEntry {
  return {
    id: `skill-${name}`,
    name,
    category,
    proficiencyLabel,
    verified: true,
  };
}

function project(name: string, verified = true): ProjectEntry {
  return {
    id: `project-${name}`,
    name,
    description: "Built a production reporting workflow.",
    technologies: ["Python", "AWS", "Python"],
    url: "https://example.com/project",
    startDate: null,
    endDate: null,
    verified,
  };
}

describe("saved resume content projection", () => {
  it("groups linked bullets into one consistently sorted work history projection", () => {
    const projected = projectLinkedWorkHistory([
      {
        bulletId: "bullet-older",
        bullet: {
          content: "Documented operating procedures.",
          contentType: "GENERATED",
          workHistory: {
            id: "job-older",
            company: "Earlier Company",
            title: "Analyst",
            startDate: new Date("2019-01-01T00:00:00.000Z"),
            endDate: new Date("2020-12-01T00:00:00.000Z"),
            current: false,
            location: null,
            sortOrder: 1,
          },
        },
      },
      {
        bulletId: "bullet-current",
        bullet: {
          content: "Improved throughput by 18%.",
          contentType: "USER_EDITED",
          workHistory: {
            id: "job-current",
            company: "Current Company",
            title: "Operations Manager",
            startDate: new Date("2021-01-01T00:00:00.000Z"),
            endDate: null,
            current: true,
            location: "Indianapolis, IN",
            sortOrder: 0,
          },
        },
      },
    ]);

    expect(projected.map((job) => job.workHistoryId)).toEqual([
      "job-current",
      "job-older",
    ]);
    expect(projected[0]).toEqual(expect.objectContaining({
      startDate: "2021-01-01T00:00:00.000Z",
      current: true,
      bullets: [expect.objectContaining({ bulletId: "bullet-current" })],
    }));
  });

  it("keeps linked generated work history authoritative", () => {
    const linked: ProjectedWorkHistory[] = [
      {
        workHistoryId: "job-generated",
        company: "Generated Company",
        title: "Tailored Role",
        location: null,
        startDate: "2022-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        sortOrder: 0,
        bullets: [
          { bulletId: "bullet-generated", content: "Tailored bullet.", contentType: "GENERATED" },
        ],
      },
    ];

    expect(restoreSourceWorkHistory(linked, [sourceJob()])).toBe(linked);
  });

  it("restores truthful source jobs when a legacy resume has no bullet links", () => {
    const restored = restoreSourceWorkHistory([], [sourceJob()]);

    expect(restored).toEqual([
      expect.objectContaining({
        workHistoryId: "job-source",
        company: "Source Company",
        bullets: [
          expect.objectContaining({
            bulletId: "bullet-source",
            content: "Improved throughput by 18%.",
          }),
        ],
      }),
    ]);
  });

  it("uses matched source skills for a normal tailored resume", () => {
    expect(
      projectResumeSkills(
        [skill("Python", "Programming"), skill("Forklift", "Operations")],
        "Built Python reporting workflows.",
        false
      )
    ).toEqual([{ name: "Python", category: "Programming" }]);
  });

  it("restores source skills only for a legacy resume without linked bullets", () => {
    expect(
      projectResumeSkills(
        [skill("Python", "Programming"), skill("SQL", "Data")],
        "Summary without an explicit skills list.",
        true
      )
    ).toEqual([
      { name: "Python", category: "Programming" },
      { name: "SQL", category: "Data" },
    ]);
  });

  it("merges generated bullet keywords into projected source skills once", () => {
    expect(projectResumeSkillsWithKeywords(
      [skill("Python", "Programming"), skill("Forklift", "Operations")],
      "Built Python reporting workflows.",
      false,
      ["Python", "AWS", " aws "]
    )).toEqual([
      { name: "Python", category: "Programming" },
      { name: "AWS", category: null },
    ]);
  });

  it("preserves source proficiency qualifiers without adding an unqualified duplicate", () => {
    expect(projectResumeSkillsWithKeywords(
      [skill("SQL", "Data", "basic")],
      "Used SQL to validate weekly reports.",
      false,
      ["SQL"]
    )).toEqual([
      { name: "SQL (basic)", category: "Data" },
    ]);
  });

  it("projects verified work for role tracks that include projects", () => {
    expect(projectResumeProjects([project("Reporting Platform")], "TECHNICAL")).toEqual([
      expect.objectContaining({
        name: "Reporting Platform",
        technologies: ["Python", "AWS"],
      }),
    ]);
  });

  it("never projects unverified work or projects for unrelated role tracks", () => {
    expect(projectResumeProjects([project("Unverified", false)], "DATA")).toEqual([]);
    expect(projectResumeProjects([project("Reporting Platform")], "OPERATIONS")).toEqual([]);
  });

  it("deduplicates projects by normalized name", () => {
    expect(
      projectResumeProjects(
        [project("Reporting Platform"), project("  reporting platform  ")],
        "CREATIVE"
      )
    ).toHaveLength(1);
  });

  it("restores only high-signal JD capabilities proven by the source", () => {
    const projected = projectGroundedJdSkillGaps(
      "Delivered program management and regulatory compliance reporting.",
      "Program Analyst\nRequires program management, regulatory compliance, reporting, and analysis.",
      "Program analyst with reporting and analysis experience.",
      "Program Analyst",
      []
    );

    expect(projected).toEqual([
      { name: "program management", category: "Role-Aligned Capabilities" },
      { name: "regulatory compliance", category: "Role-Aligned Capabilities" },
    ]);
  });

  it("does not project generic words, the target title, unsupported terms, or duplicates", () => {
    const projected = projectGroundedJdSkillGaps(
      "Program Analyst using SQL for reporting.",
      "Program Analyst\nProgram analysis requires SQL, reporting, and stakeholder management.",
      "SQL reporting",
      "Program Analyst",
      [{ name: "SQL", category: "Tools" }]
    );

    expect(projected).toEqual([]);
  });

  it("does not request a JD skill already present with a truthful qualifier", () => {
    expect(projectGroundedJdSkillGaps(
      "Used SQL for reporting validation.",
      "Data Analyst\nRequires SQL and reporting.",
      "Reporting analyst.",
      "Data Analyst",
      [{ name: "SQL (basic)", category: "Data" }]
    )).toEqual([]);
  });

  it("projects the target title only when the source names that exact role", () => {
    expect(projectGroundedTargetHeadline(
      "Program Analyst | Department of Example",
      "Program Analyst"
    )).toBe("Program Analyst");
    expect(projectGroundedTargetHeadline(
      "Operations coordinator supporting program analysis.",
      "Program Analyst"
    )).toBeNull();
  });
});
