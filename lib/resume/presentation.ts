export const RESUME_PRESENTATION_SECTION = "resume_presentation";

export type ResumeFont = "sans" | "serif" | "system";
export type ResumeScale = "compact" | "normal" | "large";
export type ResumeDensity = "tight" | "balanced" | "open";

export interface ResumePresentation {
  font: ResumeFont;
  scale: ResumeScale;
  density: ResumeDensity;
}

export const DEFAULT_RESUME_PRESENTATION: ResumePresentation = {
  font: "sans",
  scale: "normal",
  density: "balanced",
};

const FONTS = new Set<ResumeFont>(["sans", "serif", "system"]);
const SCALES = new Set<ResumeScale>(["compact", "normal", "large"]);
const DENSITIES = new Set<ResumeDensity>(["tight", "balanced", "open"]);

export function parseResumePresentation(value: unknown): ResumePresentation {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { ...DEFAULT_RESUME_PRESENTATION };
    }
  }

  if (!candidate || typeof candidate !== "object") {
    return { ...DEFAULT_RESUME_PRESENTATION };
  }

  const record = candidate as Record<string, unknown>;
  return {
    font: FONTS.has(record.font as ResumeFont)
      ? record.font as ResumeFont
      : DEFAULT_RESUME_PRESENTATION.font,
    scale: SCALES.has(record.scale as ResumeScale)
      ? record.scale as ResumeScale
      : DEFAULT_RESUME_PRESENTATION.scale,
    density: DENSITIES.has(record.density as ResumeDensity)
      ? record.density as ResumeDensity
      : DEFAULT_RESUME_PRESENTATION.density,
  };
}

export function serializeResumePresentation(value: ResumePresentation): string {
  return JSON.stringify(parseResumePresentation(value));
}

export function resumeFontFamily(font: ResumeFont): string {
  if (font === "serif") return "Georgia, 'Times New Roman', serif";
  if (font === "system") return "Arial, Helvetica, sans-serif";
  return "Inter, Arial, Helvetica, sans-serif";
}
