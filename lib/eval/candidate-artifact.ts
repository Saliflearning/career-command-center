import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

import type { GoldenTriple } from "@/lib/eval/golden-set";

export const CANDIDATE_ARTIFACT_SCHEMA_VERSION = 1;

const COMPLETED_PIPELINE_STATES = new Set([
  "QA_REVIEWED",
  "USER_EDITING",
  "EXPORTED",
  "TRACKED",
]);

export interface CandidateArtifact {
  schemaVersion: 1;
  generator: "career-command-pipeline";
  tripleId: string;
  resumeId: string;
  pipelineState: string;
  generatedAt: string;
  sourceSha256: string;
  jobDescriptionSha256: string;
  candidateText: string;
}

export interface CandidateArtifactLoadResult {
  artifact: CandidateArtifact | null;
  error: string | null;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function candidateArtifactFilename(tripleId: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(tripleId)) {
    throw new Error(`unsafe triple id: ${tripleId}`);
  }
  return `${tripleId}.candidate.local.json`;
}

function isCandidateArtifact(value: unknown): value is CandidateArtifact {
  const item = value as CandidateArtifact;
  return (
    !!item &&
    item.schemaVersion === CANDIDATE_ARTIFACT_SCHEMA_VERSION &&
    item.generator === "career-command-pipeline" &&
    typeof item.tripleId === "string" &&
    typeof item.resumeId === "string" &&
    typeof item.pipelineState === "string" &&
    typeof item.generatedAt === "string" &&
    typeof item.sourceSha256 === "string" &&
    typeof item.jobDescriptionSha256 === "string" &&
    typeof item.candidateText === "string"
  );
}

/**
 * Load a candidate produced by the real product pipeline. The source and JD
 * fingerprints prevent stale or cross-triple artifacts from being scored.
 * Candidate files belong under an ignored directory such as tmp/.
 */
export function loadCandidateArtifact(
  candidateDir: string,
  triple: GoldenTriple
): CandidateArtifactLoadResult {
  let filename: string;
  try {
    filename = candidateArtifactFilename(triple.id);
  } catch (error) {
    return {
      artifact: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const artifactPath = path.resolve(candidateDir, filename);
  if (!fs.existsSync(artifactPath)) {
    return { artifact: null, error: `missing candidate artifact for ${triple.id}` };
  }

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    if (!isCandidateArtifact(parsed)) {
      return { artifact: null, error: `${triple.id}: invalid candidate artifact shape` };
    }
    if (parsed.tripleId !== triple.id) {
      return { artifact: null, error: `${triple.id}: candidate triple id mismatch` };
    }
    if (!parsed.resumeId.trim()) {
      return { artifact: null, error: `${triple.id}: candidate has no pipeline resume id` };
    }
    if (!COMPLETED_PIPELINE_STATES.has(parsed.pipelineState)) {
      return {
        artifact: null,
        error: `${triple.id}: pipeline state ${parsed.pipelineState} is not complete`,
      };
    }
    if (Number.isNaN(Date.parse(parsed.generatedAt))) {
      return { artifact: null, error: `${triple.id}: invalid generation timestamp` };
    }
    if (parsed.candidateText.trim().length < 200) {
      return { artifact: null, error: `${triple.id}: candidate text is incomplete` };
    }
    if (parsed.sourceSha256 !== sha256Text(triple.sourceResumeText)) {
      return { artifact: null, error: `${triple.id}: source fingerprint mismatch` };
    }
    if (parsed.jobDescriptionSha256 !== sha256Text(triple.jobDescription)) {
      return { artifact: null, error: `${triple.id}: job-description fingerprint mismatch` };
    }
    return { artifact: parsed, error: null };
  } catch (error) {
    return {
      artifact: null,
      error: `${triple.id}: ${error instanceof Error ? error.message : "unreadable candidate"}`,
    };
  }
}
