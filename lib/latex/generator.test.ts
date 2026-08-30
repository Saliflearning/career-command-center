import { escapeLatexText } from "./generator";

describe("LaTeX text escaping", () => {
  it("escapes every reserved character in one pass without re-escaping output", () => {
    expect(escapeLatexText("\\ & % $ # _ ^ { } ~")).toBe(
      "\\textbackslash{} \\& \\% \\$ \\# \\_ \\^{} \\{ \\} \\textasciitilde{}"
    );
  });

  it("escapes repeated metacharacters and normalizes common resume punctuation", () => {
    expect(escapeLatexText(`A&B&C — ‘safe’ – “quoted”`)).toBe(
      "A\\&B\\&C --- `safe' -- ``quoted''"
    );
  });
});
