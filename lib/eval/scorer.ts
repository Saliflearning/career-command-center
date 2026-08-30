// ---------------------------------------------------------------------------
// Deterministic resume-quality scorer for the golden-set eval harness.
//
// Scores a candidate resume TEXT against a golden triple across dimensions that
// need no live model, so the harness runs in CI today:
//   factualGrounding — every number in the candidate must appear in the source
//                      resume (invented metrics are the cardinal sin, §8).
//   forbiddenWords   — none of the banned buzzwords appear.
//   onePageFit       — length is within a one-page budget.
//   sectionCoverage  — expected sections for the resume are present.
//   jdAlignment      — lexical keyword coverage of the JD (scan-analysis).
//   editDistance     — normalized similarity to the accepted final (only when
//                      the triple has one; this is the "would the owner send
//                      this?" signal).
//
// Every dimension is 0..1. `overall` weights them; edit distance is excluded
// from `overall` when no accepted final exists, and its weight is redistributed.
// ---------------------------------------------------------------------------

import { analyzeResumeAgainstJob } from "@/lib/resume/scan-analysis";
import {
  hasIndependentAcceptedFinal,
  type GoldenTriple,
} from "@/lib/eval/golden-set";

const FORBIDDEN_WORDS = [
  "leveraged", "spearheaded", "synergized", "dynamic", "results-driven",
  "passionate", "detail-oriented", "innovative", "strategic thinker",
  "responsible for",
];

// ~1 page of single-column 10pt text tops out near 750 words; allow headroom.
const ONE_PAGE_WORD_BUDGET = 800;
const ONE_PAGE_HARD_CAP = 1100;

export interface DimensionScore {
  score: number; // 0..1
  detail: string;
}

export interface ResumeEvalResult {
  overall: number;
  dimensions: {
    factualGrounding: DimensionScore;
    forbiddenWords: DimensionScore;
    onePageFit: DimensionScore;
    sectionCoverage: DimensionScore;
    jdAlignment: DimensionScore;
    editDistance: DimensionScore | null; // null when the triple has no accepted final
  };
}

/** Release-grade deterministic gates for a generated candidate. */
export function candidateQualityFailures(
  candidate: ResumeEvalResult,
  source: ResumeEvalResult
): string[] {
  const failures: string[] = [];
  const dimensions = candidate.dimensions;

  if (dimensions.factualGrounding.score !== 1) failures.push("numeric claims are not fully grounded");
  if (dimensions.forbiddenWords.score !== 1) failures.push("forbidden language is present");
  if (dimensions.onePageFit.score !== 1) failures.push("content exceeds the one-page budget");
  if (dimensions.sectionCoverage.score !== 1) failures.push("required sections are missing");
  if (candidate.overall < 0.75) failures.push("overall deterministic score is below 75%");
  if (dimensions.jdAlignment.score + 0.03 < source.dimensions.jdAlignment.score) {
    failures.push("JD alignment regressed by more than 3 points from the source");
  }

  return failures;
}

export function numericTokens(text: string): string[] {
  // Bare numbers with optional unit: 41, 41%, $2.1M, 100+, 18x, 6-hour.
  // ISO month/day components are storage precision, not resume claims. Keep
  // the year for grounding and remove only the synthetic -MM-DD suffix.
  // Strip machine date precision before reading numbers. Found live: a
  // YYYY-MM date made the scorer report "01, 06, 05" as INVENTED metrics and
  // fail the grounding gate on a resume that fabricated nothing. A false
  // fabrication alarm is the worst false positive this product can raise, so
  // both ISO shapes are normalised to their year. Month is bounded to 01-12 so
  // a genuine figure like "2024-45" is still read as a number.
  const withoutIsoDatePrecision = text
    .replace(/\b(19\d{2}|20\d{2})-\d{2}-\d{2}\b/g, "$1")
    .replace(/\b(19\d{2}|20\d{2})-(?:0[1-9]|1[0-2])\b/g, "$1");
  return (withoutIsoDatePrecision.match(/\$?\d[\d,.]*\s?(?:%|\+|x|k|m|b|hours?|days?)?/gi) ?? [])
    // A number ending a sentence captures the full stop ("...since 2024." ->
    // "2024."), which then fails to match the same figure written mid-sentence
    // and is reported as INVENTED. Strip a trailing period only; an internal
    // decimal point ("2.5") is preserved.
    .map((t) => t.toLowerCase().replace(/[\s,]/g, "").replace(/\.$/, ""));
}

/** Every number in the candidate must be present in the source resume. */
function scoreFactualGrounding(candidate: string, source: string): DimensionScore {
  const sourceNums = new Set(numericTokens(source));
  const candidateNums = numericTokens(candidate);
  if (candidateNums.length === 0) {
    return { score: 1, detail: "no numeric claims to verify" };
  }
  const invented = candidateNums.filter((n) => {
    const bare = n.replace(/[^0-9.]/g, "");
    return !sourceNums.has(n) && !Array.from(sourceNums).some((s) => s.replace(/[^0-9.]/g, "") === bare);
  });
  const grounded = candidateNums.length - invented.length;
  return {
    score: grounded / candidateNums.length,
    detail: invented.length
      ? `${invented.length}/${candidateNums.length} numeric claims not in source: ${Array.from(new Set(invented)).slice(0, 5).join(", ")}`
      : `all ${candidateNums.length} numeric claims grounded in source`,
  };
}

