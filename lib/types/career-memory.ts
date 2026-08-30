/**
 * CareerMemory — canonical wire-format JSON schema
 *
 * This is the structured representation of a user's complete professional
 * history as it flows between agents. Every agent that reads or writes career
 * data MUST conform to this schema.
 *
 * Source of truth: the Prisma DB is the persistence layer; this type is the
 * in-memory / over-the-wire contract.
 */

export type SourceType = "UPLOADED" | "MANUAL" | "GENERATED";
export type ContentType = "VERIFIED" | "GENERATED" | "USER_EDITED";

export interface CareerMemoryBullet {
  id: string;
  content: string;
  contentType: ContentType;
  metrics: string[];         // e.g. ["$2M", "40%", "12 engineers"]
  keywords: string[];        // ATS-relevant terms extracted from this bullet
  locked: boolean;           // if true: AI CANNOT rewrite under any circumstance
  usedInResumeCount: number; // how many resumes this bullet has appeared in
}

export interface WorkHistoryEntry {
  id: string;
  company: string;
  title: string;
  startDate: string;         // ISO 8601 date string: "2021-03-01"
  endDate: string | null;    // null = current role
  current: boolean;
  location: string | null;
  employmentType: string | null; // "Full-Time" | "Part-Time" | "Contract" | "Internship"
  bullets: CareerMemoryBullet[];
  sourceType: SourceType;
  verified: boolean;
  locked: boolean;
  sortOrder: number;
}

export interface EducationEntry {
  id: string;
  degree: string;            // e.g. "Bachelor of Science in Computer Science"
  institution: string;
  graduationDate: string | null;  // ISO 8601 or null if in-progress
  expectedDate: string | null;    // set if still in progress
  inProgress: boolean;
  gpa: string | null;
  location: string | null;
  verified: boolean;
}

export interface SkillEntry {
  id: string;
  name: string;
  category: string | null;  // e.g. "Programming Languages", "Cloud Platforms"
  /**
   * QUALIFIER RULE (§8): never upgrade the user's self-assessed level.
   * If user said "basic SQL", this must stay "basic". Never promote to "proficient".
   */
  proficiencyLabel: string | null; // user's exact wording: "basic", "proficient", "expert", etc.
  verified: boolean;
}

export interface CertificationEntry {
  id: string;
  name: string;
  issuingBody: string | null;
  issueDate: string | null;  // ISO 8601
  expiryDate: string | null; // null = no expiry
  credentialId: string | null;
  verified: boolean;
}

export interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  verified: boolean;
}

export interface AchievementEntry {
  id: string;
  title: string;
  description: string;
  date: string | null;
  verified: boolean;
}

/**
 * The top-level CareerMemory object passed between agents.
 *
 * Agents must treat this as READ-ONLY unless they are the Normalizer
 * (which writes it) or the user has explicitly triggered an update.
 */
export interface CareerMemory {
  id: string;
  userId: string;
  version: number;             // increment on every structural change
  jobs: WorkHistoryEntry[];
  education: EducationEntry[];
  skills: SkillEntry[];
  certifications: CertificationEntry[];
  projects: ProjectEntry[];
  achievements: AchievementEntry[];
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}
