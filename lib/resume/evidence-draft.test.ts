import { buildConfirmedEvidence, updateEvidenceDraft } from "./evidence-draft";

describe("evidence draft answers", () => {
  it("confirms Yes inline without changing unrelated answers", () => {
    const current = {
      Python: { confirmed: false, source: "", details: "" },
      SQL: {
        confirmed: true,
        source: "Acme - Operations Analyst",
        details: "Used SQL for weekly reporting.",
      },
    };

    const next = updateEvidenceDraft(current, "Python", { confirmed: true });

    expect(next.Python).toEqual({ confirmed: true, source: "", details: "" });
    expect(next.SQL).toEqual(current.SQL);
    expect(current.Python.confirmed).toBe(false);
  });

  it("keeps truthful details while the answer remains confirmed", () => {
    const confirmed = updateEvidenceDraft({}, "Python", { confirmed: true });
    const detailed = updateEvidenceDraft(confirmed, "Python", {
      details: "Built a reporting script for an operations review.",
    });

    expect(detailed.Python).toEqual({
      confirmed: true,
      source: "",
      details: "Built a reporting script for an operations review.",
    });
  });

  it("clears details when the user answers Not yet", () => {
    const current = {
      Python: {
        confirmed: true,
        source: "Acme - Operations Analyst",
        details: "Built a reporting script for an operations review.",
      },
    };

    expect(updateEvidenceDraft(current, "Python", { confirmed: false }).Python).toEqual({
      confirmed: false,
      source: "",
      details: "",
    });
  });

  it("returns an empty replacement payload after every answer becomes Not yet", () => {
    const confirmed = {
      Python: {
        confirmed: true,
        source: "Acme - Operations Analyst",
        details: "Built a reporting script for an operations review.",
      },
    };
    const cleared = updateEvidenceDraft(confirmed, "Python", {
      confirmed: false,
    });

    expect(
      buildConfirmedEvidence(cleared, [
        { term: "Python", category: "Technical skill" },
      ])
    ).toEqual([]);
  });

  it("normalizes confirmed details into the persistence payload", () => {
    expect(
      buildConfirmedEvidence(
        {
          Python: {
            confirmed: true,
            source: "  Acme - Operations Analyst  ",
            details: "  Built a reporting script for an operations review.  ",
          },
        },
        [{ term: "Python", category: "Technical skill" }]
      )
    ).toEqual([
      {
        term: "Python",
        category: "Technical skill",
        source: "Acme - Operations Analyst",
        details: "Built a reporting script for an operations review.",
      },
    ]);
  });

  it("does not persist evidence without an attributable employer and role", () => {
    expect(
      buildConfirmedEvidence(
        {
          Python: {
            confirmed: true,
            source: "",
            details: "Built a reporting script for an operations review.",
          },
        },
        [{ term: "Python", category: "Technical skill" }]
      )
    ).toEqual([]);
  });
});
