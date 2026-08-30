const mockRoute = jest.fn();
const mockFetchResumeSourceProfile = jest.fn();
const mockWorkHistoryFindUnique = jest.fn();
const mockResumeFindUnique = jest.fn();
const mockBulletCreate = jest.fn();

jest.mock("@/lib/ai/router", () => ({ route: (...args: unknown[]) => mockRoute(...args) }));
jest.mock("@/lib/db/resume-source-profile", () => ({
  fetchResumeSourceProfile: (...args: unknown[]) => mockFetchResumeSourceProfile(...args),
}));
jest.mock("@/lib/db/client", () => ({
  db: {
    workHistory: { findUnique: (...args: unknown[]) => mockWorkHistoryFindUnique(...args) },
    resume: { findUnique: (...args: unknown[]) => mockResumeFindUnique(...args) },
    bullet: { create: (...args: unknown[]) => mockBulletCreate(...args) },
  },
}));

import { runBulletWriter } from "./index";

describe("runBulletWriter source boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkHistoryFindUnique.mockResolvedValue({
      id: "job-source",
      company: "Current Source Company",
      title: "Operations Lead",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: new Date("2024-12-01T00:00:00.000Z"),
      current: false,
      location: "Indianapolis, IN",
      employmentType: "Full-Time",
      bullets: [
        { id: "stale-generated", content: "Owned a $9M budget at another company.", contentType: "GENERATED" },
        { id: "stale-source", content: "Managed an unrelated warehouse.", contentType: "SOURCE" },
      ],
    });
    mockResumeFindUnique.mockResolvedValue({
      targetRole: "Customer Solutions Manager",
      targetCompany: "Target Company",
      jdText: "Guide customer cloud adoption.",
      jdKeywords: ["cloud adoption", "stakeholder management"],
    });
    mockFetchResumeSourceProfile.mockResolvedValue({
      id: "source-profile",
      userId: "user-1",
      jobs: [{
        id: "job-source",
        company: "Current Source Company",
        title: "Operations Lead",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: "2024-12-01T00:00:00.000Z",
        current: false,
        location: "Indianapolis, IN",
        employmentType: "Full-Time",
        bullets: [{
          id: "source-bullet",
          content: "Led 100 associates and reduced weekly defects by 41%.",
          contentType: "SOURCE",
          metrics: ["100", "41%"],
          keywords: [],
          locked: false,
          usedInResumeCount: 0,
        }],
      }],
      education: [],
      skills: [],
      certifications: [],
      projects: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    mockRoute.mockResolvedValue({
      content: JSON.stringify({
        bullets: ["Led 100 associates and reduced weekly defects by 41%."],
        metrics_used: ["100", "41%"],
        keywords_matched: ["leadership"],
        forbidden_words_check: "passed",
        qualifier_rule_check: "passed",
        confidence: 0.98,
        warnings: [],
      }),
      provider: "test",
      tokensUsed: 100,
    });
    mockBulletCreate.mockResolvedValue({ id: "generated-bullet" });
  });

  it("uses only the selected resume's source evidence in the generation prompt", async () => {
    const result = await runBulletWriter("job-source", "resume-1");

    const prompt = mockRoute.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Led 100 associates and reduced weekly defects by 41%.");
    expect(prompt).not.toContain("Owned a $9M budget at another company.");
    expect(prompt).not.toContain("Managed an unrelated warehouse.");
    expect(result.bullets[0].sourceCareerMemoryBulletIds).toEqual(["source-bullet"]);
  });

  it("retains quantified source proof when generated wording drops the metric", async () => {
    mockRoute.mockResolvedValueOnce({
      content: JSON.stringify({
        bullets: [
          "Coordinated daily operations across a high-volume distribution site.",
          "Reviewed workflows with cross-functional partners to improve consistency.",
          "Supported team coaching and operational reporting during peak periods.",
        ],
        metrics_used: [],
        keywords_matched: ["operations"],
        forbidden_words_check: "passed",
        qualifier_rule_check: "passed",
        confidence: 0.9,
        warnings: [],
      }),
      provider: "test",
      tokensUsed: 100,
    });

    const result = await runBulletWriter("job-source", "resume-1", undefined, 3);

    expect(result.bullets).toHaveLength(3);
    expect(result.bullets.map((bullet) => bullet.content)).toContain(
      "Led 100 associates and reduced weekly defects by 41%."
    );
  });
});
