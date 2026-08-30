/**
 * lib/types — Canonical wire-format contracts for Career Command Center
 *
 * IMPORTANT: These are the authoritative type definitions for all data
 * flowing between agents and between agents and the API layer.
 *
 * Import from here. Never import agent-specific types directly.
 *
 * Rule: if an agent's output shape changes, the type here changes FIRST,
 * then the agent implementation, then all consumers. Types drive
 * implementation, not the reverse.
 */

export type { CareerMemory, WorkHistoryEntry, CareerMemoryBullet, EducationEntry, SkillEntry, CertificationEntry, ProjectEntry, AchievementEntry, SourceType, ContentType } from "./career-memory";
export type { JDAnalysis, JDKeyword, JDRequirement, JDSection, JDTone } from "./jd-analysis";
export type { ResumeStrategy, SectionDecision, WorkHistoryInScope, KeywordStrategy, SectionName } from "./resume-strategy";
export type { GeneratedBullet, BulletWriterOutput, BulletVerificationStatus } from "./generated-bullet";
export type { VerifierResult, VerifierChecks, VerifierCheck, CheckStatus } from "./verifier-result";
export type { VisualQAResult, VisualCheck, VisualCheckStatus } from "./visual-qa-result";
export type { ApplicationRecord, ApplicationSummary, ApplicationStatus, InterviewLogEntry } from "./application-record";
export type { SummaryWriterOutput } from "./summary-writer-output";
export type { RoleType, ResumeState } from "./resume";
