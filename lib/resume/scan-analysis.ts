// ---------------------------------------------------------------------------
// Resume scan analysis — domain-neutral, deterministic.
//
// Every keyword and signal is derived from the pasted job description itself.
// There are NO hardcoded career-domain lists here: an earlier version carried
// eight operations/logistics signals (P&L, throughput, WMS, ...) which made a
// strong nursing resume score "Low match" for a nursing job. See
// coordination/CHALLENGES.md C-001 and scan-analysis.domain-coverage.test.ts.
//
// Dimensions:
//   keywordScore  — share of JD-derived terms the resume covers
//   signalScore   — share of HIGH-signal JD terms covered (multi-word phrases
//                   and named tools/acronyms; falls back to keywordScore only
//                   when the JD contains no high-signal terms at all)
//   evidenceScore — structural strength of the resume's own claims
//                   (quantified, outcome-oriented, action-led lines)
//   atsScore      — structural parseability (contact block, standard section
//                   headers, bullets, date ranges, sane length). Graded, not
//                   a constant.
// ---------------------------------------------------------------------------

export type ResumeScanKeyword = {
  term: string;
  category: string;
  why: string;
};

import { inferJobDetails } from "./job-target-detection";
import { matchScoreLabel } from "./match-score";
import { projectAlignmentScores } from "./scan-projection";

export type ResumeRequirementImportance = "critical" | "important" | "supporting";

export type ResumeScanRequirement = ResumeScanKeyword & {
  importance: ResumeRequirementImportance;
  status: "matched" | "missing";
  evidence: string | null;
  source: string;
  weight: number;
  kind: "role" | "phrase" | "named" | "word";
};

export type ResumeScanAnalysis = {
  score: number;
  atsScore: number;
  keywordScore: number;
  evidenceScore: number;
  signalScore: number;
  fitLabel: string;
  summary: string;
  matchedCount: number;
  missingCount: number;
  totalKeywords: number;
  matchedKeywords: string[];
  requirementDetails: ResumeScanRequirement[];
  /** Top gaps for UI display (capped at 6). */
  missingKeywordDetails: ResumeScanKeyword[];
  /** Every missing term, uncapped — consumed by the semantic layer. */
  missingTermDetailsAll: ResumeScanKeyword[];
  quickWins: string[];
};

const STOP_WORDS = new Set([
  "a", "able", "about", "across", "after", "all", "also", "an", "and", "any",
  "active", "applicants", "apply", "are", "as", "at", "be", "been", "being", "benefits",
  "based", "best", "both", "business", "busy", "but", "by", "can", "candidate", "candidates",
  "click", "company", "day", "days", "description", "do", "does", "each",
  "employer", "employment", "equal", "etc", "excellent", "experience", "for",
  "from", "full", "get", "good", "great", "has", "have", "here", "high",
  "hire", "hiring", "how", "if", "in", "including", "into", "is", "it", "its",
  "jd", "job", "join", "like", "looking", "make", "may", "more", "most", "must",
  "new", "not", "of", "on", "one", "opportunity", "or", "other", "our", "out",
  "over", "own", "part", "per", "please", "plus", "position", "preferred",
  "provide", "range", "related", "required", "requirements", "responsibilities",
  "role", "salary", "seeking", "should", "some", "strong", "such", "team",
  "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "through", "time", "to", "under", "up", "us", "use", "using", "we",
  "well", "what", "when", "where", "which", "while", "who", "will", "with",
  "within", "work", "working", "years", "you", "your",
  // Imperative JD verbs: "Lead warehouse operations" requires warehouse
  // operations experience, not the word "lead". The noun phrase is the
  // requirement; the verb is grammar.
  "lead", "leads", "leading", "led", "manage", "manages", "managing",
  "oversee", "oversees", "overseeing", "ensure", "ensures", "ensuring",
  "own", "owns", "owning", "drive", "drives", "driving",
  "improve", "improves", "improving", "responsible", "today",
  "compile", "compiles", "compiling", "develop", "develops", "developing",
  "maintain", "maintains", "maintaining", "uphold", "upholds", "upholding",
  "support", "supports", "supported", "supporting",
]);

// Connector words allowed INSIDE a phrase but never at its edges.
const PHRASE_CONNECTORS = new Set(["and", "of", "the", "to", "in", "for", "with"]);

const SHORT_TERM_ALLOWLIST = /^(ai|ml|qa|ux|ui|hr|it|bi|pr|rn|go|cpa|cfa|pmp|sql|aws|gcp|erp|crm|sap|bls|bsn|iep|api|css|ios|sre|etl|kpi|sla|emr|ehr|icu|pmo|seo|sem|gaap|nist|hipaa|osha)$/i;

type JdTerm = {
  term: string;
  kind: "role" | "phrase" | "named" | "word";
  weight: number;
  importance: ResumeRequirementImportance;
  source: string;
};

/**
 * JD-derived term details for display (chips, counts) without scoring a
 * resume. Same extraction as the scan itself — one vocabulary, one source.
 */
export function extractJobTermDetails(jobDescription: string): ResumeScanKeyword[] {
  return extractJdTerms(jobDescription).map((term) => describeTerm(term));
}

