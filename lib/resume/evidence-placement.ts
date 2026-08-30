import type { ConfirmedEvidence } from "./evidence-draft";

type EvidenceJob = {
  company: string;
  title: string;
  bullets: string[];
};

const NON_DISTINGUISHING_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "experience",
  "for",
  "in",
  "job",
  "of",
  "position",
  "role",
  "the",
  "work",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NON_DISTINGUISHING_WORDS.has(token));
}

function scoreSourceMatch(source: string, job: EvidenceJob): number {
  const normalizedSource = normalize(source);
  const company = normalize(job.company);
  const title = normalize(job.title);
  if (!normalizedSource) return 0;

  let score = 0;
  if (company && normalizedSource === company) score += 100;
  else if (company && normalizedSource.includes(company)) score += 90;

  const fullTitleMatch = Boolean(
    title && (normalizedSource === title || normalizedSource.includes(title))
  );
  if (title && normalizedSource === title) score += 220;
  else if (title && normalizedSource.includes(title)) score += 200;

  const sourceTokens = new Set(meaningfulTokens(normalizedSource));
  const titleTokens = meaningfulTokens(title);
  const titleTokenMatches = titleTokens.filter((token) => sourceTokens.has(token)).length;
  for (const token of meaningfulTokens(`${company} ${title}`)) {
    if (sourceTokens.has(token)) score += 10;
  }

  const enoughTitleContext =
    fullTitleMatch ||
    titleTokenMatches >= Math.min(2, titleTokens.length);
  return enoughTitleContext ? score : 0;
}

export function placeConfirmedEvidence<T extends EvidenceJob>(
  jobs: T[],
  evidence: ConfirmedEvidence[]
): {
  jobs: T[];
  evidenceBulletKeys: Set<string>;
  unmatched: ConfirmedEvidence[];
} {
  const placedJobs = jobs.map((job) => ({ ...job, bullets: [...job.bullets] }));
  const evidenceBulletKeys = new Set<string>();
  const unmatched: ConfirmedEvidence[] = [];

  for (const item of evidence) {
    const ranked = placedJobs
      .map((job, index) => ({ index, score: scoreSourceMatch(item.source, job) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];

    if (!best || best.score < 60 || (second && second.score === best.score)) {
      unmatched.push(item);
      continue;
    }

    const bulletKey = normalize(item.details);
    if (!bulletKey) continue;
    const job = placedJobs[best.index];
    const alreadyPresent = job.bullets.some(
      (bullet) => normalize(bullet) === bulletKey
    );
    if (!alreadyPresent) {
      job.bullets.push(item.details.trim());
      evidenceBulletKeys.add(item.details.trim().toLowerCase());
    }
  }

  return { jobs: placedJobs, evidenceBulletKeys, unmatched };
}
