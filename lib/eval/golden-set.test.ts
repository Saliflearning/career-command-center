import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  hasIndependentAcceptedFinal,
  loadGoldenTriples,
  type GoldenTriple,
} from "./golden-set";

function fixture(overrides: Partial<GoldenTriple> = {}): GoldenTriple {
  return {
    id: "ops-001",
    track: "operations",
    sourceResumeText: "source ".repeat(40),
    jobDescription: "job ".repeat(50),
    acceptedFinalText: "accepted ".repeat(30),
    holdout: true,
    ...overrides,
  };
}

describe("golden set provenance", () => {
  it("labels private and committed triples without changing their content", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "golden-set-"));
    const track = path.join(root, "operations");
    fs.mkdirSync(track);
    fs.writeFileSync(path.join(track, "private.triple.local.json"), JSON.stringify(fixture()));
    fs.writeFileSync(
      path.join(track, "public.triple.json"),
      JSON.stringify(fixture({ id: "ops-002" }))
    );

    try {
      const result = loadGoldenTriples(root);
      expect(result.errors).toEqual([]);
      expect(result.triples.map((item) => item.provenance).sort()).toEqual([
        "committed",
        "private-local",
      ]);
      expect(result.triples[0].sourceResumeText).toContain("source");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not call a copied source resume an independent accepted final", () => {
    const copied = fixture({ acceptedFinalText: "source ".repeat(40) });
    expect(hasIndependentAcceptedFinal(copied)).toBe(false);
    expect(hasIndependentAcceptedFinal(fixture())).toBe(true);
  });
});
