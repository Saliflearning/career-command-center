import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  candidateArtifactFilename,
  loadCandidateArtifact,
  sha256Text,
  type CandidateArtifact,
} from "./candidate-artifact";
import type { GoldenTriple } from "./golden-set";

const triple: GoldenTriple = {
  id: "operations-example-001",
  track: "operations",
  sourceResumeText: "SOURCE ".repeat(40),
  jobDescription: "JOB DESCRIPTION ".repeat(30),
  acceptedFinalText: "ACCEPTED ".repeat(30),
  holdout: true,
};

function artifact(overrides: Partial<CandidateArtifact> = {}): CandidateArtifact {
  return {
    schemaVersion: 1,
    generator: "career-command-pipeline",
    tripleId: triple.id,
    resumeId: "resume-123",
    pipelineState: "USER_EDITING",
    generatedAt: "2026-07-18T12:00:00.000Z",
    sourceSha256: sha256Text(triple.sourceResumeText),
    jobDescriptionSha256: sha256Text(triple.jobDescription),
    candidateText: "CANDIDATE ".repeat(30),
    ...overrides,
  };
}

function writeArtifact(dir: string, value: unknown) {
  fs.writeFileSync(
    path.join(dir, candidateArtifactFilename(triple.id)),
    JSON.stringify(value),
    "utf8"
  );
}

describe("candidate artifact validation", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-artifact-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a completed pipeline artifact tied to the same source and JD", () => {
    writeArtifact(dir, artifact());
    const result = loadCandidateArtifact(dir, triple);
    expect(result.error).toBeNull();
    expect(result.artifact?.resumeId).toBe("resume-123");
  });

  it("rejects a stale artifact from another source", () => {
    writeArtifact(dir, artifact({ sourceSha256: sha256Text("different source") }));
    expect(loadCandidateArtifact(dir, triple).error).toContain("source fingerprint mismatch");
  });

  it("rejects a candidate before the pipeline reaches a completed state", () => {
    writeArtifact(dir, artifact({ pipelineState: "GENERATING" }));
    expect(loadCandidateArtifact(dir, triple).error).toContain("is not complete");
  });

  it("rejects unsafe triple ids before resolving a path", () => {
    expect(() => candidateArtifactFilename("../escape")).toThrow("unsafe triple id");
  });
});
