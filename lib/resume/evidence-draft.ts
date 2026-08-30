export interface EvidenceDraft {
  confirmed: boolean;
  source: string;
  details: string;
}

export interface EvidenceInsight {
  term: string;
  category?: string;
}

export interface ConfirmedEvidence {
  term: string;
  category: string;
  source: string;
  details: string;
}

export function updateEvidenceDraft(
  current: Record<string, EvidenceDraft>,
  term: string,
  update: Partial<EvidenceDraft>
): Record<string, EvidenceDraft> {
  const previous = current[term] ?? { confirmed: false, source: "", details: "" };
  const next = { ...previous, ...update };
  if (!next.confirmed) {
    next.source = "";
    next.details = "";
  }
  return {
    ...current,
    [term]: next,
  };
}

export function buildConfirmedEvidence(
  drafts: Record<string, EvidenceDraft>,
  insights: EvidenceInsight[]
): ConfirmedEvidence[] {
  const categories = new Map(
    insights.map((insight) => [insight.term, insight.category])
  );

  return Object.entries(drafts)
    .filter(
      ([, value]) =>
        value.confirmed && value.source.trim() && value.details.trim()
    )
    .map(([term, value]) => ({
      term,
      category: categories.get(term) ?? "User-confirmed evidence",
      source: value.source.trim(),
      details: value.details.trim(),
    }));
}
