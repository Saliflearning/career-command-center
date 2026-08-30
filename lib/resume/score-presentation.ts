// ---------------------------------------------------------------------------
// Score presentation helpers (QUALITY_AUDIT F3).
//
// Extracted from app/(app)/upload/page.tsx, which had grown past 2500 lines with
// pure logic interleaved with UI. These functions decide what the user is told
// about a quality diagnostic and what colour it is,
// so they deserve to be independently testable rather than buried in a page
// component. Pure: no React, no state, no I/O.
// ---------------------------------------------------------------------------

import { MATCH_SCORE_BANDS } from "./match-score";

/** Score band thresholds. Single source of truth for label and colour. */
export const SCORE_BANDS = {
  strong: MATCH_SCORE_BANDS.strong,
  good: MATCH_SCORE_BANDS.moderate,
  needsFocus: MATCH_SCORE_BANDS.partial,
} as const;

/** Clamp any raw score into a whole number in [0, 100]. */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Brand colour for a score. `null` score renders as the neutral outline. */
export function scoreColor(score: number | null, accent: boolean): string {
  if (score === null) return "#C6C6CD";
  if (score >= SCORE_BANDS.strong) return "#0058BE";
  if (score >= SCORE_BANDS.good) return accent ? "#2170E4" : "#0058BE";
  if (score >= SCORE_BANDS.needsFocus) return "#8A6D00";
  return "#BA1A1A";
}

/** Human-readable band for a score. */
export function scoreLabel(score: number): string {
  if (score >= SCORE_BANDS.strong) return "Strong";
  if (score >= SCORE_BANDS.good) return "Solid";
  if (score >= SCORE_BANDS.needsFocus) return "Needs improvement";
  return "Limited";
}

/** Change between two scores, or null when either side is unknown. */
export function scoreDelta(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return after - before;
}

/** Pipeline states in which a generated draft is safe to render to the user. */
const DRAFT_READABLE_STATES = ["QA_REVIEWED", "USER_EDITING", "EXPORTED", "TRACKED"];

export function isDraftReadableState(state: string): boolean {
  return DRAFT_READABLE_STATES.includes(state);
}
