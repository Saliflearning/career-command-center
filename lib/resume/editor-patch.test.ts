import {
  extractEditorMetrics,
  MAX_EDITOR_BULLET_LENGTH,
  parseResumeEditorPatch,
  ResumeEditorPatchError,
} from "./editor-patch";

describe("parseResumeEditorPatch", () => {
  it("normalizes a manual bullet update", () => {
    expect(parseResumeEditorPatch({
      type: "bullet",
      bulletId: " bullet-1 ",
      content: "  Built   reports and reduced effort by 35%. ",
      expectedRevision: 4,
    })).toEqual({
      type: "bullet",
      bulletId: "bullet-1",
      content: "Built reports and reduced effort by 35%.",
      expectedRevision: 4,
    });
  });

  it("normalizes a summary update", () => {
    expect(parseResumeEditorPatch({
      type: "summary",
      content: "  Operations analyst\nwith reporting experience. ",
      expectedRevision: 2,
    })).toEqual({
      type: "summary",
      content: "Operations analyst with reporting experience.",
      expectedRevision: 2,
    });
  });

  it("normalizes document presentation preferences", () => {
    expect(parseResumeEditorPatch({
      type: "presentation",
      presentation: { font: "serif", scale: "large", density: "open" },
      expectedRevision: 7,
    })).toEqual({
      type: "presentation",
      presentation: { font: "serif", scale: "large", density: "open" },
      expectedRevision: 7,
    });
  });

  it("rejects missing identifiers, empty content, and oversized content", () => {
    expect(() => parseResumeEditorPatch({ type: "bullet", content: "Text" }))
      .toThrow(ResumeEditorPatchError);
    expect(() => parseResumeEditorPatch({ type: "summary", content: "   " }))
      .toThrow("Content is required");
    expect(() => parseResumeEditorPatch({
      type: "bullet",
      bulletId: "bullet-1",
      content: "x".repeat(MAX_EDITOR_BULLET_LENGTH + 1),
      expectedRevision: 1,
    })).toThrow(`Content must be ${MAX_EDITOR_BULLET_LENGTH} characters or fewer`);
    expect(() => parseResumeEditorPatch({
      type: "summary",
      content: "Valid summary",
    })).toThrow("expectedRevision is required");
  });
});

describe("extractEditorMetrics", () => {
  it("keeps quantified evidence attached to a user edit", () => {
    expect(extractEditorMetrics("Reduced effort by 35% across 3 teams and saved $20k."))
      .toEqual(["35%", "3", "$20k"]);
  });
});
