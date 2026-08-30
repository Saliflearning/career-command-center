// ---------------------------------------------------------------------------
// Resume de-identification (BACKLOG privacy rule; specs/personalized-resume-
// learning FR-009/FR-010).
//
// A user's real resume may be used LOCALLY as an eval fixture with no risk —
// those files are git-ignored and never shared. But before ANY resume could
// enter a shared training corpus that serves other users, its direct
// identifiers must be removed. This module is that gate.
//
// What it removes (high-confidence direct identifiers):
//   - email addresses            -> [EMAIL]
//   - phone numbers              -> [PHONE]
//   - profile / portfolio URLs   -> [URL]
//   - street addresses           -> [ADDRESS]
//   - the candidate's own name   -> [CANDIDATE]   (when provided)
//
// What it KEEPS (semantically load-bearing, and not the candidate's PII):
//   - employer names, school names, job titles, skills, metrics, city/state.
//
// HONEST LIMITATION: this removes direct identifiers, not all re-identification
// risk. The combination of employer + dates + title can still identify a
// person. True anonymization for a shared corpus requires human review; this
// function is the automated first line, not the whole policy. `findResidualPii`
// surfaces likely leftovers for that review.
// ---------------------------------------------------------------------------

export interface DeidentifyResult {
  text: string;
  replaced: { emails: number; phones: number; urls: number; addresses: number; names: number };
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)]+|(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s)]+/gi;
// Phone: 10+ digit sequences with common separators, optional +country / ext.
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
// Street address: number + street words. City/state lines are intentionally kept.
const ADDRESS_RE = /\b\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|cir|place|pl|terrace|ter)\.?\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove direct identifiers from a resume. Pass the candidate's full name to
 * also scrub every occurrence of it (and its individual parts >= 3 chars).
 */
export function deidentifyResume(text: string, candidateName?: string): DeidentifyResult {
  let out = text;
  const replaced = { emails: 0, phones: 0, urls: 0, addresses: 0, names: 0 };

  out = out.replace(URL_RE, () => (replaced.urls++, "[URL]"));
  out = out.replace(EMAIL_RE, () => (replaced.emails++, "[EMAIL]"));
  out = out.replace(ADDRESS_RE, () => (replaced.addresses++, "[ADDRESS]"));
  out = out.replace(PHONE_RE, (m) => {
    // Guard against nuking date ranges / plain years that lack phone shape.
    if (m.replace(/\D/g, "").length < 10) return m;
    replaced.phones++;
    return "[PHONE]";
  });

  if (candidateName?.trim()) {
    const full = candidateName.trim();
    const fullRe = new RegExp(escapeRegExp(full), "gi");
    out = out.replace(fullRe, () => (replaced.names++, "[CANDIDATE]"));
    // Also scrub standalone name parts (first/last), but only whole words.
    for (const part of full.split(/\s+/).filter((p) => p.length >= 3)) {
      const partRe = new RegExp(`\\b${escapeRegExp(part)}\\b`, "gi");
      out = out.replace(partRe, () => (replaced.names++, "[CANDIDATE]"));
    }
  }

  return { text: out, replaced };
}

/**
 * Best-effort audit: return snippets that still look like direct identifiers
 * after de-identification, for the human review step. Empty array = the
 * automated pass found nothing obvious (NOT a guarantee of anonymity).
 */
export function findResidualPii(text: string): string[] {
  const found: string[] = [];
  const email = text.match(EMAIL_RE);
  const phone = text.match(PHONE_RE)?.filter((m) => m.replace(/\D/g, "").length >= 10);
  const url = text.match(URL_RE);
  if (email?.length) found.push(`email(s): ${email.slice(0, 3).join(", ")}`);
  if (phone?.length) found.push(`phone(s): ${phone.slice(0, 3).join(", ")}`);
  if (url?.length) found.push(`url(s): ${url.slice(0, 3).join(", ")}`);
  return found;
}
