import { parseResumePresentation, type ResumePresentation } from "./presentation";

export const MAX_EDITOR_BULLET_LENGTH = 800;
export const MAX_EDITOR_SUMMARY_LENGTH = 2_000;

export type ResumeEditorPatch =
  | { type: "bullet"; bulletId: string; content: string; expectedRevision: number }
  | { type: "summary"; content: string; expectedRevision: number }
  | { type: "presentation"; presentation: ResumePresentation; expectedRevision: number };

export class ResumeEditorPatchError extends Error {}

function cleanContent(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ResumeEditorPatchError("Content is required");
  }
  const content = value.replace(/\s+/g, " ").trim();
  if (!content) throw new ResumeEditorPatchError("Content is required");
  if (content.length > maxLength) {
    throw new ResumeEditorPatchError(`Content must be ${maxLength} characters or fewer`);
  }
  return content;
}

function parseExpectedRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ResumeEditorPatchError("expectedRevision is required");
  }
  return value;
}

export function parseResumeEditorPatch(input: unknown): ResumeEditorPatch {
  if (!input || typeof input !== "object") {
    throw new ResumeEditorPatchError("Invalid editor update");
  }
  const value = input as Record<string, unknown>;

  if (value.type === "summary") {
    return {
      type: "summary",
      content: cleanContent(value.content, MAX_EDITOR_SUMMARY_LENGTH),
      expectedRevision: parseExpectedRevision(value.expectedRevision),
    };
  }

  if (value.type === "bullet") {
    if (typeof value.bulletId !== "string" || !value.bulletId.trim()) {
      throw new ResumeEditorPatchError("bulletId is required");
    }
    return {
      type: "bullet",
      bulletId: value.bulletId.trim(),
      content: cleanContent(value.content, MAX_EDITOR_BULLET_LENGTH),
      expectedRevision: parseExpectedRevision(value.expectedRevision),
    };
  }

  if (value.type === "presentation") {
    return {
      type: "presentation",
      presentation: parseResumePresentation(value.presentation),
      expectedRevision: parseExpectedRevision(value.expectedRevision),
    };
  }

  throw new ResumeEditorPatchError("Unsupported editor update");
}

export function extractEditorMetrics(content: string): string[] {
  return content.match(/(?:\$)?\d+(?:[.,]\d+)*(?:%|[kKmMbBxX]\+?|\+)?/g) ?? [];
}
