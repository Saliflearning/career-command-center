export interface ParsedExperienceEntry {
  company: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  current: boolean;
  location?: string | null;
  employmentType?: string | null;
  bullets: string[];
}

type SourceRange = {
  startDate: string;
  endDate: string | null;
  current: boolean;
};

type ReconciledEntry = ParsedExperienceEntry & {
  endDate: string | null;
  location: string | null;
  employmentType: string | null;
  sourceRange: "role" | "employer" | "none";
};

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02",
  mar: "03", march: "03", apr: "04", april: "04", may: "05",
  jun: "06", june: "06", jul: "07", july: "07", aug: "08",
  august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11",
  dec: "12", december: "12",
};

const DATE_RANGE = /(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(19\d{2}|20\d{2})\s*[-]\s*(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(19\d{2}|20\d{2}|present|current)/i;

/**
 * Reconcile model-parsed jobs against dates that are actually visible in the
 * uploaded resume. Undated nested headings inherit the employer range and are
 * combined so they cannot become invented concurrent jobs.
 */
export function reconcileExperienceEntries(
  entries: ParsedExperienceEntry[],
  sourceText: string
): ParsedExperienceEntry[] {
  const source = normalizeSource(sourceText);
  const reconciled = entries.map((entry) => reconcileEntry(entry, source));
  const merged = new Map<string, ReconciledEntry>();

  for (const entry of reconciled) {
    const mergeKey = entry.sourceRange === "employer"
      ? [normalizeKey(entry.company), entry.startDate, entry.endDate ?? "present"].join("|")
      : `${normalizeKey(entry.company)}|${normalizeKey(entry.title)}|${entry.startDate}|${entry.endDate ?? ""}`;
    const existing = merged.get(mergeKey);
    if (!existing) {
      merged.set(mergeKey, entry);
      continue;
    }

    existing.bullets = unique([...existing.bullets, ...entry.bullets]);
    existing.location ||= entry.location;
    existing.employmentType ||= entry.employmentType;
  }

  return Array.from(merged.values()).map((entry) => ({
    company: entry.company,
    title: entry.title,
    startDate: entry.startDate,
    endDate: entry.endDate,
    current: entry.current,
    location: entry.location,
    employmentType: entry.employmentType,
    bullets: entry.bullets,
  }));
}

function reconcileEntry(entry: ParsedExperienceEntry, source: string): ReconciledEntry {
  const roleRange = findRangeAfter(source, entry.title, 100);
  const employer = findEmployerRange(source, entry.company, entry.location);
  const sourceRange = roleRange ?? employer?.range ?? null;
  const hasExplicitCurrent = Boolean(sourceRange?.current);

  return {
    ...entry,
    title: roleRange ? entry.title : employer?.heading || entry.title,
    startDate: sourceRange?.startDate ?? entry.startDate,
    endDate: sourceRange?.endDate ?? entry.endDate ?? null,
    current: hasExplicitCurrent,
    location: entry.location ?? null,
    employmentType: entry.employmentType ?? null,
    bullets: unique(entry.bullets.map((bullet) => bullet.trim()).filter(Boolean)),
    sourceRange: roleRange ? "role" : employer ? "employer" : "none",
  };
}

function findEmployerRange(source: string, company: string, location?: string | null) {
  const normalizedCompany = company.trim().toLowerCase();
  let companyIndex = source.toLowerCase().indexOf(normalizedCompany);

  // Company names often appear in the summary before the dated experience
  // section. Walk every occurrence and use the first one with a nearby source
  // date range rather than attaching an undated summary mention to the role.
  while (companyIndex >= 0) {
    const window = source.slice(companyIndex, companyIndex + 300);
    const range = parseRange(window);
    if (range) {
      const beforeRange = window.slice(0, range.index);
      const pieces = beforeRange.split("|").map((piece) => piece.trim()).filter(Boolean);
      const heading = pieces
        .map((piece) => cleanEmployerHeading(piece, company))
        .find((piece) => piece && !looksLikeLocation(piece, location)) ?? "";
      return { range: range.value, heading };
    }
    companyIndex = source.toLowerCase().indexOf(normalizedCompany, companyIndex + normalizedCompany.length);
  }

  return null;
}

function findRangeAfter(source: string, anchor: string, maxDistance: number): SourceRange | null {
  const index = source.toLowerCase().indexOf(anchor.trim().toLowerCase());
  if (index < 0) return null;
  const window = source.slice(index + anchor.length, index + anchor.length + maxDistance);
  const parsed = parseRange(window);
  return parsed?.value ?? null;
}

function parseRange(value: string): { value: SourceRange; index: number } | null {
  const match = DATE_RANGE.exec(value);
  if (!match) return null;
  const startMonth = MONTHS[(match[1] ?? "").toLowerCase()] ?? "01";
  const startDate = `${match[2]}-${startMonth}`;
  const endToken = match[4].toLowerCase();
  const current = endToken === "present" || endToken === "current";
  const endMonth = MONTHS[(match[3] ?? "").toLowerCase()] ?? "12";
  return {
    index: match.index,
    value: {
      startDate,
      endDate: current ? null : `${match[4]}-${endMonth}`,
      current,
    },
  };
}

function cleanEmployerHeading(value: string, company: string) {
  const cleaned = value
    .replace(new RegExp(`^${escapeRegExp(company)}\\s*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 && cleaned.length <= 100 ? cleaned : "";
}

function looksLikeLocation(value: string, knownLocation?: string | null) {
  const normalized = normalizeKey(value);
  if (knownLocation && normalized === normalizeKey(knownLocation)) return true;
  if (/^(remote|hybrid|on site|onsite)$/.test(normalized)) return true;

  const containsRoleWord = /\b(manager|engineer|analyst|director|specialist|coordinator|supervisor|lead|consultant|intern|associate|developer|administrator|architect|officer|president|operations|leadership)\b/i.test(value);
  if (containsRoleWord) return false;

  return /^[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(value)
    || /\b\d{5}(?:-\d{4})?\b/.test(value);
}

function normalizeSource(value: string) {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2022\uf0b7]/g, "\n-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