function scoreForbiddenWords(candidate: string): DimensionScore {
  const lower = candidate.toLowerCase();
  const hits = FORBIDDEN_WORDS.filter((w) => lower.includes(w));
  return {
    score: hits.length === 0 ? 1 : Math.max(0, 1 - hits.length * 0.25),
    detail: hits.length ? `forbidden: ${hits.join(", ")}` : "no forbidden words",
  };
}

function scoreOnePageFit(candidate: string): DimensionScore {
  const words = candidate.split(/\s+/).filter(Boolean).length;
  if (words <= ONE_PAGE_WORD_BUDGET) return { score: 1, detail: `${words} words (fits one page)` };
  if (words >= ONE_PAGE_HARD_CAP) return { score: 0, detail: `${words} words (well over one page)` };
  const over = (words - ONE_PAGE_WORD_BUDGET) / (ONE_PAGE_HARD_CAP - ONE_PAGE_WORD_BUDGET);
  return { score: 1 - over, detail: `${words} words (slightly over one page)` };
}

const EXPECTED_SECTIONS = [
  { name: "experience", re: /\b(experience|employment|work history)\b/i },
  { name: "education", re: /\beducation\b/i },
  { name: "skills", re: /\b(skills|competencies|technical skills|core skills)\b/i },
];

function scoreSectionCoverage(candidate: string): DimensionScore {
  const present = EXPECTED_SECTIONS.filter((s) => s.re.test(candidate));
  const missing = EXPECTED_SECTIONS.filter((s) => !s.re.test(candidate)).map((s) => s.name);
  return {
    score: present.length / EXPECTED_SECTIONS.length,
    detail: missing.length ? `missing sections: ${missing.join(", ")}` : "all core sections present",
  };
}

function scoreJdAlignment(candidate: string, jd: string): DimensionScore {
  const analysis = analyzeResumeAgainstJob(candidate, jd);
  return {
    score: analysis.keywordScore / 100,
    detail: `${analysis.matchedCount}/${analysis.totalKeywords} JD terms, keyword score ${analysis.keywordScore}`,
  };
}

/** Word-level Jaccard similarity — cheap, order-insensitive, good enough to
 *  track "how close is the draft to the accepted final" over time. */
function scoreEditDistance(candidate: string, accepted: string): DimensionScore {
  const norm = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const a = norm(candidate);
  const b = norm(accepted);
  if (a.size === 0 || b.size === 0) return { score: 0, detail: "empty text" };
  let shared = 0;
  Array.from(a).forEach((w) => { if (b.has(w)) shared++; });
  const jaccard = shared / (a.size + b.size - shared);
  return { score: jaccard, detail: `${(jaccard * 100).toFixed(0)}% word overlap with accepted final` };
}

export function scoreResumeAgainstTriple(
  candidateText: string,
  triple: GoldenTriple
): ResumeEvalResult {
  const factualGrounding = scoreFactualGrounding(candidateText, triple.sourceResumeText);
  const forbiddenWords = scoreForbiddenWords(candidateText);
  const onePageFit = scoreOnePageFit(candidateText);
  const sectionCoverage = scoreSectionCoverage(candidateText);
  const jdAlignment = scoreJdAlignment(candidateText, triple.jobDescription);
  const editDistance = hasIndependentAcceptedFinal(triple)
    ? scoreEditDistance(candidateText, triple.acceptedFinalText)
    : null;

  // Weights. Factual grounding dominates — a fabricated resume is worthless
  // however well-formatted. Edit distance is redistributed when absent.
  const base = {
    factualGrounding: 0.35,
    forbiddenWords: 0.1,
    onePageFit: 0.1,
    sectionCoverage: 0.1,
    jdAlignment: 0.15,
    editDistance: 0.2,
  };
  const weights = editDistance
    ? base
    : {
        ...base,
        factualGrounding: 0.45,
        jdAlignment: 0.2,
        editDistance: 0,
      };

  const overall =
    factualGrounding.score * weights.factualGrounding +
    forbiddenWords.score * weights.forbiddenWords +
    onePageFit.score * weights.onePageFit +
    sectionCoverage.score * weights.sectionCoverage +
    jdAlignment.score * weights.jdAlignment +
    (editDistance?.score ?? 0) * weights.editDistance;

  return {
    overall: Math.round(overall * 1000) / 1000,
    dimensions: {
      factualGrounding,
      forbiddenWords,
      onePageFit,
      sectionCoverage,
      jdAlignment,
      editDistance,
    },
  };
}
