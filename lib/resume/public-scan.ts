import { inferJobDetails } from "./job-target-detection";
import {
  analyzeResumeAgainstJob,
  type ResumeScanAnalysis,
  type ResumeScanKeyword,
} from "./scan-analysis";

export const PUBLIC_SCAN_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const PUBLIC_SCAN_MIN_RESUME_CHARS = 80;
export const PUBLIC_SCAN_MAX_RESUME_CHARS = 30_000;
export const PUBLIC_SCAN_MIN_JD_CHARS = 50;
export const PUBLIC_SCAN_MAX_JD_CHARS = 40_000;

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type PublicResumeScanAnalysis = Pick<
  ResumeScanAnalysis,
  | "score"
  | "atsScore"
  | "keywordScore"
  | "evidenceScore"
  | "signalScore"
  | "fitLabel"
  | "summary"
  | "matchedCount"
  | "missingCount"
  | "totalKeywords"
  | "matchedKeywords"
  | "requirementDetails"
  | "quickWins"
> & {
  missingKeywordDetails: ResumeScanKeyword[];
};

export type PublicResumeScanResult = {
  target: { role: string; company: string };
  analysis: PublicResumeScanAnalysis;
};

export type PublicUploadKind = typeof PDF_MIME | typeof DOCX_MIME;

export function validatePublicResumeText(value: unknown): string {
  if (typeof value !== "string") throw new PublicScanInputError("resumeText must be a string.");
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length < PUBLIC_SCAN_MIN_RESUME_CHARS) {
    throw new PublicScanInputError("Paste at least 80 characters of resume text.");
  }
  if (text.length > PUBLIC_SCAN_MAX_RESUME_CHARS) {
    throw new PublicScanInputError("Resume text must be 30,000 characters or fewer.");
  }
  return text;
}

export function validatePublicJobDescription(value: unknown): string {
  if (typeof value !== "string") {
    throw new PublicScanInputError("jobDescription must be a string.");
  }
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length < PUBLIC_SCAN_MIN_JD_CHARS) {
    throw new PublicScanInputError("Paste at least 50 characters of the job description.");
  }
  if (text.length > PUBLIC_SCAN_MAX_JD_CHARS) {
    throw new PublicScanInputError("Job descriptions must be 40,000 characters or fewer.");
  }
  return text;
}

export function validatePublicUpload(file: File, bytes: Buffer): PublicUploadKind {
  if (file.size === 0) throw new PublicScanInputError("Resume file is empty.");
  if (file.size > PUBLIC_SCAN_MAX_FILE_BYTES) {
    throw new PublicScanInputError("Resume files must be 5 MB or smaller.", 413);
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  const extensionKind = extension === "pdf" ? PDF_MIME : extension === "docx" ? DOCX_MIME : null;
  const mimeKind = file.type === PDF_MIME ? PDF_MIME : file.type === DOCX_MIME ? DOCX_MIME : null;

  if (!extensionKind && !mimeKind) throw new PublicScanInputError("Use a PDF or DOCX resume.");
  if (extensionKind && mimeKind && extensionKind !== mimeKind) {
    throw new PublicScanInputError("The file extension and file type do not match.");
  }

  const kind = extensionKind ?? mimeKind!;
  if (kind === PDF_MIME && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new PublicScanInputError("This file does not appear to be a valid PDF.");
  }
  if (
    kind === DOCX_MIME &&
    !(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
  ) {
    throw new PublicScanInputError("This file does not appear to be a valid DOCX.");
  }
  return kind;
}

export function buildPublicResumeScan(
  resumeText: string,
  jobDescription: string
): PublicResumeScanResult {
  const full = analyzeResumeAgainstJob(resumeText, jobDescription);
  const {
    score,
    atsScore,
    keywordScore,
    evidenceScore,
    signalScore,
    fitLabel,
    summary,
    matchedCount,
    missingCount,
    totalKeywords,
    matchedKeywords,
    requirementDetails,
    missingKeywordDetails,
    quickWins,
  } = full;

  return {
    target: inferJobDetails(jobDescription),
    analysis: {
      score,
      atsScore,
      keywordScore,
      evidenceScore,
      signalScore,
      fitLabel,
      summary,
      matchedCount,
      missingCount,
      totalKeywords,
      matchedKeywords,
      requirementDetails,
      missingKeywordDetails,
      quickWins,
    },
  };
}

export class PublicScanInputError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "PublicScanInputError";
  }
}
