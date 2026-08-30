import {
  clampScore,
  scoreColor,
  scoreLabel,
  scoreDelta,
  isDraftReadableState,
  SCORE_BANDS,
} from "./score-presentation";

describe("clampScore", () => {
  it("clamps into [0,100] and rounds", () => {
    expect(clampScore(-20)).toBe(0);
    expect(clampScore(120)).toBe(100);
    expect(clampScore(61.6)).toBe(62);
  });
});

describe("scoreLabel band boundaries", () => {
  it("labels each band at its exact threshold", () => {
    expect(scoreLabel(SCORE_BANDS.strong)).toBe("Strong");
    expect(scoreLabel(SCORE_BANDS.good)).toBe("Solid");
    expect(scoreLabel(SCORE_BANDS.needsFocus)).toBe("Needs improvement");
    expect(scoreLabel(SCORE_BANDS.needsFocus - 1)).toBe("Limited");
  });

  it("does not label a failing score as any kind of fit", () => {
    expect(scoreLabel(0)).toBe("Limited");
    expect(scoreLabel(39)).toBe("Limited");
  });
});

describe("scoreColor", () => {
  it("renders an unknown score as neutral, never as a pass colour", () => {
    expect(scoreColor(null, false)).toBe("#C6C6CD");
    expect(scoreColor(null, true)).toBe("#C6C6CD");
  });

  it("uses the error colour below the lowest band", () => {
    expect(scoreColor(10, false)).toBe("#BA1A1A");
  });

  it("only varies on accent within the good band", () => {
    expect(scoreColor(60, true)).toBe("#2170E4");
    expect(scoreColor(60, false)).toBe("#0058BE");
    // Strong band ignores accent.
    expect(scoreColor(90, true)).toBe(scoreColor(90, false));
  });
});

describe("scoreDelta", () => {
  it("returns null when either side is unknown", () => {
    expect(scoreDelta(null, 50)).toBeNull();
    expect(scoreDelta(50, null)).toBeNull();
  });

  it("reports signed movement", () => {
    expect(scoreDelta(40, 65)).toBe(25);
    expect(scoreDelta(65, 40)).toBe(-25);
  });
});

describe("isDraftReadableState", () => {
  it("allows only post-QA states", () => {
    expect(isDraftReadableState("QA_REVIEWED")).toBe(true);
    expect(isDraftReadableState("EXPORTED")).toBe(true);
  });

  it("refuses to show a draft mid-pipeline or on failure", () => {
    for (const state of ["UPLOADED", "PARSED", "GENERATING", "FAILED"]) {
      expect(isDraftReadableState(state)).toBe(false);
    }
  });
});
