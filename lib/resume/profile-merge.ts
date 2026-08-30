// ---------------------------------------------------------------------------
// Career Profile -> resume snapshot merge.
//
// Generation reads a per-resume source_profile snapshot (document-scoped for
// safety: one resume must never inherit another draft's wording). Before this
// module existed, that isolation also cut Career Profile facts out of every
// new draft — memory was write-only (coordination/CHALLENGES.md C-003).
//
// Rule, product-owner decision, 2026-07-16: ONLY user-vouched facts merge in.
//   - Work history: entries the user explicitly verified or locked on /memory.
//   - Education / skills / certifications / projects: entries marked verified
//     by the mapper (MANUAL sourceType = the user typed them).
// Everything unverified stays document-scoped. Merged jobs contribute only
// their non-GENERATED bullets, so AI wording never crosses resumes.
// ---------------------------------------------------------------------------

import type { CareerMemory, WorkHistoryEntry } from "@/lib/types";

function key(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

function vouchedJob(job: WorkHistoryEntry): WorkHistoryEntry {
  return {
    ...job,
    bullets: job.bullets.filter((bullet) => bullet.contentType !== "GENERATED"),
  };
}

/**
 * Returns a new snapshot with the user's vouched Career Profile facts merged
 * in. Never mutates its inputs. Document-scoped entries always win on
 * collision; profile facts are only ever appended.
 */
export function mergeUserVouchedProfileFacts(
  snapshot: CareerMemory,
  memory: CareerMemory
): CareerMemory {
  const jobKeys = new Set(snapshot.jobs.map((job) => key(job.company, job.title)));
  const mergedJobs = memory.jobs
    .filter((job) => (job.verified || job.locked) && !jobKeys.has(key(job.company, job.title)))
    .map(vouchedJob)
    .filter((job) => job.bullets.length > 0 || job.verified);

  const eduKeys = new Set(snapshot.education.map((entry) => key(entry.degree, entry.institution)));
  const mergedEducation = memory.education.filter(
    (entry) => entry.verified && !eduKeys.has(key(entry.degree, entry.institution))
  );

  const skillKeys = new Set(snapshot.skills.map((entry) => key(entry.name)));
  const mergedSkills = memory.skills.filter(
    (entry) => entry.verified && !skillKeys.has(key(entry.name))
  );

  const certKeys = new Set(snapshot.certifications.map((entry) => key(entry.name)));
  const mergedCerts = memory.certifications.filter(
    (entry) => entry.verified && !certKeys.has(key(entry.name))
  );

  const projectKeys = new Set(snapshot.projects.map((entry) => key(entry.name)));
  const mergedProjects = memory.projects.filter(
    (entry) => entry.verified && !projectKeys.has(key(entry.name))
  );

  if (
    mergedJobs.length === 0 &&
    mergedEducation.length === 0 &&
    mergedSkills.length === 0 &&
    mergedCerts.length === 0 &&
    mergedProjects.length === 0
  ) {
    return snapshot;
  }

  const maxSortOrder = snapshot.jobs.reduce((max, job) => Math.max(max, job.sortOrder), -1);

  return {
    ...snapshot,
    jobs: [
      ...snapshot.jobs,
      ...mergedJobs.map((job, index) => ({ ...job, sortOrder: maxSortOrder + 1 + index })),
    ],
    education: [...snapshot.education, ...mergedEducation],
    skills: [...snapshot.skills, ...mergedSkills],
    certifications: [...snapshot.certifications, ...mergedCerts],
    projects: [...snapshot.projects, ...mergedProjects],
  };
}
