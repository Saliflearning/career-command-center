import type { StructuredResumeExportInput } from "@/lib/export/structured-resume-pdf";

/**
 * Section headings the visual gate must find in a rendered resume.
 *
 * Kept free of database and storage imports so render diagnostics and tests can
 * use the exact production expectation without loading those adapters.
 */
export function expectedSectionsFor(input: StructuredResumeExportInput): string[] {
  const sections: string[] = [];
  if (input.summary) sections.push("Professional Summary");
  if (input.skills.length > 0) {
    sections.push(
      input.roleType === "TECHNICAL" || input.roleType === "DATA"
        ? "Technical Skills"
        : "Core Skills"
    );
  }
  if (input.jobs.length > 0) sections.push("Professional Experience");
  if (input.education.length > 0) sections.push("Education");
  if (input.certifications.length > 0) sections.push("Certifications");
  return sections;
}
