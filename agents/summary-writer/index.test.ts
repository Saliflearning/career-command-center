import { route } from "@/lib/ai/router";
import { runSummaryWriter, sanitizeSummaryText } from "@/agents/summary-writer";

jest.mock("@/lib/ai/router", () => ({ route: jest.fn() }));

const mockedRoute = route as jest.MockedFunction<typeof route>;

describe("summary writer language guard", () => {
  it("removes every banned phrase and em dash from generated prose", () => {
    expect(sanitizeSummaryText(
      "A dynamic, results-driven leader responsible for innovative work — with teams."
    )).toBe("A leader managing practical work - with teams.");
  });

  it("sanitizes the model response before returning it", async () => {
    mockedRoute.mockResolvedValue({
      content: "Dynamic operations leader responsible for results-driven teams.",
      provider: "openai",
      tokensUsed: 20,
      usedFallback: false,
    });

    const output = await runSummaryWriter(
      "resume-1",
      {
        userId: "user-1",
        version: 1,
        jobs: [],
        skills: [],
        education: [],
        certifications: [],
        projects: [],
      } as never,
      {
        targetRole: "Operations Manager",
        targetCompany: null,
        seniorityLevel: "senior",
        summaryForUser: "Lead operations",
      } as never,
      { summaryGuidance: "Focus on operations" } as never
    );

    expect(output.summaryText.toLowerCase()).not.toContain("dynamic");
    expect(output.summaryText.toLowerCase()).not.toContain("results-driven");
    expect(output.summaryText.toLowerCase()).not.toContain("responsible for");
  });

  it("replaces generic career-intent phrasing with direct value language", () => {
    expect(sanitizeSummaryText(
      "Operations leader. Looking to leverage KPI experience in a planning role."
    )).toBe("Operations leader. Brings KPI experience in a planning role.");
  });

  it("removes poised-to-apply career intent from generated summaries", () => {
    expect(sanitizeSummaryText(
      "Operations leader. Poised to apply analytical skills in production planning."
    )).toBe("Operations leader. Brings analytical skills in production planning.");
  });
});
