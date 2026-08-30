const SECTION_HEADINGS = new Set([
  "resume",
  "professional summary",
  "summary",
  "profile",
  "core skills",
  "technical skills",
  "skills",
  "professional experience",
  "experience",
  "work experience",
  "education",
  "certifications",
  "projects",
]);

export function normalizeCandidateName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const candidate = value.trim().replace(/\s+/g, " ");
  if (candidate.length < 2 || candidate.length > 80) return null;
  if (/@|https?:\/\/|www\.|linkedin\.|\d/.test(candidate)) return null;
  if (SECTION_HEADINGS.has(candidate.toLowerCase())) return null;

  const words = candidate.split(" ");
  if (words.length > 6) return null;
  if (!words.every(isNameWord)) {
    return null;
  }

  const letterCount = Array.from(candidate).filter(isLetter).length;
  return letterCount >= 2 ? candidate : null;
}

export function extractCandidateNameFromSourceText(
  sourceResumeText: string | null | undefined
): string | null {
  if (!sourceResumeText?.trim()) return null;

  const lines = sourceResumeText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstSectionIndex = lines.findIndex((line) =>
    SECTION_HEADINGS.has(line.replace(/[:\s]+$/g, "").toLowerCase())
  );
  const headerLines = lines.slice(
    0,
    Math.min(firstSectionIndex >= 0 ? firstSectionIndex : lines.length, 12)
  );

  for (const line of headerLines) {
    const beforeContactSeparator = line.split(/\s*[|\u2022\u00b7]\s*/)[0];
    const withoutLabel = beforeContactSeparator.replace(/^name\s*:\s*/i, "");
    const candidate = normalizeCandidateName(withoutLabel);
    if (candidate && candidate.split(" ").length >= 2) return candidate;
  }

  return null;
}

function isLetter(character: string) {
  return character.toLowerCase() !== character.toUpperCase();
}

function isNameWord(word: string) {
  if (!word || !isLetter(word[0])) return false;
  return Array.from(word).every(
    (character) => isLetter(character) || "'\u2019.-".includes(character)
  );
}

export function resolveCandidateName({
  headerName,
  sourceResumeText,
  accountName,
}: {
  headerName: unknown;
  sourceResumeText?: string | null;
  accountName?: unknown;
}): string | null {
  return (
    normalizeCandidateName(headerName) ??
    extractCandidateNameFromSourceText(sourceResumeText) ??
    normalizeCandidateName(accountName)
  );
}
