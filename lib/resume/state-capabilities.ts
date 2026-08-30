const EXPORTABLE_RESUME_STATES = new Set([
  "QA_REVIEWED",
  "USER_EDITING",
  "EXPORTED",
  "TRACKED",
]);

export function isResumeExportableState(
  state: string | null | undefined
): boolean {
  return typeof state === "string" && EXPORTABLE_RESUME_STATES.has(state);
}