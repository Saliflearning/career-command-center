export interface ParsedEducationFact {
  degree: string;
  school: string;
  graduationDate?: string | null;
  expected: boolean;
  gpa?: string | null;
}

export interface ParsedCertificationFact {
  name: string;
  issuingBody?: string | null;
  year?: number | null;
}

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02",
  mar: "03", march: "03", apr: "04", april: "04", may: "05",
  jun: "06", june: "06", jul: "07", july: "07", aug: "08",
  august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11",
  dec: "12", december: "12",
};

const DEGREE_PATTERN = /\b(?:associate|bachelor|master|doctor(?:ate)?|ph\.?d|mba|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?)\b/i;
const EXPECTED_PATTERN = /\b(?:expected|anticipated|in progress|candidate)\b/i;
const CERTIFICATION_HEADING = /^certifications?(?:\s+and\s+licenses?)?$/i;

/**
 * Reconcile model-parsed education against explicit source lines. The source
 * wins for school, degree, date, and completion state; this prevents a model
 * from changing a year or turning a completed degree into "Expected".
 */
export function reconcileEducationFacts(
  parsed: ParsedEducationFact[],
  sourceText: string
): ParsedEducationFact[] {
  const sourceFacts = parseSourceEducation(sourceText);
  if (sourceFacts.length === 0) return dedupeEducation(parsed);

  const reconciled = sourceFacts.map((source) => {
    const model = parsed.find((entry) => educationMatches(entry, source));
    return {
      ...source,
      gpa: model?.gpa?.trim() || source.gpa || null,
    };
  });

  return dedupeEducation(reconciled);
}

/**
 * When a Certifications heading is present, treat that source section as the
 * authority. This keeps credentials such as apprenticeships out of Education
 * and prevents the model from dropping or renaming source credentials.
 */
export function reconcileCertificationFacts(
  parsed: ParsedCertificationFact[],
  sourceText: string
): ParsedCertificationFact[] {
  const sourceFacts = parseSourceCertifications(sourceText);
  if (sourceFacts.length === 0) return dedupeCertifications(parsed);

  return dedupeCertifications(sourceFacts.map((source) => {
    const model = parsed.find((entry) => certificationMatches(entry.name, source.name));
    return {
      ...source,
      issuingBody: model?.issuingBody?.trim() || source.issuingBody || null,
    };
  }));
}

export function parseSourceEducation(sourceText: string): ParsedEducationFact[] {
  const lines = sourceText.split(/\r?\n/);
  const certificationIndex = lines.findIndex((line) =>
    CERTIFICATION_HEADING.test(cleanLine(line))
  );
  const educationLines = certificationIndex >= 0 ? lines.slice(0, certificationIndex) : lines;

  return educationLines.flatMap((rawLine) => {
    const line = cleanLine(rawLine);
    if (!line || CERTIFICATION_HEADING.test(line) || !DEGREE_PATTERN.test(line)) return [];

    const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return [];

    const datePart = [...parts].reverse().find((part) => parseSourceDate(part));
    const graduationDate = datePart ? parseSourceDate(datePart) : null;
    const contentParts = datePart ? parts.filter((part) => part !== datePart) : parts;
    const degree = contentParts[0]?.trim() ?? "";
    const school = contentParts[1]?.trim() ?? "";
    if (!degree || !school || !DEGREE_PATTERN.test(degree)) return [];

    return [{
      degree,
      school,
      graduationDate,
      expected: EXPECTED_PATTERN.test(line),
      gpa: null,
    }];
  });
}

export function parseSourceCertifications(sourceText: string): ParsedCertificationFact[] {
  const lines = sourceText.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) =>
    CERTIFICATION_HEADING.test(cleanLine(line))
  );
  if (headingIndex < 0) return [];

  return lines.slice(headingIndex + 1)
    .join(" ")
    .split("|")
    .flatMap((rawValue) => {
      const value = cleanLine(rawValue);
      if (!value) return [];
      const yearMatch = value.match(/\((19\d{2}|20\d{2})\)\s*$/);
      const name = value.replace(/\s*\((?:19\d{2}|20\d{2})\)\s*$/, "").trim();
      if (!name) return [];
      return [{
        name,
        issuingBody: null,
        year: yearMatch ? Number(yearMatch[1]) : null,
      }];
    });
}

function parseSourceDate(value: string): string | null {
  const match = value.match(
    /\b(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(19\d{2}|20\d{2})\b/i
  );
  if (!match) return null;
  const month = MONTHS[(match[1] ?? "").toLowerCase()] ?? "01";
  return `${match[2]}-${month}`;
}

function educationMatches(left: ParsedEducationFact, right: ParsedEducationFact) {
  const leftFamily = degreeFamily(left.degree);
  const rightFamily = degreeFamily(right.degree);
  const institutionsMatch = comparable(left.school).includes(comparable(right.school))
    || comparable(right.school).includes(comparable(left.school));
  return leftFamily === rightFamily && institutionsMatch;
}

function degreeFamily(value: string) {
  const normalized = comparable(value);
  if (/\b(?:master|ms|ma|mba)\b/.test(normalized)) return "master";
  if (/\b(?:bachelor|bs|ba)\b/.test(normalized)) return "bachelor";
  if (/\bassociate\b/.test(normalized)) return "associate";
  if (/\b(?:doctor|doctorate|phd)\b/.test(normalized)) return "doctorate";
  return normalized;
}

function certificationMatches(left: string, right: string) {
  const leftKey = comparable(left);
  const rightKey = comparable(right);
  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function dedupeEducation(values: ParsedEducationFact[]) {
  const seen = new Set<string>();
  return values.filter((entry) => {
    const key = `${comparable(entry.degree)}|${comparable(entry.school)}`;
    if (!entry.degree.trim() || !entry.school.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeCertifications(values: ParsedCertificationFact[]) {
  const seen = new Set<string>();
  return values.filter((entry) => {
    const key = comparable(entry.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanLine(value: string) {
  return value.replace(/^[\s*\-\u2022\uf0b7]+/, "").replace(/\s+/g, " ").trim();
}

function comparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
