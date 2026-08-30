import {
  DEFAULT_RESUME_PRESENTATION,
  parseResumePresentation,
  serializeResumePresentation,
} from "./presentation";

describe("resume presentation", () => {
  it("normalizes a valid saved presentation", () => {
    expect(parseResumePresentation({
      font: "serif",
      scale: "large",
      density: "open",
    })).toEqual({ font: "serif", scale: "large", density: "open" });
  });

  it("falls back field-by-field for invalid or legacy values", () => {
    expect(parseResumePresentation(JSON.stringify({
      font: "comic-sans",
      scale: "compact",
      density: "unknown",
    }))).toEqual({
      font: DEFAULT_RESUME_PRESENTATION.font,
      scale: "compact",
      density: DEFAULT_RESUME_PRESENTATION.density,
    });
    expect(parseResumePresentation("not-json")).toEqual(DEFAULT_RESUME_PRESENTATION);
  });

  it("serializes only the validated presentation contract", () => {
    expect(serializeResumePresentation({
      font: "system",
      scale: "normal",
      density: "tight",
    })).toBe('{"font":"system","scale":"normal","density":"tight"}');
  });
});
