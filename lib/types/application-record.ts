/**
 * ApplicationRecord — canonical wire-format JSON schema
 *
 * Produced by: Application Tracking agent (auto-created on EXPORTED state)
 * Consumed by: app/tracker screen (A11), app/dashboard (A12), app/analytics (A14)
 *
 * Auto-creation flow: Resume reaches EXPORTED state → Orchestrator calls
 * Application Tracking agent → ApplicationRecord created → Resume transitions to TRACKED.
 * User can opt out of auto-tracking in Settings (§15).
 */

export type ApplicationStatus =
  | "READY_TO_APPLY"
  | "APPLIED"
  | "INTERVIEWING"
  | "OFFER"
  | "REJECTED"
  | "WITHDRAWN";

export interface InterviewLogEntry {
  date: string;         // ISO 8601
  type: "phone" | "technical" | "behavioral" | "final" | "other";
  notes: string;
  outcome: string | null;
}

/**
 * The full ApplicationRecord as returned by API and used in the tracker UI.
 */
export interface ApplicationRecord {
  id: string;
  userId: string;
  resumeId: string;

  // Role info — populated from Resume.targetRole / Resume.targetCompany
  company: string;
  role: string;

  // Status
  status: ApplicationStatus;
  appliedAt: string | null;    // ISO 8601 — null until user confirms they applied
  followUpAt: string | null;   // ISO 8601 — reminder date

  // Resume snapshot — the version used for this application
  resumeVersion: number;
  resumePdfUrl: string | null; // Supabase signed URL

  // Quality scores at time of export
  atsScore: number | null;     // 0–100
  keywordScore: number | null; // 0–100
  pageCount: number | null;

  // User-maintained fields
  notes: string | null;
  interviewLog: InterviewLogEntry[];

  // Auto-populated from JDAnalysis
  targetKeywords: string[];    // keywords from the JD this resume targeted

  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}

/**
 * Lightweight version for the tracker table and kanban card.
 * Full ApplicationRecord is only fetched when the detail drawer opens.
 */
export interface ApplicationSummary {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedAt: string | null;
  followUpAt: string | null;
  resumeVersion: number;
  keywordScore: number | null;
}