export function analyzeResumeAgainstJob(resumeText: string, jobDescription: string): ResumeScanAnalysis {
  const resumeIndex = buildResumeIndex(resumeText);
  const terms = extractJdTerms(jobDescription);
  const requirementDetails = terms.map((term) => buildRequirementDetail(resumeIndex, term));
  const matchedDetails = requirementDetails.filter((item) => item.status === "matched");
  const missingDetails = requirementDetails.filter((item) => item.status === "missing");
  const alignment = projectAlignmentScores(requirementDetails, []);
  const { keywordScore, signalScore, score } = alignment;

  const evidenceScore = estimateEvidenceStrength(resumeText);
  const atsScore = estimateAtsReadiness(resumeText);
  // Overall alignment is job-derived only. A clean, quantified resume should
  // score well on ATS/evidence diagnostics, but those qualities cannot prove
  // missing job requirements.
  const missingTermDetailsAll = missingDetails.map(toKeywordDetail);
  const missingKeywordDetails = missingTermDetailsAll.slice(0, 6);
  const focus = missingKeywordDetails.slice(0, 3).map((item) => item.term).join(", ");

  return {
    score,
    atsScore,
    keywordScore,
    evidenceScore,
    signalScore,
    fitLabel: matchScoreLabel(score),
    summary: focus
      ? `${matchScoreLabel(score)}. The largest truthful opportunities are ${focus}.`
      : "Strong alignment across job language and role signals. Verify every claim before generating.",
    matchedCount: alignment.matchedCount,
    missingCount: alignment.missingCount,
    totalKeywords: terms.length,
    matchedKeywords: matchedDetails.map((item) => item.term),
    requirementDetails,
    missingKeywordDetails,
    missingTermDetailsAll,
    quickWins: buildQuickWins(missingKeywordDetails, evidenceScore),
  };
}

/**
 * Re-score an analysis after additional terms were verified as matched by the
 * semantic layer (C-006). Terms move from missing -> matched and every score
 * is recomputed with the SAME curves and weights as the lexical scan, so the
 * two layers can never drift. Purely additive: unknown terms are ignored, and
 * an empty list returns the input unchanged.
 */
export function rescoreWithSemanticMatches(
  analysis: ResumeScanAnalysis,
  semanticallyMatched: Array<string | { term: string; evidence: string }>
): ResumeScanAnalysis {
  const allMissing = analysis.missingTermDetailsAll ?? analysis.missingKeywordDetails;
  const evidenceByTerm = new Map(
    semanticallyMatched.map((item) => {
      const term = typeof item === "string" ? item : item.term;
      return [term.trim().toLowerCase(), typeof item === "string" ? null : item.evidence] as const;
    })
  );
  const promotable = new Set(
    Array.from(evidenceByTerm.keys()).filter((term) =>
      allMissing.some((detail) => detail.term.toLowerCase() === term)
    )
  );
  if (promotable.size === 0) return analysis;

  const requirementDetails = analysis.requirementDetails.map((detail) =>
    promotable.has(detail.term.toLowerCase())
      ? {
          ...detail,
          status: "matched" as const,
          evidence: evidenceByTerm.get(detail.term.toLowerCase()) ?? detail.evidence,
        }
      : detail
  );
  const matched = requirementDetails.filter((detail) => detail.status === "matched");
  const stillMissingRequirements = requirementDetails.filter((detail) => detail.status === "missing");
  const alignment = projectAlignmentScores(requirementDetails, []);
  const { keywordScore, signalScore, score, matchedCount, missingCount } = alignment;
  const matchedKeywords = matched.map((detail) => detail.term);
  const stillMissing = stillMissingRequirements.map(toKeywordDetail);

  const focus = stillMissing.slice(0, 3).map((item) => item.term).join(", ");

  return {
    ...analysis,
    score,
    keywordScore,
    signalScore,
    fitLabel: matchScoreLabel(score),
    summary: focus
      ? `${matchScoreLabel(score)}. The largest truthful opportunities are ${focus}.`
      : "Strong alignment across job language and role signals. Verify every claim before generating.",
    matchedCount,
    missingCount,
    matchedKeywords,
    requirementDetails,
    missingKeywordDetails: stillMissing.slice(0, 6),
    missingTermDetailsAll: stillMissing,
    quickWins: buildQuickWins(stillMissing.slice(0, 6), analysis.evidenceScore),
  };
}

// ---------------------------------------------------------------------------
// JD term extraction — everything comes from the JD text itself
// ---------------------------------------------------------------------------

