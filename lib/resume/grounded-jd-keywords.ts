import { analyzeResumeAgainstJob } from "@/lib/resume/scan-analysis";
import type { CareerMemory } from "@/lib/types";

function careerMemoryEvidenceText(memory: CareerMemory): string {
  return [
    ...memory.jobs.flatMap((job) => [
      job.title,
      job.company,
      ...job.bullets.map((bullet) => bullet.content),
    ]),
    ...memory.skills.map((skill) => skill.name),
    ...memory.education.flatMap((education) => [education.degree, education.institution]),
    ...memory.certifications.map((certification) => certification.name),
  ].filter(Boolean).join("\n");
}

/**
 * Preserve JD language that is already supported by the canonical source
 * profile. These terms are safe targeting instructions because the scanner
 * can point to real source evidence for every added phrase.
 */
export function mergeGroundedJdKeywords(
  analyzedKeywords: string[],
  memory: CareerMemory,
  jobDescription: string,
  limit = 24
): string[] {
  const grounded = analyzeResumeAgainstJob(
    careerMemoryEvidenceText(memory),
    jobDescription
  ).matchedKeywords;
  const seen = new Set<string>();

  return [...analyzedKeywords, ...grounded]
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      const normalized = keyword.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, limit);
}
