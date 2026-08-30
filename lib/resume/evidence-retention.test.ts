import { extractMetricTokens, retainQuantifiedSourceEvidence } from "./evidence-retention";

describe("metric token extraction", () => {
  it("extracts source metrics even when bullet metadata is absent", () => {
    expect(
      extractMetricTokens("Led 75+ associates and reduced defects by 28% across 3 sites.")
    ).toEqual(["75+", "28%", "3"]);
  });
});

describe("quantified source evidence retention", () => {
  it("does not change generated bullets when all source metrics remain", () => {
    const generated = [
      "Led 100 associates across inbound operations.",
      "Reduced weekly defects by 28% through workflow analysis.",
    ];

    expect(
      retainQuantifiedSourceEvidence(
        ["Led 100 associates and reduced weekly defects by 28%."],
        generated,
        3
      )
    ).toEqual({ bullets: generated, restored: [] });
  });

  it("treats written and symbolic percentages as the same fact", () => {
    const generated = [
      "Decreased order defects by 18% through root-cause analysis.",
    ];

    expect(
      retainQuantifiedSourceEvidence(
        ["Reduced order defects by 18 percent through standard work."],
        generated,
        4
      )
    ).toEqual({ bullets: generated, restored: [] });
  });

  it("never adds unquantified source wording", () => {
    const generated = ["Coordinated daily warehouse reporting."];

    expect(
      retainQuantifiedSourceEvidence(
        ["Supported routine team meetings."],
        generated,
        3
      )
    ).toEqual({ bullets: generated, restored: [] });
  });

  it("keeps the bullet budget while restoring the strongest missing proof", () => {
    const source = [
      "Led 100 associates across inbound operations.",
      "Reduced weekly defects by 28% through root-cause analysis.",
    ];
    const generated = [
      "Coordinated daily operations across a distribution site.",
      "Reviewed workflows with cross-functional partners.",
    ];

    const result = retainQuantifiedSourceEvidence(source, generated, 2);

    expect(result.bullets).toHaveLength(2);
    expect(result.bullets).toEqual(expect.arrayContaining(source));
    expect(result.restored).toEqual(expect.arrayContaining(source));
  });

  it("preserves source-proven JD language without inventing new evidence", () => {
    const source = [
      "Tracked key performance indicators and maintained safety compliance for daily operations.",
      "Coordinated routine team meetings.",
    ];
    const generated = [
      "Coordinated daily workflows across the operations team.",
      "Prepared recurring status updates for leadership.",
    ];

    const result = retainQuantifiedSourceEvidence(
      source,
      generated,
      2,
      "Track performance indicators and uphold safety regulations."
    );

    expect(result.bullets).toContain(source[0]);
    expect(result.bullets).toHaveLength(2);
    expect(result.restored).toEqual([source[0]]);
  });

  it("does not restore source language that is unrelated to the target job", () => {
    const generated = ["Built cloud deployment automation with AWS."];
    expect(
      retainQuantifiedSourceEvidence(
        ["Coordinated routine team meetings."],
        generated,
        1,
        "Design AWS cloud infrastructure and deployment automation."
      )
    ).toEqual({ bullets: generated, restored: [] });
  });
});
