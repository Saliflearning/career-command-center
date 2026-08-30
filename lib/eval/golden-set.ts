// ---------------------------------------------------------------------------
// Golden set loader (BACKLOG P0).
//
// A "triple" is the unit of ground truth for resume quality:
//   source resume text + job description + the ACCEPTED final resume the
//   product owner would actually send. Triples live in training_stack/ as
//   <track>/<name>.triple.json (committed, PII-free synthetic or consented
//   examples) or <name>.triple.local.json (git-ignored, real personal data —
//   never committed; see .gitignore).
//
// The eval harness (lib/eval/harness.ts) scores generated drafts against
// these. specs/personalized-resume-learning Scenario 4 / FR-010 / FR-011.
// ---------------------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";

export interface GoldenTriple {
  /** Stable id, e.g. "ops-dhl-senior-ops-mgr-001". */
  id: string;
  /** Track folder it belongs to: operations | technical | data | ... */
  track: string;
  /** Full plain text of the source resume (the truth boundary). */
  sourceResumeText: string;
  /** Full job description text as pasted by the user. */
  jobDescription: string;
  /**
   * The accepted final resume text — the version the owner would actually
   * send. Empty string means the triple is INCOMPLETE (awaiting the owner);
   * the harness skips edit-distance for it and reports it as pending.
   */
  acceptedFinalText: string;
  /** true = reserved for held-out evaluation; never used as a prompt example. */
  holdout: boolean;
  /** Free-form notes: provenance, caveats. */
  notes?: string;
}

export type GoldenTripleProvenance = "private-local" | "committed";

export interface LoadedGoldenTriple extends GoldenTriple {
  /** How the fixture is stored. Private local files must never be committed. */
  provenance: GoldenTripleProvenance;
  /** Absolute path used only for diagnostics; callers should not print it. */
  sourcePath: string;
}

const TRIPLE_SUFFIXES = [".triple.json", ".triple.local.json"];

function isTriple(value: unknown): value is GoldenTriple {
  const t = value as GoldenTriple;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.track === "string" &&
    typeof t.sourceResumeText === "string" &&
    typeof t.jobDescription === "string" &&
    typeof t.acceptedFinalText === "string" &&
    typeof t.holdout === "boolean"
  );
}

/**
 * Load every triple under the given root (default: training_stack/).
 * Malformed files are reported, not thrown — one bad file must not hide the
 * rest of the set.
 */
export function loadGoldenTriples(
  root = path.join(process.cwd(), "training_stack")
): { triples: LoadedGoldenTriple[]; errors: string[] } {
  const triples: LoadedGoldenTriple[] = [];
  const errors: string[] = [];
  if (!fs.existsSync(root)) return { triples, errors: [`missing root: ${root}`] };

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const trackDir = path.join(root, entry.name);
    for (const file of fs.readdirSync(trackDir)) {
      if (!TRIPLE_SUFFIXES.some((s) => file.endsWith(s))) continue;
      const filePath = path.join(trackDir, file);
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (!isTriple(parsed)) {
          errors.push(`${filePath}: does not match the GoldenTriple shape`);
          continue;
        }
        if (parsed.track !== entry.name) {
          errors.push(`${filePath}: track "${parsed.track}" != folder "${entry.name}"`);
          continue;
        }
        triples.push({
          ...parsed,
          provenance: file.endsWith(".triple.local.json")
            ? "private-local"
            : "committed",
          sourcePath: filePath,
        });
      } catch (e) {
        errors.push(`${filePath}: ${e instanceof Error ? e.message : "unreadable"}`);
      }
    }
  }
  return { triples, errors };
}

export function isComplete(triple: GoldenTriple): boolean {
  return triple.acceptedFinalText.trim().length >= 200;
}

/** True only when the accepted resume is not a copy of the source input. */
export function hasIndependentAcceptedFinal(triple: GoldenTriple): boolean {
  return (
    isComplete(triple) &&
    triple.sourceResumeText.trim() !== triple.acceptedFinalText.trim()
  );
}