function extractJdTerms(jobDescription: string): JdTerm[] {
  const headerStripped = stripLikelyJobHeader(jobDescription);
  const detectedTarget = inferJobDetails(jobDescription);
  const detectedRole = detectedTarget.role;
  const detectedCompany = detectedTarget.company;
  const normalizedCompany = normalize(detectedCompany);
  const distinctiveCompanyWords = normalizedCompany
    .split(" ")
    .filter((word) => word && !GENERIC_EMPLOYER_WORDS.has(word));
  const scoringText = sanitizeJobDescriptionForScoring(headerStripped);
  const normalizedRoleContext = normalize(detectedRole);
  const contexts = extractRequirementContexts(scoringText).filter(
    (context) => normalize(context.text) !== normalizedRoleContext
  );

  const requirementText = contexts
    .map((context) => context.text.replace(/^(?:requires?|required|preferred)\s*:?[\s-]*/i, ""))
    .join("\n");

  // Segment first so phrases cannot span sentence or list boundaries
  // ("...cloud adoption, customer engagement..." must not yield the junk
  // bigram "adoption customer").
  const segments = requirementText
    .split(/[.,;:!?()\n/|]+/)
    .map((segment) =>
      normalize(segment)
        .split(" ")
        .map((word) => word.replace(/^[.,&-]+|[.,&-]+$/g, ""))
        .filter(Boolean)
    )
    .filter((segment) => segment.length > 0);
  const words = segments.flat();

  // 1. Multi-word phrases: adjacent non-stopword runs of length 2-3 inside one
  //    segment that the JD uses as a unit (kept if repeated OR if every word is
  //    contentful and long enough to read as a skill).
  const phraseCounts = new Map<string, number>();
  for (const segment of segments) {
    for (let size = 3; size >= 2; size--) {
      for (let i = 0; i + size <= segment.length; i++) {
        const slice = segment.slice(i, i + size);
        const first = slice[0];
        const last = slice[size - 1];
        if (isStop(first) || isStop(last)) continue;
        if (slice.some((w) => isStop(w) && !PHRASE_CONNECTORS.has(w))) continue;
        if (slice.some((w) => /^\d+$/.test(w))) continue;
        // Repetition is frequency evidence for one term, never a phrase.
        // Without this guard, "Python Python Python" became the artificial
        // requirements "python python" and "python python python".
        if (new Set(slice).size !== slice.length) continue;
        const phrase = slice.join(" ");
        phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
      }
    }
  }
  // C-038: a JD writes requirements as noun phrases but writes duties as
  // SENTENCES, whose fragments look identical to this extractor ("achieving
  // exceptional customer", "beyond daily management"). Scoring those fragments
  // as requirements crowded out the real skills and tanked strong resumes.
  //
  // MEASURED: a grammar-based prose detector (verb-led / preposition / adverb
  // tells) was implemented and rejected — it returned the golden set to
  // baseline, delivering ZERO gain (third failed heuristic here; see C-006).
  // Frequency remains the safest general-purpose separator: a repeated phrase
  // is emphasis while a one-off phrase is usually prose. Explicit one-off
  // requirements are recovered separately from labeled requirement blocks and
  // requirement prefixes below, without reopening arbitrary sentence fragments.
  const rankedPhrases = Array.from(phraseCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  // Drop phrases fully contained in a longer kept phrase (within a list).
  const dropContained = (list: string[], against: string[] = []): string[] => {
    const kept: string[] = [];
    for (const phrase of list) {
      if (kept.some((k) => k.includes(phrase))) continue;
      if (against.some((k) => k.includes(phrase))) continue;
      kept.push(phrase);
      if (kept.length + against.length >= 12) break;
    }
    return kept;
  };

  // A phrase the JD REPEATS is a real requirement (weight-2 signal).
  const repeatedPhrases = dropContained(
    rankedPhrases.filter(([, count]) => count >= 2).map(([phrase]) => phrase)
  );

  // One-off phrases are trustworthy when the posting itself places them in a
  // structured requirements block and introduces them as experience,
  // knowledge, proficiency, or familiarity. This preserves explicit items
  // without admitting arbitrary fragments from responsibility prose.
  const explicitRequirementPhrases = extractExplicitRequirementPhrases(scoringText);
  const actionRequirementPhrases = extractActionRequirementPhrases(contexts);

  // Used once: contentful ones are admitted ONLY as low-priority fill below, so
  // they can never displace a repeated, named, or role-title requirement.
  const oncePhrases = dropContained(
    rankedPhrases
      .filter(([phrase, count]) => count === 1 && phrase.split(" ").every((w) => w.length >= 4))
      .map(([phrase]) => phrase),
    repeatedPhrases
  );

  // 2. Named tools / credentials / acronyms, from ORIGINAL casing: tokens the
  //    JD spells in caps (SQL, BSN, GAAP) or mixed case mid-word (NetSuite).
  const namedSet = new Set<string>();
  const rawNamedTokens = requirementText.split(/[^A-Za-z0-9+#.&-]+/).filter(Boolean);
  const titleTokenCounts = new Map<string, number>();
  for (const raw of rawNamedTokens) {
    const cleaned = raw.replace(/^[.,&-]+|[.,&-]+$/g, "");
    if (/^[A-Z][a-z][A-Za-z0-9+#.&-]*$/.test(cleaned)) {
      const lower = cleaned.toLowerCase();
      titleTokenCounts.set(lower, (titleTokenCounts.get(lower) ?? 0) + 1);
    }
  }
  for (const raw of rawNamedTokens) {
    const cleaned = raw.replace(/^[.,&-]+|[.,&-]+$/g, "");
    if (cleaned.length < 2 || cleaned.length > 30) continue;
    const lower = cleaned.toLowerCase();
    if (isStop(lower)) continue;
    const isAllCaps = /^[A-Z][A-Z0-9+#.&-]+$/.test(cleaned) && (cleaned.match(/[A-Z]/g) ?? []).length >= 2;
    const isMixedCase = /[a-z][A-Z]/.test(cleaned);
    const isKnownShort = SHORT_TERM_ALLOWLIST.test(lower);
    const isRepeatedTitleToken = (titleTokenCounts.get(lower) ?? 0) >= 2;
    if (isAllCaps || isMixedCase || isKnownShort || isRepeatedTitleToken) namedSet.add(lower);
  }
  for (const context of contexts) {
    for (const match of context.text.matchAll(/\b[A-Z][A-Za-z0-9+#-]*(?:\s+[A-Z][A-Za-z0-9+#-]*){1,3}\b/g)) {
      const phrase = normalize(match[0]);
      const phraseWords = phrase.split(" ");
      if (
        phrase &&
        !/^(?:requires?|required|preferred|experience|knowledge|proficiency|familiarity)\b/.test(phrase) &&
        !isJobSectionLabel(phrase) &&
        new Set(phraseWords).size === phraseWords.length &&
        !phraseWords.some((word) => isStop(word) && !SHORT_TERM_ALLOWLIST.test(word))
      ) namedSet.add(phrase);
    }
    for (const slashAcronym of context.text.match(/\b[A-Z]{2,}(?:\/[A-Z]{2,})+\b/g) ?? []) {
      namedSet.add(normalize(slashAcronym));
    }
    const list = context.text.match(/\b(?:such as|including|experience with|proficiency in|using)\s+(.+?)(?:[.;]|$)/i)?.[1];
    if (list) {
      for (const item of list.split(/,|\s+or\s+|\s+and\s+/i)) {
        const candidate = normalize(
          item
            .replace(/\b(?:required|preferred|skills?|experience)\b.*$/i, "")
            .replace(/\bsystems?\b.*$/i, "")
        ).trim();
        if (candidate && candidate.split(" ").length <= 3) namedSet.add(candidate);
      }
    }
  }

  // 3. Repeated content words as low-signal fill. Words the JD uses only once
  //    are usually prose, not requirements; they enter only when the JD is so
  //    short that phrases and named terms alone would leave nothing to score.
  const counts = new Map<string, number>();
  for (const word of words) {
    if (isStop(word) || word.length <= 2) continue;
    if (word.length === 3 && !SHORT_TERM_ALLOWLIST.test(word)) continue;
    if (/^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const rankedSingles = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const repeatedSingles = rankedSingles.filter(([, count]) => count >= 2).map(([word]) => word);
  const onceSingles = rankedSingles.filter(([, count]) => count === 1).map(([word]) => word);

  // Assemble with dedupe and rank by source importance. The cap is applied
  // only after all candidates are known, so a critical tool near the end of a
  // long posting cannot be displaced by earlier prose or job-board noise.
  const terms: JdTerm[] = [];
  const push = (
    term: string,
    kind: JdTerm["kind"],
    weight: number,
    options: { allowDetectedCompany?: boolean } = {}
  ) => {
    const cleanedTerm = cleanScoredTerm(term);
    if (!cleanedTerm) return;
    if (
      !options.allowDetectedCompany &&
      isDetectedCompanyTerm(cleanedTerm, normalizedCompany, distinctiveCompanyWords)
    ) return;
    // A single word already covered by a kept phrase adds no information.
    if (
      kind === "word" &&
      terms.some((candidate) =>
        candidate.kind === "phrase" && candidate.term.split(" ").includes(cleanedTerm)
      )
    ) return;
    if (kind !== "role") {
      const roleTerm = terms.find((candidate) => candidate.kind === "role")?.term;
      if (
        roleTerm &&
        (cleanedTerm === roleTerm ||
          (cleanedTerm.split(" ").length === 1 && roleTerm.split(" ").includes(cleanedTerm)))
      ) return;
    }
    const context = bestRequirementContext(cleanedTerm, contexts);
    const importance = kind === "role" ? "critical" : context?.importance ?? "supporting";
    const importanceWeight = importance === "critical" ? 5 : importance === "important" ? 3 : 1;
    const effectiveWeight = Math.max(weight, importanceWeight);
    const existing = terms.find((candidate) => candidate.term === cleanedTerm);
    if (existing) {
      existing.weight = Math.max(existing.weight, effectiveWeight);
      return;
    }
    terms.push({
      term: cleanedTerm,
      kind,
      weight: effectiveWeight,
      importance,
      source: kind === "role" ? detectedRole : context?.text ?? cleanedTerm,
    });
  };

  // The detected role title is itself a requirement. Detect it independently
  // of header order, then inject it first so employer or job-metadata rows can
  // be removed without accidentally becoming the scored role signal.
  if (detectedRole) {
    // Strip parenthetical/bracketed job codes first. A real posting title like
    // "Senior Operations Manager (Operations Manager I)" must not become the
    // un-matchable 6-word phrase "senior operations manager operations manager i".
    const roleForScoring = detectedRole.split(/[,;]/, 1)[0];
    const titleWords = normalize(roleForScoring.replace(/[([{][^)\]}]*[)\]}]/g, " "))
      .split(" ")
      .map((word) => word.replace(/^[.,&-]+|[.,&-]+$/g, ""))
      .filter((word) =>
        word && (!isStop(word) || SHORT_TERM_ALLOWLIST.test(word)) && !PHRASE_CONNECTORS.has(word)
      );
    // De-duplicate while preserving order, then cap length, so a title that
    // repeats a word stays a clean, matchable role phrase.
    const seenTitleWord = new Set<string>();
    const uniqueTitleWords = titleWords.filter((word) => {
      if (seenTitleWord.has(word)) return false;
      seenTitleWord.add(word);
      return true;
    });
    if (uniqueTitleWords.length >= 2) {
      push(uniqueTitleWords.slice(0, 5).join(" "), "role", 2, { allowDetectedCompany: true });
    } else if (uniqueTitleWords.length === 1 && uniqueTitleWords[0].length > 3) {
      push(uniqueTitleWords[0], "role", 2, { allowDetectedCompany: true });
    }
  }

  for (const phrase of explicitRequirementPhrases) push(phrase, "phrase", 2);
  for (const named of Array.from(namedSet).sort()) push(named, "named", 2);
  for (const phrase of actionRequirementPhrases) push(phrase, "phrase", 2);
  for (const phrase of repeatedPhrases) push(phrase, "phrase", 3);
  for (const single of repeatedSingles) push(single, "word", 1);
  // Low-signal fill, only when the JD gave us little else.
  if (terms.length < 10) {
    for (const phrase of oncePhrases) {
      if (terms.length >= 10) break;
      push(phrase, "phrase", 2);
    }
    for (const single of onceSingles) {
      if (terms.length >= 10) break;
      push(single, "word", 1);
    }
  }

  const importanceRank: Record<ResumeRequirementImportance, number> = {
    critical: 3,
    important: 2,
    supporting: 1,
  };
  const kindRank: Record<JdTerm["kind"], number> = {
    role: 4,
    named: 3,
    phrase: 2,
    word: 1,
  };
  const withoutRedundantTerms = terms.filter((candidate) => {
    const candidateWords = candidate.term.split(" ");
    if (candidate.kind === "named" && candidateWords.length === 1) {
      return !terms.some(
        (other) =>
          other !== candidate &&
          other.kind === "named" &&
          other.term.split(" ").length > 1 &&
          other.term.split(" ").includes(candidate.term)
      );
    }
    if (candidate.kind !== "phrase") return true;
    return !terms.some(
      (other) =>
        other !== candidate &&
        other.kind === "phrase" &&
        ((other.weight >= candidate.weight &&
          other.term.split(" ").length > candidateWords.length &&
          other.term.includes(candidate.term)) ||
          (other.weight > candidate.weight && candidate.term.includes(other.term)))
    );
  });

  return withoutRedundantTerms
    .sort((a, b) =>
      importanceRank[b.importance] - importanceRank[a.importance] ||
      b.weight - a.weight ||
      kindRank[b.kind] - kindRank[a.kind] ||
      a.term.localeCompare(b.term)
    )
    .slice(0, 32);
}

function cleanScoredTerm(value: string) {
  return normalize(value)
    .split(" ")
    .map((word) => word.replace(/^[.,&-]+|[.,&-]+$/g, ""))
    .filter(Boolean)
    .join(" ");
}

const EXPLICIT_REQUIREMENT_HEADING = /^(?:(?:minimum|required|preferred)\s+)?(?:requirements?|qualifications?|skills?)\s*:?\s*$|^(?:candidates should|preferences?|what you(?:'|\u2019)ll need|what you bring|candidate profile|success measures)\s*:?\s*$/i;
const EXPLICIT_REQUIREMENT_PREFIX = /^(?:(?:\d+\+?\s+years?(?:\s+of)?\s+)?(?:hands-on\s+|progressive\s+|technical\s+)?experience\s+(?:with|in|supporting|delivering|performing|providing|writing)|advanced\s+proficiency\s+in|proficiency\s+in|strong\s+knowledge\s+of|knowledge\s+of|familiarity\s+with|understanding\s+of|show\s+strong|have\s+experience(?:\s+in)?|bachelor(?:'|\u2019)?s\s+degree\s+in|document|create|develop|support|conduct|perform)\s+/i;

function extractExplicitRequirementPhrases(value: string) {
  const phrases: string[] = [];
  let inRequirementBlock = false;

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (EXPLICIT_REQUIREMENT_HEADING.test(line)) {
      inRequirementBlock = true;
      continue;
    }
    if (isJobSectionLabel(line)) {
      inRequirementBlock = false;
      continue;
    }
    if (!inRequirementBlock || isJobBoardDisclaimer(line)) continue;

    const withoutBullet = line.replace(/^(?:[-*\u2022\u25cf\u25aa\u25e6]|\d+[.)])\s*/, "").trim();
    const prefix = withoutBullet.match(EXPLICIT_REQUIREMENT_PREFIX);
    if (!prefix) continue;

    const requirement = withoutBullet.slice(prefix[0].length).replace(/[.!?]+$/, "");
    for (const part of requirement.split(/\s+(?:and|or)\s+|[,;]/i)) {
      const words = normalize(part)
        .split(" ")
        .filter((word) => word && !/^(?:a|an|the|etc|related)$/.test(word));
      if (words.length < 2 || words.length > 5) continue;
      if (words.every((word) => isStop(word))) continue;
      phrases.push(words.join(" "));
    }
  }

  return Array.from(new Set(phrases));
}

const REQUIREMENT_ACTION = /^(?:administer|analyze|build|compile|conduct|coordinate|create|deliver|design|develop|document|evaluate|implement|lead|maintain|manage|monitor|own|perform|prepare|provide|research|review|support|track|uphold|write)\b/i;

function extractActionRequirementPhrases(contexts: RequirementContext[]) {
  const phrases: string[] = [];

  for (const context of contexts) {
    if (!REQUIREMENT_ACTION.test(context.text)) continue;
    const withoutLead = context.text
      .replace(REQUIREMENT_ACTION, "")
      .replace(/^\s+and\s+(?:build|create|develop|document|maintain|provide|support|write)\b/i, "")
      .trim();
    const parts = withoutLead.split(/[,;]|\s+and\s+(?=(?:administer|build|conduct|create|develop|document|maintain|perform|provide|support|track|uphold|write)\b)|\s+and\s+/i);

    for (const rawPart of parts) {
      const normalized = normalize(
        rawPart
          .replace(REQUIREMENT_ACTION, "")
          .replace(/\b(?:using|with|across|through|for|to)\b.*$/i, "")
          .replace(/\b(?:required|preferred)\b.*$/i, "")
      );
      const words = normalized
        .split(" ")
        .filter(Boolean)
        .filter((word, index, all) =>
          (index > 0 && index < all.length - 1) || (!isStop(word) && !PHRASE_CONNECTORS.has(word))
        );
      if (words.length >= 2 && words.length <= 5) phrases.push(words.join(" "));
    }
  }

  return Array.from(new Set(phrases));
}

const GENERIC_EMPLOYER_WORDS = new Set([
  "center", "company", "corp", "corporation", "group", "health", "healthcare",
  "hospital", "inc", "llc", "logistics", "medical", "regional", "services",
  "solutions", "systems", "technologies", "technology", "university",
]);

function isDetectedCompanyTerm(
  term: string,
  normalizedCompany: string,
  distinctiveCompanyWords: string[]
) {
  if (!normalizedCompany) return false;
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm === normalizedCompany) return true;

  const termWords = new Set(normalizedTerm.split(" "));
  return distinctiveCompanyWords.some((word) => termWords.has(word));
}

/**
 * Job boards commonly prepend a short role title and employer name. The
 * employer identifies the poster, not a candidate requirement — scoring it
 * creates nonsense gaps such as an applicant being asked to "add Northside".
 * The ROLE TITLE, however, is a first-order requirement: a nursing resume
 * that never says "nurse" has a real gap. Header rows are removed from
 * free-text extraction while the shared job-target detector identifies the
 * role independently of whether title, employer, or metadata appears first.
 * Only the first two non-empty, heading-like lines are eligible for removal;
 * prose-led descriptions and punctuated requirement sentences are preserved.
 */
function stripLikelyJobHeader(jobDescription: string): string {
  const lines = jobDescription.split(/\r?\n/);
  const nonEmptyIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((entry) => entry.line.length > 0)
    .slice(0, 2);

  if (nonEmptyIndexes.length < 2 || !isLikelyJobHeaderLine(nonEmptyIndexes[0].line)) {
    return jobDescription;
  }

  const remove = new Set<number>([nonEmptyIndexes[0].index]);
  if (nonEmptyIndexes[1] && isLikelyJobHeaderLine(nonEmptyIndexes[1].line)) {
    remove.add(nonEmptyIndexes[1].index);
  }

  return lines.filter((_, index) => !remove.has(index)).join("\n");
}

function isLikelyJobHeaderLine(line: string) {
  const normalizedLine = normalize(line);
  if (!normalizedLine || line.length > 100 || /[.!?;:]\s*$/.test(line)) return false;
  if (normalizedLine.split(" ").length > 12) return false;
  return !/^(?:we|we're|our|you|the|this|join|seeking|looking|responsibilities|requirements|qualifications|duties|overview|summary)\b/.test(
    normalizedLine
  );
}

function isJobBoardDisclaimer(line: string) {
  const normalizedLine = normalize(line);
  return /\bequal opportunity employer\b|\bdo not discriminate\b|\bwithout regard to (?:race|color|religion|sex|national origin)|\bprotected (?:class|status)\b/.test(
    normalizedLine
  );
}

const NON_EVIDENCE_BLOCK_HEADING = /^(?:pay|salary|compensation|job type|shift and schedule|shift availability|work schedule|hiring salary range|we also offer great benefits(?:, including)?|benefits?)\s*:?\s*$/i;
const NON_EVIDENCE_INLINE_ROW = /^(?:pay|salary|compensation|benefits?|work location)\s*:\s*\S/i;
const JOB_CONTENT_HEADING = /^(?:full job description|about the job|introduction|about this role|overview|duties|this position will|responsibilities|requirements|minimum requirements|preferred qualifications|preferences|candidates should|qualifications|role purpose|core responsibilities|success measures|profile|experience|language)\s*:?\s*$/i;
const JOB_BOARD_NOISE_LINE = /^(?:company logo for\b|responses? managed\b|apply|saved|share|job match\b|show match details|tailor my resume|help me stand out|create cover letter|beta\b|is this information helpful|\d+\s+people clicked apply|see yourself here!?|required question)\b/i;
const JOB_BOARD_LOCATION_OR_MODE = /(?:\b\d{5}(?:-\d{4})?\b|\b\d+\s+(?:day|week|month)s? ago\b|^(?:hybrid|remote|on[- ]?site|full[- ]?time|part[- ]?time)$)/i;

type RequirementContext = {
  text: string;
  importance: ResumeRequirementImportance;
};

function sanitizeJobDescriptionForScoring(value: string) {
  const kept: string[] = [];
  let skippingBlock = false;

  for (const rawLine of value.split(/\r?\n/)) {
    const rawSegments = rawLine.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

    for (const rawSegment of rawSegments) {
      const line = rawSegment.trim();
      if (!line) continue;
      if (/^(?:0?1|supplemental questions?)$/i.test(line)) return kept.join("\n");
      if (isJobBoardDisclaimer(line) || JOB_BOARD_NOISE_LINE.test(line)) continue;
      if (JOB_BOARD_LOCATION_OR_MODE.test(line) || /\$\s?\d/.test(line)) continue;
      if (NON_EVIDENCE_BLOCK_HEADING.test(line)) {
        skippingBlock = true;
        continue;
      }
      if (JOB_CONTENT_HEADING.test(line)) {
        skippingBlock = false;
        kept.push(line);
        continue;
      }
      if (/^(?:special requirements?|application questions?)\s*:?\s*$/i.test(line)) {
        skippingBlock = true;
        continue;
      }
      if (NON_EVIDENCE_INLINE_ROW.test(line)) continue;
      if (!skippingBlock) kept.push(line);
    }
  }

  return kept.join("\n");
}

function extractRequirementContexts(value: string): RequirementContext[] {
  const contexts: RequirementContext[] = [];
  let importance: ResumeRequirementImportance = "supporting";

  for (const rawLine of value.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    const inlineHeading = line.match(
      /^(minimum requirements?|required qualifications?|requirements?|qualifications?|candidates should|what you(?:'|\u2019)ll need|preferences?|preferred qualifications?|nice to have|this position will|responsibilities|duties|core responsibilities|about this role|role purpose|overview|introduction)\s*:?\s*(.*)$/i
    );
    if (inlineHeading) {
      const heading = inlineHeading[1].toLowerCase();
      importance = /minimum|required|requirements|qualifications|candidates should|what you/.test(heading)
        ? "critical"
        : /preferences?|preferred|nice to have|this position|responsibilities|duties|role purpose/.test(heading)
          ? "important"
          : "supporting";
      line = inlineHeading[2].trim();
      if (!line) continue;
    } else if (isJobSectionLabel(line)) {
      continue;
    }

    const cleaned = line.replace(/^(?:[-*\u2022\u25cf\u25aa\u25e6]|\d+[.)])\s*/, "").trim();
    for (const sentence of cleaned.split(/(?<=[.!?])\s+/)) {
      const text = sentence.trim();
      if (text) contexts.push({ text, importance });
    }
  }

  return contexts;
}

function bestRequirementContext(term: string, contexts: RequirementContext[]) {
  const termWords = normalize(term)
    .split(" ")
    .filter((word) => word && !PHRASE_CONNECTORS.has(word));
  const candidates = contexts.filter((context) => {
    const normalized = normalize(context.text);
    return termWords.every((word) => normalized.split(" ").includes(word));
  });
  const rank: Record<ResumeRequirementImportance, number> = {
    critical: 3,
    important: 2,
    supporting: 1,
  };
  return candidates.sort((a, b) => rank[b.importance] - rank[a.importance])[0];
}

function isJobSectionLabel(line: string) {
  const value = line.trim();
  return JOB_CONTENT_HEADING.test(value) || /^job details\s*:?[\s]*$/i.test(value);
}

function isStop(word: string) {
  return STOP_WORDS.has(word);
}

// ---------------------------------------------------------------------------
// Structural scores — computed from the resume alone, domain-free
// ---------------------------------------------------------------------------

function estimateEvidenceStrength(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => /^(?:[-*•●▪◦]|\d+[.)])\s*/.test(line));
  const sample = bullets.length ? bullets : lines;
  const quantified = sample.filter((line) => /\b\d+(?:[.,]\d+)*\s*(?:%|\+|x|k|m|b|hours?|days?|people|users?|customers?|dollars?)?\b|\$\d/i.test(line)).length;
  const outcome = sample.filter((line) => /\b(?:reduc(?:e|ed|es|ing)|increas(?:e|ed|es|ing)|improv(?:e|ed|es|ing)|sav(?:e|ed|es|ing)|grew|grow(?:s|ing)?|deliver(?:ed|s|ing)?|cut(?:s|ting)?|accelerat(?:e|ed|es|ing)|prevent(?:ed|s|ing)?|achiev(?:e|ed|es|ing)|rais(?:e|ed|es|ing)|launch(?:ed|es|ing)?|eliminat(?:e|ed|es|ing)|streamlin(?:e|ed|es|ing))\b/i.test(line)).length;
  const action = sample.filter((line) => /^(?:(?:[-*•●▪◦]|\d+[.)])\s*)?(?:build|built|lead|led|manage|managed|create|created|design|designed|implement|implemented|analyze|analyzed|develop|developed|coordinate|coordinated|optimize|optimized|deliver|delivered|reduce|reduced|increase|increased|teach|taught|close|closed|reconcile|reconciled|prepare|prepared|administer|administered|migrate|migrated|automate|automated|precept|precepted|validate|validated|raise|raised|collaborate|collaborated|partner|partnered|conduct|conducted|direct|directed|supervise|supervised|train|trained|launch|launched|streamline|streamlined)\b/i.test(line)).length;
  const denominator = Math.max(1, sample.length);
  // A resume needs a small set of strong proof points, not a metric in every
  // truthful context bullet. Cap the proof denominator at three while still
  // scoring action-led writing across every bullet, so adding a supported
  // non-quantified bullet cannot erase evidence already present.
  const proofTarget = Math.min(3, denominator);
  return clampScore(
    20 +
      (Math.min(quantified, proofTarget) / proofTarget) * 35 +
      (Math.min(outcome, proofTarget) / proofTarget) * 25 +
      (action / denominator) * 20
  );
}

/**
 * ATS readiness — graded structural parseability. Each check maps to something
 * an applicant tracking system actually needs to extract. This score varies:
 * a resume missing its contact block, section headers, bullets, or dates
 * loses the corresponding points. (The previous version returned 100 for any
 * text containing four common words — a constant, not a score.)
 */
function estimateAtsReadiness(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let score = 0;

  // Contact block (25): email, phone, profile link.
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) score += 10;
  if (/(?:\+?\d[\d\s().-]{6,}\d)/.test(text)) score += 10;
  if (/linkedin\.com|github\.com|portfolio|https?:\/\//i.test(text)) score += 5;

  // Standard section headers (30): experience, education, skills.
  if (/^(?:professional |work |relevant )?experience\b|^employment\b/im.test(text)) score += 12;
  if (/^education\b/im.test(text)) score += 9;
  if (/^(?:core |technical |key )?skills\b|^competencies\b/im.test(text)) score += 9;

  // Bullet structure (20): at least 3 recognizable bullet lines.
  const bulletCount = lines.filter((line) => /^(?:[-*•●▪◦]|\d+[.)])\s+/.test(line)).length;
  if (bulletCount >= 3) score += 20;
  else if (bulletCount >= 1) score += 10;

  // Date ranges (15): Month YYYY or YYYY ranges an ATS can order.
  const dateRanges = text.match(/\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}|present|current)/gi) ?? [];
  if (dateRanges.length >= 2) score += 15;
  else if (dateRanges.length === 1) score += 8;

  // Sane length (10): roughly 120-1400 words parses as a real resume.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 120 && wordCount <= 1400) score += 10;
  else if (wordCount >= 60) score += 5;

  return clampScore(score);
}

// ---------------------------------------------------------------------------
// Matching — stem-aware so "Administered medications" satisfies the JD's
// "medication administration". A multi-word term matches only when every
// content word appears on one coherent resume line; exact adjacency is not
// required because resumes legitimately reorder the JD's noun phrases.
// ---------------------------------------------------------------------------

type WordIndex = {
  words: Set<string>;
  stems: string[];
};

type ResumeIndex = WordIndex & {
  lines: Array<WordIndex & { raw: string }>;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#&.-]+/g, " ").replace(/\s+/g, " ").trim();
}

const STEM_SUFFIXES = ["ations", "ation", "ments", "ment", "ings", "ing", "ies", "ied", "ers", "er", "es", "ed", "s"];

/** Light deterministic stemmer: strip one common suffix when a root >= 5 chars remains. */
function stem(word: string): string {
  for (const suffix of STEM_SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 5) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

/** Two stems match when equal, or one extends the other by at most 5 chars on a root of >= 5. */
function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short) && long.length - short.length <= 5;
}

function buildResumeIndex(resumeText: string): ResumeIndex {
  const indexWords = (value: string): WordIndex => {
    const words = new Set(
      normalize(value)
        .split(" ")
        .map((word) => word.replace(/^[.,-]+|[.,-]+$/g, ""))
        .filter(Boolean)
    );
    return { words, stems: Array.from(words, stem) };
  };
  const whole = indexWords(resumeText);
  const lines = resumeText
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, ...indexWords(raw) }));
  return { ...whole, lines };
}

