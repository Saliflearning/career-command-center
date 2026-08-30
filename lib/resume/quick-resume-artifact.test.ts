import { MAX_EDITOR_BULLET_LENGTH } from "./editor-patch";
import {
  QUICK_RESUME_ENGINE,
  QUICK_RESUME_ARTIFACT_SECTION,
  buildQuickResumeArtifact,
  isQuickResumeStrategy,
  quickResumeStrategyMarker,
  parseQuickResumeArtifact,
  updateQuickResumeArtifactBullet,
} from "./quick-resume-artifact";

const MODEL_DRAFT = {
  targetTitle: "Operations Supervisor",
  honestStretchNote: "Confirm direct production-planning ownership before applying.",
  summary: "Warehouse shift lead with four years of team leadership.",
  coreSkills: ["Team Leadership", "Safety Compliance", "Scheduling"],
  experience: [{
    title: "Shift Lead",
    company: "Grocery Warehouse",
    location: "Indianapolis, IN",
    dateLabel: "2019 - 2023",
    bullets: ["Led daily shift operations for a warehouse team."],
  }],
  projects: [{
    name: "Shift Coverage Dashboard",
    description: "Built a dashboard that summarized daily staffing coverage.",
    technologies: ["Excel"],
    url: "",
  }],
  education: [{
    degree: "High School Diploma",
    institution: "North High School",
    dateLabel: "2018",
    details: "",
  }],
  certifications: [{
    name: "Forklift Certification",
    issuer: "Warehouse Safety Council",
    dateLabel: "2019",
  }],
  placeholdersForUser: [],
};

