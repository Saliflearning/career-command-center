const GENERIC_RECOVERY_MESSAGE =
  "Generation stopped before the draft was ready. Try again.";
const SOURCE_RECOVERY_MESSAGE =
  "We could not read enough resume evidence. Try another file or paste the resume text.";
const JOB_RECOVERY_MESSAGE =
  "We could not read the job description. Return to New Resume and paste it again.";

const SOURCE_FAILURE_MARKERS = [
  "resume.pdfurl is null",
  "failed to fetch file",
  "no readable text",
  "recognisable work experience",
  "recognizable work experience",
  "could not read this file",
];

const JOB_FAILURE_MARKERS = [
  "jdtext is null",
  "job description is missing",
  "missing job description",
];

export function publicPipelineErrorMessage(
  storedError: string | null | undefined
): string | null {
  if (typeof storedError !== "string" || !storedError.trim()) return null;

  const normalized = storedError.toLowerCase();
  if (SOURCE_FAILURE_MARKERS.some((marker) => normalized.includes(marker))) {
    return SOURCE_RECOVERY_MESSAGE;
  }
  if (JOB_FAILURE_MARKERS.some((marker) => normalized.includes(marker))) {
    return JOB_RECOVERY_MESSAGE;
  }
  return GENERIC_RECOVERY_MESSAGE;
}
