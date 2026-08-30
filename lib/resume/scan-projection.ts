export const MIN_EVIDENCE_CONTEXT_CHARS = 3;
export const MIN_EVIDENCE_EXAMPLE_CHARS = 20;

export type ProjectionRequirement = {
  term: string;
  importance: "critical" | "important" | "supporting";
  kind: "role" | "phrase" | "named" | "word";
  status: "matched" | "missing";
  weight: number;
};

export type EvidenceDecision =
  | "unanswered"
  | "confirmed"
  | "not_experienced"
  | "unsure";

export type EvidenceConfirmation = {
  decision: EvidenceDecision;
  context: string;
  example: string;
};

export type AlignmentProjection = {
  score: number;
  keywordScore: number;
  signalScore: number;
  matchedCount: number;
  missingCount: number;
};

export function completedEvidenceTerms(
  confirmations: Record<string, EvidenceConfirmation>,
): string[] {
  return Object.entries(confirmations)
    .filter(([, confirmation]) =>
      confirmation.decision === "confirmed" &&
      confirmation.context.trim().length >= MIN_EVIDENCE_CONTEXT_CHARS &&
      confirmation.example.trim().length >= MIN_EVIDENCE_EXAMPLE_CHARS
    )
    .map(([term]) => term);
}

export function projectAlignmentScores(
  requirements: ProjectionRequirement[],
  confirmedTerms: string[],
): AlignmentProjection {
  const confirmed = new Set(confirmedTerms.map((term) => normalizeTerm(term)));
  const matched = requirements.filter((requirement) =>
    requirement.status === "matched" || confirmed.has(normalizeTerm(requirement.term))
  );
  const highSignal = requirements.filter(isHighSignalRequirement);
  const highSignalMatched = highSignal.filter((requirement) =>
    requirement.status === "matched" || confirmed.has(normalizeTerm(requirement.term))
  );
  const keywordScore = weightedCoverageScore(matched, requirements);
  const signalScore = highSignal.length
    ? weightedCoverageScore(highSignalMatched, highSignal)
    : keywordScore;

  return {
    score: clampScore(keywordScore * 0.4 + signalScore * 0.6),
    keywordScore,
    signalScore,
    matchedCount: matched.length,
    missingCount: Math.max(0, requirements.length - matched.length),
  };
}

function normalizeTerm(term: string) {
  return term.trim().toLowerCase();
}

function isHighSignalRequirement(requirement: ProjectionRequirement) {
  return requirement.importance !== "supporting" || requirement.kind !== "word";
}

function weightedCoverageScore(
  matched: Array<Pick<ProjectionRequirement, "weight">>,
  all: Array<Pick<ProjectionRequirement, "weight">>,
) {
  const possible = all.reduce((sum, item) => sum + item.weight, 0);
  if (possible === 0) return 0;
  const earned = matched.reduce((sum, item) => sum + item.weight, 0);
  return clampScore((earned / possible) * 100);
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

