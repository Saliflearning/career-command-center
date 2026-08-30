import { analyzeResumeAgainstJob } from "./scan-analysis";

type EvidenceRetentionResult = {
  bullets: string[];
  restored: string[];
};

/**
 * Keep user-supplied measurable proof from disappearing during tailoring.
 * This never creates or edits a claim: it can only restore a source bullet
 * verbatim when generated wording omitted one of its numeric facts.
 */
export function retainQuantifiedSourceEvidence(
  sourceBullets: string[],
  generatedBullets: string[],
  limit: number,
  jobDescription = ""
): EvidenceRetentionResult {
  const safeLimit = Math.max(1, limit);
  const generated = dedupeBullets(generatedBullets).slice(0, safeLimit);
  const requiredMetrics = new Set(extractMetricTokens(sourceBullets.join("\n")));
  const generatedMetrics = new Set(extractMetricTokens(generated.join("\n")));
  const sourceMatchedTerms = jobDescription.trim()
    ? new Set(analyzeResumeAgainstJob(sourceBullets.join("\n"), jobDescription).matchedKeywords)
    : new Set<string>();
  const generatedMatchedTerms = jobDescription.trim()
    ? new Set(analyzeResumeAgainstJob(generated.join("\n"), jobDescription).matchedKeywords)
    : new Set<string>();

  // An unquantified, job-irrelevant source bullet must never displace a
  // tailored rewrite. Source candidates enter selection only when they carry
  // a measurable fact or preserve JD language already proven by that bullet.
  const eligibleSource = dedupeBullets(sourceBullets).filter((bullet) => {
    if (extractMetricTokens(bullet).some((metric) => !generatedMetrics.has(metric))) return true;
    if (hasConcreteToolEvidence(bullet)) return true;
    if (!jobDescription.trim()) return false;
    return analyzeResumeAgainstJob(bullet, jobDescription).matchedKeywords
      .some((term) => sourceMatchedTerms.has(term) && !generatedMatchedTerms.has(term));
  });

  const candidates = dedupeBullets([...generated, ...eligibleSource]);
  if (candidates.length <= safeLimit) {
    return {
      bullets: candidates,
      restored: candidates.filter((bullet) =>
        eligibleSource.some((source) => normalize(source) === normalize(bullet)) &&
        !generated.some((item) => normalize(item) === normalize(bullet))
      ),
    };
  }

  const generatedKeys = new Set(generated.map(normalize));
  let best: string[] = generated;
  let bestScore = scoreSelection(best, requiredMetrics, sourceMatchedTerms, jobDescription, generatedKeys);

  for (const selection of combinations(candidates, safeLimit)) {
    const selectionScore = scoreSelection(
      selection,
      requiredMetrics,
      sourceMatchedTerms,
      jobDescription,
      generatedKeys
    );
    if (compareScores(selectionScore, bestScore) > 0) {
      best = selection;
      bestScore = selectionScore;
    }
  }

  const restored = best.filter((bullet) =>
    eligibleSource.some((source) => normalize(source) === normalize(bullet)) &&
    !generatedKeys.has(normalize(bullet))
  );
  return { bullets: best, restored };
}

type SelectionScore = [number, number, number, number, number];

function scoreSelection(
  bullets: string[],
  requiredMetrics: Set<string>,
  sourceMatchedTerms: Set<string>,
  jobDescription: string,
  generatedKeys: Set<string>
): SelectionScore {
  const text = bullets.join("\n");
  const metrics = new Set(extractMetricTokens(text));
  const matchedTerms = jobDescription.trim()
    ? new Set(analyzeResumeAgainstJob(text, jobDescription).matchedKeywords)
    : new Set<string>();
  return [
    Array.from(requiredMetrics).filter((metric) => metrics.has(metric)).length,
    Array.from(sourceMatchedTerms).filter((term) => matchedTerms.has(term)).length,
    matchedTerms.size,
    bullets.reduce((sum, bullet) => sum + evidenceValue(bullet), 0),
    bullets.filter((bullet) => generatedKeys.has(normalize(bullet))).length,
  ];
}

function compareScores(left: SelectionScore, right: SelectionScore): number {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function combinations(values: string[], size: number): string[][] {
  const result: string[][] = [];
  const visit = (start: number, selected: string[]) => {
    if (selected.length === size) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= values.length - (size - selected.length); index++) {
      visit(index + 1, [...selected, values[index]]);
    }
  };
  visit(0, []);
  return result;
}

function dedupeBullets(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [value.trim()];
  });
}

export function extractMetricTokens(value: string) {
  return (
    value.match(
      /\d[\d,]*(?:\.\d+)?\s*(?:%|percent|percentage points?|\+|x|k|m|b|hours?|days?|people|users?|customers?|associates?|dollars?)?/gi
    ) ?? []
  ).map(canonicalMetric);
}

function canonicalMetric(token: string) {
  return token
    .toLowerCase()
    .replace(/[\s,]/g, "")
    .replace(/percentagepoints?$/, "pp")
    .replace(/percent$/, "%");
}

function evidenceValue(value: string) {
  const metrics = extractMetricTokens(value).length;
  const outcomes = (value.match(/\b(reduced|increased|improved|saved|grew|delivered|cut|accelerated|prevented|achieved)\b/gi) ?? []).length;
  const action = /^(built|led|managed|created|designed|implemented|analyzed|developed|coordinated|optimized|delivered|reduced|increased)\b/i.test(value.trim()) ? 1 : 0;
  return metrics * 4 + outcomes * 2 + action + (hasConcreteToolEvidence(value) ? 3 : 0);
}

function hasConcreteToolEvidence(value: string) {
  return /\b(?:python|sql|excel|power bi|tableau|sap|oracle|jd edwards|erp|mrp|wms|jira|confluence|sharepoint|servicenow|aws|azure|docker|git)\b/i.test(value)
    && /^(?:built|created|developed|documented|implemented|analyzed|automated|configured|maintained|used|validated|tracked)\b/i.test(value.trim());
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