describe("Quick Resume persisted artifact", () => {
  it("uses an independent persisted engine marker", () => {
    expect(quickResumeStrategyMarker()).toEqual({
      engine: QUICK_RESUME_ENGINE,
      artifactVersion: 3,
    });
    expect(isQuickResumeStrategy(quickResumeStrategyMarker())).toBe(true);
    expect(isQuickResumeStrategy({ engine: "pipeline" })).toBe(false);
    expect(isQuickResumeStrategy(null)).toBe(false);
  });

  it("builds a v3 document with project evidence, provenance, and stable IDs", () => {
    let sequence = 0;
    const artifact = buildQuickResumeArtifact(MODEL_DRAFT, () => `stable-id-${++sequence}`);

    expect(QUICK_RESUME_ARTIFACT_SECTION).toBe("quick_resume_draft_v1");
    expect(artifact).toMatchObject({
      version: 3,
      revision: 1,
      targetTitle: "Operations Supervisor",
      honestStretchNote: "Confirm direct production-planning ownership before applying.",
      coreSkills: ["Team Leadership", "Safety Compliance", "Scheduling"],
    });
    expect(artifact.jobs[0]).toMatchObject({
      id: "stable-id-1",
      title: "Shift Lead",
      company: "Grocery Warehouse",
      dateLabel: "2019 - 2023",
    });
    expect(artifact.jobs[0].bullets[0]).toEqual({
      id: "stable-id-2",
      content: "Led daily shift operations for a warehouse team.",
      contentType: "GENERATED",
    });
    expect(artifact.projects[0]).toEqual({
      id: "stable-id-3",
      name: "Shift Coverage Dashboard",
      description: "Built a dashboard that summarized daily staffing coverage.",
      technologies: ["Excel"],
      url: "",
    });
    expect(JSON.stringify(artifact)).not.toContain("startDate");
    expect(parseQuickResumeArtifact(JSON.stringify(artifact))).toEqual(artifact);
  });

  it("migrates a valid v1 artifact to v3 using the supplied target-title fallback", () => {
    const legacyArtifact = {
      version: 1,
      coreSkills: ["Team Leadership", "Safety Compliance", "Scheduling"],
      jobs: [{
        id: "job-1",
        title: "Shift Lead",
        company: "Grocery Warehouse",
        location: "Indianapolis, IN",
        dateLabel: "2019 - 2023",
        bullets: [{ id: "bullet-1", content: "Led daily shift operations." }],
      }],
      education: [],
      certifications: [],
    };

    expect(parseQuickResumeArtifact(
      JSON.stringify(legacyArtifact),
      "Production Planning Supervisor"
    )).toEqual({
      ...legacyArtifact,
      version: 3,
      revision: 1,
      targetTitle: "Production Planning Supervisor",
      honestStretchNote: "",
      projects: [],
      jobs: [{
        ...legacyArtifact.jobs[0],
        bullets: [{
          ...legacyArtifact.jobs[0].bullets[0],
          contentType: "GENERATED",
        }],
      }],
    });
    expect(parseQuickResumeArtifact(JSON.stringify(legacyArtifact))).toBeNull();
  });

  it("migrates saved v2 artifacts to v3 without damaging existing resumes", () => {
    let sequence = 0;
    const current = buildQuickResumeArtifact(MODEL_DRAFT, () => `id-${++sequence}`);
    const legacyV2 = { ...current, version: 2, projects: undefined };
    delete legacyV2.projects;

    expect(parseQuickResumeArtifact(JSON.stringify(legacyV2))).toEqual({
      ...legacyV2,
      version: 3,
      projects: [],
    });
  });

  it("updates only the selected bullet at the expected revision and records user provenance", () => {
    let sequence = 0;
    const artifact = buildQuickResumeArtifact(MODEL_DRAFT, () => `id-${++sequence}`);
    const bulletId = artifact.jobs[0].bullets[0].id;
    const updated = updateQuickResumeArtifactBullet(
      artifact,
      bulletId,
      "Coordinated daily shift operations and safety checks.",
      1
    );

    expect(updated.revision).toBe(2);
    expect(updated.jobs[0].bullets[0]).toEqual({
      id: bulletId,
      content: "Coordinated daily shift operations and safety checks.",
      contentType: "USER_EDITED",
    });
    expect(artifact.revision).toBe(1);
    expect(artifact.jobs[0].bullets[0]).toEqual({
      id: bulletId,
      content: "Led daily shift operations for a warehouse team.",
      contentType: "GENERATED",
    });
    expect(() => updateQuickResumeArtifactBullet(updated, bulletId, "Stale edit", 1))
      .toThrow(/revision/i);
    expect(() => updateQuickResumeArtifactBullet(updated, "missing", "New text", 2))
      .toThrow(/not found/i);
  });

  it("accepts the shared editor bullet limit and rejects content beyond it", () => {
    let sequence = 0;
    const artifact = buildQuickResumeArtifact(MODEL_DRAFT, () => `id-${++sequence}`);
    const bulletId = artifact.jobs[0].bullets[0].id;

    const updated = updateQuickResumeArtifactBullet(
      artifact,
      bulletId,
      "A".repeat(MAX_EDITOR_BULLET_LENGTH),
      artifact.revision
    );
    expect(updated.jobs[0].bullets[0].content).toHaveLength(MAX_EDITOR_BULLET_LENGTH);
    expect(() => updateQuickResumeArtifactBullet(
      artifact,
      bulletId,
      "A".repeat(MAX_EDITOR_BULLET_LENGTH + 1),
      artifact.revision
    )).toThrow();
  });

  it("requires at least three core skills in persisted and migrated artifacts", () => {
    let sequence = 0;
    expect(() => buildQuickResumeArtifact(
      { ...MODEL_DRAFT, coreSkills: ["Scheduling", "Safety"] },
      () => `id-${++sequence}`
    )).toThrow();

    const invalidLegacyArtifact = {
      version: 1,
      coreSkills: ["Scheduling", "Safety"],
      jobs: [{
        id: "job-1",
        title: "Shift Lead",
        company: "Grocery Warehouse",
        location: "",
        dateLabel: "",
        bullets: [{ id: "bullet-1", content: "Led daily shift operations." }],
      }],
      education: [],
      certifications: [],
    };
    expect(parseQuickResumeArtifact(
      JSON.stringify(invalidLegacyArtifact),
      "Operations Supervisor"
    )).toBeNull();
  });

  it("rejects duplicate stable IDs across jobs, bullets, education, and certifications", () => {
    let sequence = 0;
    const artifact = buildQuickResumeArtifact(MODEL_DRAFT, () => `id-${++sequence}`);
    artifact.certifications[0].id = artifact.jobs[0].id;

    expect(parseQuickResumeArtifact(JSON.stringify(artifact))).toBeNull();
  });

  it("repairs generic employer placeholders in saved artifacts for existing users", () => {
    let sequence = 0;
    const artifact = buildQuickResumeArtifact(
      {
        ...MODEL_DRAFT,
        experience: [{
          ...MODEL_DRAFT.experience[0],
          company: "Previous Employer",
        }],
      },
      () => `id-${++sequence}`
    );

    expect(parseQuickResumeArtifact(JSON.stringify(artifact))?.jobs[0].company).toBe("");
  });

  it("rejects malformed and unsupported artifact versions", () => {
    expect(parseQuickResumeArtifact('{"version":4,"jobs":[]}')).toBeNull();
    expect(parseQuickResumeArtifact("not json")).toBeNull();
  });
});
