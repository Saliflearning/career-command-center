import { mergeUserVouchedProfileFacts } from "./profile-merge";
import type { CareerMemory, WorkHistoryEntry, CareerMemoryBullet } from "@/lib/types";

function bullet(content: string, contentType: CareerMemoryBullet["contentType"] = "VERIFIED"): CareerMemoryBullet {
  return { id: `b-${content}`, content, contentType, metrics: [], keywords: [], locked: false, usedInResumeCount: 0 };
}

function job(overrides: Partial<WorkHistoryEntry>): WorkHistoryEntry {
  return {
    id: "j-default",
    company: "Example Co",
    title: "Example Title",
    startDate: "2020-01-01",
    endDate: null,
    current: true,
    location: null,
    employmentType: null,
    bullets: [bullet("Did verifiable work.")],
    sourceType: "UPLOADED",
    verified: false,
    locked: false,
    sortOrder: 0,
    ...overrides,
  };
}

function memory(overrides: Partial<CareerMemory>): CareerMemory {
  return {
    id: "cm-1",
    userId: "u-1",
    version: 1,
    jobs: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    achievements: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const education = (degree: string, institution: string, verified: boolean) => ({
  id: `e-${degree}`, degree, institution, graduationDate: null, expectedDate: null,
  inProgress: false, gpa: null, location: null, verified,
});

const cert = (name: string, verified: boolean) => ({
  id: `c-${name}`, name, issuingBody: null, issueDate: null, expiryDate: null,
  credentialId: null, verified,
});

const skill = (name: string, verified: boolean) => ({
  id: `s-${name}`, name, category: null, proficiencyLabel: null, verified,
});

const project = (name: string, verified: boolean) => ({
  id: `p-${name}`, name, description: "A real project.", technologies: [], url: null,
  startDate: null, endDate: null, verified,
});

describe("mergeUserVouchedProfileFacts", () => {
  it("merges a verified certification the uploaded document lacks (C-003 acceptance case)", () => {
    const snapshot = memory({ jobs: [job({ id: "doc-job" })] });
    const profile = memory({ certifications: [cert("AWS Certified Solutions Architect", true)] });

    const merged = mergeUserVouchedProfileFacts(snapshot, profile);

    expect(merged.certifications.map((c) => c.name)).toContain("AWS Certified Solutions Architect");
    expect(merged.jobs).toHaveLength(1);
  });

  it("never merges unverified profile entries", () => {
    const snapshot = memory({});
    const profile = memory({
      jobs: [job({ id: "unverified", company: "Ghost Corp", verified: false, locked: false })],
      certifications: [cert("Unvouched Cert", false)],
      skills: [skill("Unvouched Skill", false)],
      education: [education("Unvouched Degree", "Nowhere U", false)],
      projects: [project("Unvouched Project", false)],
    });

    const merged = mergeUserVouchedProfileFacts(snapshot, profile);

    expect(merged).toBe(snapshot); // untouched object: no vouched facts, no new snapshot
    expect(merged.jobs).toHaveLength(0);
    expect(merged.certifications).toHaveLength(0);
  });

  it("merges verified or locked jobs but strips their GENERATED bullets", () => {
    const snapshot = memory({ jobs: [job({ id: "doc-job", company: "Doc Co", title: "Doc Role" })] });
    const profile = memory({
      jobs: [
        job({
          id: "profile-job",
          company: "Vouched Co",
          title: "Vouched Role",
          verified: true,
          sortOrder: 0,
          bullets: [bullet("Truthful user fact.", "USER_EDITED"), bullet("AI wording from another draft.", "GENERATED")],
        }),
      ],
    });

    const merged = mergeUserVouchedProfileFacts(snapshot, profile);
    const mergedJob = merged.jobs.find((j) => j.company === "Vouched Co");

    expect(mergedJob).toBeDefined();
    expect(mergedJob!.bullets.map((b) => b.content)).toEqual(["Truthful user fact."]);
    expect(mergedJob!.sortOrder).toBeGreaterThan(0); // appended after document jobs
  });

  it("does not duplicate a job the document already contains", () => {
    const snapshot = memory({ jobs: [job({ id: "doc", company: "Same Co", title: "Same Role" })] });
    const profile = memory({
      jobs: [job({ id: "profile", company: "  same co ", title: "SAME ROLE", verified: true })],
    });

    const merged = mergeUserVouchedProfileFacts(snapshot, profile);

    expect(merged.jobs).toHaveLength(1);
    expect(merged.jobs[0].id).toBe("doc"); // document-scoped entry wins
  });

  it("merges verified education, skills, and projects without duplicating existing ones", () => {
    const snapshot = memory({
      education: [education("BS Nursing", "State University", false)],
      skills: [skill("Triage", false)],
    });
    const profile = memory({
      education: [
        education("BS Nursing", "State University", true), // duplicate — must not double
        education("MS Health Administration", "State University", true),
      ],
      skills: [skill("Wound Care", true)],
      projects: [project("Community Vaccination Drive", true)],
    });

    const merged = mergeUserVouchedProfileFacts(snapshot, profile);

    expect(merged.education).toHaveLength(2);
    expect(merged.skills.map((s) => s.name).sort()).toEqual(["Triage", "Wound Care"]);
    expect(merged.projects.map((p) => p.name)).toEqual(["Community Vaccination Drive"]);
  });
});
