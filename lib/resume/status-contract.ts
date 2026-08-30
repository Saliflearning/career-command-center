export interface ResumeGenerationStatus {
  state: string;
  progressPercent: number;
  label: string;
  errorMessage?: string | null;
}

export type ResumeStatusResult =
  | { kind: "ready"; data: ResumeGenerationStatus }
  | { kind: "unauthorized"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

type UnknownRecord = Record<string, unknown>;

export function classifyResumeStatusResponse(
  status: number,
  payload: unknown
): ResumeStatusResult {
  if (status === 401) {
    return {
      kind: "unauthorized",
      message: "Your session expired. Sign in to continue with this resume.",
    };
  }

  if (status === 403 || status === 404) {
    return {
      kind: "unavailable",
      message: "This resume is unavailable. Choose an existing resume or start a new one.",
    };
  }

  if (status !== 200) {
    return {
      kind: "error",
      message: "Resume status could not be loaded. Please try again.",
    };
  }

  const record = asRecord(payload);
  const state = record?.state;
  const progressPercent = record?.progressPercent;
  const label = record?.label;
  if (
    typeof state !== "string" ||
    !state.trim() ||
    typeof progressPercent !== "number" ||
    !Number.isFinite(progressPercent) ||
    progressPercent < 0 ||
    progressPercent > 100 ||
    typeof label !== "string" ||
    !label.trim()
  ) {
    return {
      kind: "error",
      message: "Resume status is incomplete. Please refresh and try again.",
    };
  }

  return {
    kind: "ready",
    data: {
      state,
      progressPercent,
      label,
      errorMessage:
        typeof record?.errorMessage === "string" ? record.errorMessage : null,
    },
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}