// True cross-vocabulary equivalences, bidirectional. This is NOT a domain
// list: entries only ever widen matching, never gate scoring, and apply
// identically to every career field. Keep it tiny and literal.
const WORD_SYNONYMS: Record<string, string[]> = {
  build: ["built"],
  built: ["build"],
  workforce: ["labor", "labour", "staffing"],
  labor: ["workforce"],
  labour: ["workforce"],
  staffing: ["workforce"],
  plan: ["planning"],
  plans: ["planning"],
  planning: ["plan", "plans"],
  efficient: ["efficiency"],
  efficiency: ["efficient"],
  indicator: ["kpi"],
  indicators: ["kpi"],
  kpi: ["indicator", "indicators"],
  regulation: ["compliance", "regulatory"],
  regulations: ["compliance", "regulatory"],
  regulatory: ["regulation", "regulations", "compliance"],
  compliance: ["regulation", "regulations", "regulatory"],
};

function wordMatchesResume(index: WordIndex, word: string): boolean {
  if (wordDirectlyMatches(index, word)) return true;
  return (WORD_SYNONYMS[word] ?? []).some((synonym) => wordDirectlyMatches(index, synonym));
}

function wordDirectlyMatches(index: WordIndex, word: string): boolean {
  if (index.words.has(word) || index.words.has(`${word}s`) || index.words.has(`${word}es`)) return true;
  if (word.endsWith("s") && index.words.has(word.slice(0, -1))) return true;
  // Short tokens (acronyms, tools) must match exactly — no stem inference.
  if (word.length < 5) return false;
  const target = stem(word);
  return index.stems.some((candidate) => stemsMatch(candidate, target));
}

