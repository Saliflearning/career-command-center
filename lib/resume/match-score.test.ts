import { MATCH_SCORE_BANDS, matchScoreLabel } from "./match-score";

describe("match score bands", () => {
  it("uses one shared set of alignment thresholds", () => {
    expect(matchScoreLabel(MATCH_SCORE_BANDS.strong)).toBe("Strong alignment");
    expect(matchScoreLabel(MATCH_SCORE_BANDS.moderate)).toBe("Moderate alignment");
    expect(matchScoreLabel(MATCH_SCORE_BANDS.partial)).toBe("Partial alignment");
    expect(matchScoreLabel(MATCH_SCORE_BANDS.partial - 1)).toBe("Limited alignment");
  });
});
