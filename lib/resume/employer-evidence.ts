const GENERIC_EMPLOYER = /^(?:(?:previous|current|former|past)\s+(?:employer|company|organization|organisation)|(?:employer|company|organization|organisation)\s+name|unknown\s+(?:employer|company)|not\s+provided|n\/?a)$/i;

/**
 * Missing work-history identity is omitted. It is never replaced by a label
 * that a reader could mistake for a candidate fact.
 */
export function normalizeEmployerEvidence(value: string): string {
  const employer = value.trim();
  return GENERIC_EMPLOYER.test(employer) ? "" : employer;
}
