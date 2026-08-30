import { buildResumeLibrarySummary } from "./library-summary";

describe("buildResumeLibrarySummary", () => {
  it("calculates a weighted average across persisted score groups", () => {
    expect(buildResumeLibrarySummary([
      { average: 90, count: 1 },
      { average: 70, count: 1 },
    ], 12, 4)).toEqual({
      totalResumes: 12,
      totalApplications: 4,
      averageMatchScore: 80,
      scoredResumeCount: 2,
    });
  });

  it("weights larger score groups correctly", () => {
    expect(buildResumeLibrarySummary([
      { average: 90, count: 3 },
      { average: 60, count: 1 },
    ], 6, 26)).toMatchObject({
      averageMatchScore: 83,
      scoredResumeCount: 4,
    });
  });

  it("returns no average when no persisted score exists", () => {
    expect(buildResumeLibrarySummary([
      { average: null, count: 0 },
    ], 1, 0)).toEqual({
      totalResumes: 1,
      totalApplications: 0,
      averageMatchScore: null,
      scoredResumeCount: 0,
    });
  });
});
