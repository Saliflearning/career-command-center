import type { CareerMemory } from "@/lib/types";
import {
  fingerprintCareerMemory,
  formatCareerMemoryAsResumeText,
  getCareerMemoryEvidenceSources,
  parseCareerMemorySnapshot,
  parseSavedSourceHeader,
} from "./saved-source";

const profile: CareerMemory = {
  id: "memory-1",
  userId: "user-1",
  version: 1,
  jobs: [
    {
      id: "job-1",
      company: "Example Corp",
      title: "Operations Manager",
      startDate: "2021-01-01",
      endDate: null,
      current: true,
      location: "Columbus, OH",
      employmentType: "Full-Time",
      bullets: [
        {
          id: "bullet-1",
          content: "Reduced verified processing defects by 28%.",
          contentType: "VERIFIED",
          metrics: ["28%"],
          keywords: ["process improvement"],
          locked: true,
          usedInResumeCount: 2,
        },
      ],
      sourceType: "UPLOADED",
      verified: true,
      locked: false,
      sortOrder: 0,
    },
  ],
  education: [
    {
      id: "education-1",
      degree: "B.S. Informatics",
      institution: "State University",
      graduationDate: "2020-05-01",
      expectedDate: null,
      inProgress: false,
      gpa: null,
      location: "Columbus, OH",
      verified: true,
    },
  ],
  skills: [
    {
      id: "skill-1",
      name: "Python",
      category: "Programming Languages",
      proficiencyLabel: "basic",
      verified: true,
    },
  ],
  certifications: [],
  projects: [],
  achievements: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("saved resume sources", () => {
  it("returns ordered, unique employer-role evidence sources", () => {
    const profileWithDuplicateRole: CareerMemory = {
      ...profile,
      jobs: [profile.jobs[0], { ...profile.jobs[0], id: "job-duplicate" }],
    };

    expect(getCareerMemoryEvidenceSources(profileWithDuplicateRole)).toEqual([
      "Example Corp - Operations Manager",
    ]);
  });

  it("projects immutable profile facts into canonical resume text", () => {
    const text = formatCareerMemoryAsResumeText(profile, {
      name: "Jordan Smith",
      email: "avery.morgan@example.com",
      phone: "555-0192",
      linkedin: "linkedin.com/in/avery-example",
      website: null,
      location: "Columbus, OH",
    });

    expect(text).toContain("Jordan Smith");
    expect(text).toContain("Operations Manager | Columbus, OH | 2021-01-01 - Present");
    expect(text).toContain("- Reduced verified processing defects by 28%.");
    expect(text).toContain("Programming Languages: Python (basic)");
    expect(text).toContain("B.S. Informatics | State University");
    expect(text).not.toContain("undefined");
  });

  it("deduplicates semantic copies while ignoring database ids and timestamps", () => {
    const copy: CareerMemory = JSON.parse(JSON.stringify(profile));
    copy.id = "memory-2";
    copy.updatedAt = "2026-07-14T00:00:00.000Z";
    copy.jobs[0].id = "job-2";
    copy.jobs[0].bullets[0].id = "bullet-2";
    copy.skills[0].id = "skill-2";

    expect(fingerprintCareerMemory(copy)).toBe(fingerprintCareerMemory(profile));

    copy.jobs[0].bullets[0].content = "Different verified evidence.";
    expect(fingerprintCareerMemory(copy)).not.toBe(fingerprintCareerMemory(profile));
  });

  it("rejects malformed immutable source snapshots", () => {
    expect(parseCareerMemorySnapshot(JSON.stringify(profile))).toMatchObject({
      id: "memory-1",
      userId: "user-1",
    });
    expect(parseCareerMemorySnapshot(JSON.stringify({ id: "memory-1", jobs: [] }))).toBeNull();
    expect(parseCareerMemorySnapshot("not json")).toBeNull();
  });

  it.each([
    { jobs: [{ ...profile.jobs[0], bullets: null }] },
    { jobs: [{ ...profile.jobs[0], company: 42 }] },
    { education: [{ ...profile.education[0], institution: null }] },
    { skills: [{ ...profile.skills[0], name: ["Python"] }] },
    { certifications: [{ id: "cert-1", name: null }] },
    { projects: [{ id: "project-1", name: "Project", technologies: "Python" }] },
    { achievements: [{ id: "achievement-1", title: "Award", description: 42 }] },
  ])("rejects malformed nested source evidence", (overrides) => {
    expect(
      parseCareerMemorySnapshot(JSON.stringify({ ...profile, ...overrides }))
    ).toBeNull();
  });
  it("parses only valid contact strings from saved headers", () => {
    expect(
      parseSavedSourceHeader(
        JSON.stringify({ name: " Jordan Smith ", email: 42, phone: "" })
      )
    ).toMatchObject({ name: "Jordan Smith", email: null, phone: null });
    expect(parseSavedSourceHeader("not json")).toMatchObject({ name: null });
  });

  it("rejects a one-character saved name before it can be reused", () => {
    expect(parseSavedSourceHeader(JSON.stringify({ name: "S" }))).toMatchObject({
      name: null,
    });
  });
});
