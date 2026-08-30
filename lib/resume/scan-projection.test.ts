import {
  completedEvidenceTerms,
  projectAlignmentScores,
  type EvidenceConfirmation,
  type ProjectionRequirement,
} from "./scan-projection";

const requirements: ProjectionRequirement[] = [
  {
    term: "IT analyst",
    importance: "critical",
    kind: "role",
    status: "missing",
    weight: 5,
  },
  {
    term: "Oracle SQL",
    importance: "important",
    kind: "named",
    status: "missing",
    weight: 3,
  },
  {
    term: "documentation",
    importance: "supporting",
    kind: "word",
    status: "matched",
    weight: 1,
  },
];

describe("projectAlignmentScores", () => {
  it("reproduces the weighted baseline without confirmations", () => {
    expect(projectAlignmentScores(requirements, [])).toEqual({
      score: 4,
      keywordScore: 11,
      signalScore: 0,
      matchedCount: 1,
      missingCount: 2,
    });
  });

  it("projects only explicitly completed evidence terms", () => {
    expect(projectAlignmentScores(requirements, ["Oracle SQL"])).toEqual({
      score: 40,
      keywordScore: 44,
      signalScore: 38,
      matchedCount: 2,
      missingCount: 1,
    });
  });

  it("ignores unknown terms and does not mutate the scanned requirements", () => {
    const original = structuredClone(requirements);

    expect(projectAlignmentScores(requirements, ["made up skill"]).score).toBe(4);
    expect(requirements).toEqual(original);
  });
});

describe("completedEvidenceTerms", () => {
  const confirmation = (overrides: Partial<EvidenceConfirmation>): EvidenceConfirmation => ({
    decision: "confirmed",
    context: "Blue Ridge Technology application support role",
    example: "Created Oracle SQL reports used during payroll release testing.",
    ...overrides,
  });

  it("does not accept a bare yes as projected evidence", () => {
    expect(completedEvidenceTerms({
      "Oracle SQL": confirmation({ context: "", example: "" }),
    })).toEqual([]);
  });

  it("requires both source context and a concrete example", () => {
    expect(completedEvidenceTerms({
      "Oracle SQL": confirmation({ example: "Used it." }),
      "Oracle HCM": confirmation({ context: "" }),
    })).toEqual([]);
  });

  it("returns only truthful, complete confirmations", () => {
    expect(completedEvidenceTerms({
      "Oracle SQL": confirmation({}),
      "Oracle HCM": confirmation({ decision: "not_experienced" }),
      Payroll: confirmation({ decision: "unsure" }),
    })).toEqual(["Oracle SQL"]);
  });
});

