import {
  formatTeachingContext,
  loadTeachingContext,
  parseTeachingExample,
  rankTeachingExamples,
  type TeachingExamplePayload,
} from "./teaching-examples";

const mockFindMany = jest.fn();
jest.mock("@/lib/db/client", () => ({
  db: { resume: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

function example(overrides: Partial<TeachingExamplePayload> = {}): TeachingExamplePayload {
  return {
    schemaVersion: 1,
    resumeId: "resume-1",
    userId: "user-1",
    approvedAt: "2026-07-15T00:00:00.000Z",
    targetRole: "Senior Operations Manager",
    targetCompany: "Example Co",
    jdText: "Own warehouse operations and WMS reporting.",
    jobKeywords: ["warehouse", "WMS", "throughput"],
    sourceSnapshot: { jobs: [] },
    finalResume: {
      summary: "Operations leader focused on warehouse performance.",
      experience: [{
        title: "Operations Lead",
        company: "Source Employer",
        bullets: ["Improved a verified operating process."],
      }],
      skills: [{ name: "WMS", category: "Tools" }],
      education: [],
      certifications: [],
    },
    engine: { resumeVersion: 1, state: "USER_EDITING" },
    ...overrides,
  };
}

describe("teaching examples", () => {
  it("rejects incomplete or malformed payloads", () => {
    expect(parseTeachingExample("not-json")).toBeNull();
    expect(parseTeachingExample(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
  });

  it("ranks relevant examples and omits unrelated examples", () => {
    const relevant = example();
    const unrelated = example({
      resumeId: "resume-2",
      targetRole: "UX Designer",
      jobKeywords: ["figma", "prototype", "research"],
    });
    const ranked = rankTeachingExamples(
      [unrelated, relevant],
      "Operations Manager",
      ["warehouse", "WMS", "throughput"]
    );
    expect(ranked.map((item) => item.example.resumeId)).toEqual(["resume-1"]);
  });

  it("labels approved examples as style references rather than evidence", () => {
    const context = formatTeachingContext([{ example: example(), score: 0.8 }]);
    expect(context).toContain("NOT evidence");
    expect(context).toContain("Never copy a fact, metric, skill, title, employer, or date");
    expect(context).toContain("Improved a verified operating process.");
  });

  it("never breaks generation when optional personalization cannot load", async () => {
    mockFindMany.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(loadTeachingContext("user-1", "Operations Manager", ["warehouse"]))
      .resolves.toBe("");
  });
});
