export const MATCH_SCORE_BANDS = {
  strong: 80,
  moderate: 60,
  partial: 40,
} as const;

export function matchScoreLabel(score: number): string {
  if (score >= MATCH_SCORE_BANDS.strong) return "Strong alignment";
  if (score >= MATCH_SCORE_BANDS.moderate) return "Moderate alignment";
  if (score >= MATCH_SCORE_BANDS.partial) return "Partial alignment";
  return "Limited alignment";
}
