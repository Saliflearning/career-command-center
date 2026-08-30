import {
  DEFAULT_RESUME_PRESENTATION,
  parseResumePresentation,
  type ResumePresentation,
} from "./presentation";

export interface ResumeBulletContent {
  bulletId: string;
  content: string;
  contentType: string;
}

export interface ResumeWorkHistoryContent {
  workHistoryId: string;
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  current: boolean;
  dateLabel?: string;
  sortOrder: number;
  bullets: ResumeBulletContent[];
}

export interface ResumeSectionContent {
  name: string;
  sortOrder: number;
  visible: boolean;
  content: string | null;
}

export interface ResumeEducationContent {
  degree: string;
  institution: string;
  graduationDate: string | null;
  inProgress: boolean;
  gpa: string | null;
  dateLabel?: string;
  details?: string;
}

export interface ResumeSkillContent {
  name: string;
  category: string | null;
}

export interface ResumeCertificationContent {
  name: string;
  issuingBody: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  dateLabel?: string;
}

export interface ResumeProjectContent {
  id: string;
  name: string;
  description: string | null;
  technologies: string[];
  url: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface ResumeContent {
  resumeId: string;
  documentRevision: number;
  jdText: string | null;
  targetRole: string;
  targetCompany: string | null;
  roleType: string | null;
  state: string;
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateLinkedin: string | null;
  candidateLocation: string | null;
  candidateWebsite: string | null;
  candidateHeadline: string | null;
  honestStretchNote: string | null;
  summaryText: string | null;
  presentation: ResumePresentation;
  sections: ResumeSectionContent[];
  workHistory: ResumeWorkHistoryContent[];
  education: ResumeEducationContent[];
  certifications: ResumeCertificationContent[];
  skills: ResumeSkillContent[];
  projects: ResumeProjectContent[];
  atsScore: number | null;
  keywordScore: number | null;
  diagnostic: {
    issues: string[];
    recommendations: string[];
    needsReview: boolean;
  } | null;
  hasLatex: boolean;
}

export type ResumeContentResult =
  | { kind: "ready"; data: ResumeContent }
  | { kind: "processing"; state: string | null; message: string | null }
  | { kind: "unauthorized"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

type UnknownRecord = Record<string, unknown>;

export function classifyResumeContentResponse(
  status: number,
  payload: unknown
): ResumeContentResult {
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

  if (status === 202) {
    const record = asRecord(payload);
    return {
      kind: "processing",
      state: nullableString(record?.state),
      message: "This resume is still being generated.",
    };
  }

  if (status !== 200) {
    return {
      kind: "error",
      message: "Resume content could not be loaded. Please try again.",
    };
  }

  const data = normalizeResumeContent(payload);
  return data
    ? { kind: "ready", data }
    : { kind: "error", message: "Resume content is incomplete. Please try again." };
}

export function normalizeResumeContent(payload: unknown): ResumeContent | null {
  const record = asRecord(payload);
  if (!record || typeof record.resumeId !== "string" || !record.resumeId.trim()) return null;
  const sections = arrayValue(record.sections).map(normalizeSection).filter(isPresent);
  const summaryText =
    normalizeResumeSummaryText(record.summaryText) ??
    sections
      .filter((section) => section.visible)
      .find((section) => section.name.toLowerCase().includes("summary"))
      ?.content ??
    null;

  return {
    resumeId: record.resumeId,
    documentRevision: Math.max(1, Math.trunc(numberValue(record.documentRevision) || 1)),
    jdText: nullableString(record.jdText),
    targetRole: stringValue(record.targetRole),
    targetCompany: nullableString(record.targetCompany),
    roleType: nullableString(record.roleType),
    state: stringValue(record.state),
    candidateName: nullableString(record.candidateName),
    candidateEmail: nullableString(record.candidateEmail),
    candidatePhone: nullableString(record.candidatePhone),
    candidateLinkedin: nullableString(record.candidateLinkedin),
    candidateLocation: nullableString(record.candidateLocation),
    candidateWebsite: nullableString(record.candidateWebsite),
    candidateHeadline: nullableString(record.candidateHeadline),
    honestStretchNote: nullableString(record.honestStretchNote),
    summaryText,
    presentation: record.presentation
      ? parseResumePresentation(record.presentation)
      : { ...DEFAULT_RESUME_PRESENTATION },
    sections,
    workHistory: arrayValue(record.workHistory).map(normalizeWorkHistory).filter(isPresent),
    education: arrayValue(record.education).map(normalizeEducation).filter(isPresent),
    certifications: arrayValue(record.certifications).map(normalizeCertification).filter(isPresent),
    skills: arrayValue(record.skills).map(normalizeSkill).filter(isPresent),
    projects: arrayValue(record.projects).map(normalizeProject).filter(isPresent),
    atsScore: nullableNumber(record.atsScore),
    keywordScore: nullableNumber(record.keywordScore),
    diagnostic: normalizeDiagnostic(record.diagnostic),
    hasLatex: record.hasLatex === true,
  };
}

export function normalizeResumeSummaryText(value: unknown): string | null {
  const summary = nullableString(value);
  if (!summary) return null;

  // A short-lived editor build persisted this UI placeholder in one QA record.
  // It is not candidate content and must never appear in a resume or export.
  return summary.trim() === "Loading summary..." ? null : summary;
}

export function sourceResumeTextFromSections(
  sections: ResumeSectionContent[]
): string | null {
  const source = sections.find(
    (section) => section.name.trim().toLowerCase() === "source_resume"
  )?.content;
  return source?.trim() || null;
}

function normalizeSection(value: unknown): ResumeSectionContent | null {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string") return null;
  return {
    name: record.name,
    sortOrder: numberValue(record.sortOrder),
    visible: record.visible !== false,
    content: nullableString(record.content),
  };
}

function normalizeWorkHistory(value: unknown): ResumeWorkHistoryContent | null {
  const record = asRecord(value);
  if (!record || typeof record.workHistoryId !== "string") return null;
  return {
    workHistoryId: record.workHistoryId,
    company: stringValue(record.company),
    title: stringValue(record.title),
    location: nullableString(record.location),
    startDate: stringValue(record.startDate),
    endDate: nullableString(record.endDate),
    current: record.current === true,
    ...(nullableString(record.dateLabel)
      ? { dateLabel: nullableString(record.dateLabel)! }
      : {}),
    sortOrder: numberValue(record.sortOrder),
    bullets: arrayValue(record.bullets).map(normalizeBullet).filter(isPresent),
  };
}

function normalizeBullet(value: unknown): ResumeBulletContent | null {
  const record = asRecord(value);
  if (!record || typeof record.bulletId !== "string" || typeof record.content !== "string") return null;
  return {
    bulletId: record.bulletId,
    content: record.content,
    contentType: stringValue(record.contentType),
  };
}

function normalizeEducation(value: unknown): ResumeEducationContent | null {
  const record = asRecord(value);
  if (!record || typeof record.degree !== "string" || typeof record.institution !== "string") return null;
  return {
    degree: record.degree,
    institution: record.institution,
    graduationDate: nullableString(record.graduationDate),
    inProgress: record.inProgress === true,
    gpa: nullableString(record.gpa),
    ...(nullableString(record.dateLabel)
      ? { dateLabel: nullableString(record.dateLabel)! }
      : {}),
    ...(nullableString(record.details)
      ? { details: nullableString(record.details)! }
      : {}),
  };
}

function normalizeCertification(value: unknown): ResumeCertificationContent | null {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string") return null;
  return {
    name: record.name,
    issuingBody: nullableString(record.issuingBody),
    issueDate: nullableString(record.issueDate),
    expiryDate: nullableString(record.expiryDate),
    ...(nullableString(record.dateLabel)
      ? { dateLabel: nullableString(record.dateLabel)! }
      : {}),
  };
}

function normalizeSkill(value: unknown): ResumeSkillContent | null {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string") return null;
  return { name: record.name, category: nullableString(record.category) };
}

function normalizeProject(value: unknown): ResumeProjectContent | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.name !== "string") return null;
  return {
    id: record.id,
    name: record.name,
    description: nullableString(record.description),
    technologies: arrayValue(record.technologies).filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    ),
    url: nullableString(record.url),
    startDate: nullableString(record.startDate),
    endDate: nullableString(record.endDate),
  };
}

function normalizeDiagnostic(value: unknown): ResumeContent["diagnostic"] {
  const record = asRecord(value);
  if (!record) return null;
  return {
    issues: arrayValue(record.issues).filter((item): item is string => typeof item === "string"),
    recommendations: arrayValue(record.recommendations).filter((item): item is string => typeof item === "string"),
    needsReview: record.needsReview === true,
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
