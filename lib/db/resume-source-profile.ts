import { db } from "@/lib/db/client";
import type { CareerMemory } from "@/lib/types";

const SOURCE_PROFILE_SECTION = "source_profile";

/** Store the immutable normalized facts from one source resume. */
export async function persistResumeSourceProfile(
  resumeId: string,
  profile: CareerMemory
): Promise<void> {
  await db.$transaction([
    db.resumeSection.deleteMany({ where: { resumeId, name: SOURCE_PROFILE_SECTION } }),
    db.resumeSection.create({
      data: {
        resumeId,
        name: SOURCE_PROFILE_SECTION,
        visible: false,
        sortOrder: -9,
        content: JSON.stringify(profile),
      },
    }),
  ]);
}

/** Load the immutable normalized source profile for one resume. */
export async function fetchResumeSourceProfile(
  resumeId: string
): Promise<CareerMemory | null> {
  const section = await db.resumeSection.findFirst({
    where: { resumeId, name: SOURCE_PROFILE_SECTION },
    select: { content: true },
  });
  if (!section?.content) return null;

  try {
    const parsed = JSON.parse(section.content) as CareerMemory;
    if (!parsed.id || !parsed.userId || !Array.isArray(parsed.jobs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Hydrate source-scoped jobs with their current bullets for this pipeline run.
 * The result is deliberately not persisted: source_profile remains the
 * immutable record of what the uploaded or pasted resume actually contained.
 */
export async function refreshResumeSourceProfile(
  resumeId: string,
  profile: CareerMemory
): Promise<CareerMemory> {
  const jobs = await db.workHistory.findMany({
    where: { id: { in: profile.jobs.map((job) => job.id) } },
    include: {
      bullets: {
        include: {
          usedInResumes: {
            where: { resumeId },
            select: { id: true },
          },
        },
      },
    },
  });
  const byId = new Map(jobs.map((job) => [job.id, job]));

  const refreshed: CareerMemory = {
    ...profile,
    jobs: profile.jobs.map((sourceJob) => {
      const job = byId.get(sourceJob.id);
      if (!job) return sourceJob;
      return {
        ...sourceJob,
        company: job.company,
        title: job.title,
        startDate: job.startDate.toISOString(),
        endDate: job.endDate?.toISOString() ?? null,
        current: job.endDate ? false : job.current,
        location: job.location,
        employmentType: job.employmentType,
        bullets: job.bullets
          .filter(
            (bullet) =>
              bullet.contentType !== "GENERATED" || bullet.usedInResumes.length > 0
          )
          .map((bullet) => ({
            id: bullet.id,
            content: bullet.content,
            contentType: bullet.contentType,
            metrics: bullet.metrics,
            keywords: bullet.keywords,
            locked: bullet.locked,
            usedInResumeCount: 0,
          })),
      };
    }),
    updatedAt: new Date().toISOString(),
  };

  return refreshed;
}