function findResumeEvidence(index: ResumeIndex, term: string): string | null {
  const termWords = normalize(term)
    .split(" ")
    .map((word) => word.replace(/^[.,-]+|[.,-]+$/g, ""))
    .filter((word) => word && !PHRASE_CONNECTORS.has(word));
  if (termWords.length === 0) return null;

  // A phrase must be demonstrated in one coherent resume line. This prevents
  // unrelated words in education, skills, and experience from combining into
  // evidence the candidate never stated.
  const evidenceLine = index.lines.find((line) =>
    termWords.every((word) => wordMatchesResume(line, word))
  );
  return evidenceLine?.raw ?? null;
}

function buildRequirementDetail(index: ResumeIndex, term: JdTerm): ResumeScanRequirement {
  const evidence = findResumeEvidence(index, term.term);
  return {
    ...describeTerm(term),
    importance: term.importance,
    status: evidence ? "matched" : "missing",
    evidence,
    source: term.source,
    weight: term.weight,
    kind: term.kind,
  };
}

function toKeywordDetail(requirement: ResumeScanRequirement): ResumeScanKeyword {
  return {
    term: requirement.term,
    category: requirement.category,
    why: requirement.why,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function describeTerm(term: JdTerm): ResumeScanKeyword {
  if (term.kind === "role") {
    return {
      term: term.term,
      category: "Target role",
      why: "The posting names this role explicitly. Use the title only when it accurately describes your experience.",
    };
  }
  if (term.kind === "phrase") {
    return {
      term: term.term,
      category: "Job requirement",
      why: "The job description treats this as a unit of required experience.",
    };
  }
  if (term.kind === "named") {
    return {
      term: term.term,
      category: "Named skill or credential",
      why: "The job names this tool, credential, or system explicitly.",
    };
  }
  return {
    term: term.term,
    category: "Job language",
    why: "Add this only when your real experience supports it.",
  };
}

function buildQuickWins(missing: ResumeScanKeyword[], evidenceScore: number) {
  const actions = missing.slice(0, 2).map((item) =>
    item.category === "Target role"
      ? `Use ${item.term} only if it accurately describes a role you held; otherwise show adjacent experience without changing your title.`
      : `Confirm where you used ${item.term} and add a specific example.`
  );
  if (evidenceScore < 75) actions.push("Add one truthful result with scope, metric, and outcome to the strongest role.");
  return actions.length ? actions.slice(0, 3) : ["Verify every claim, then generate the tailored draft."];
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
