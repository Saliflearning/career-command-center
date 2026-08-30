/**
 * ResumeStrategy — canonical output schema for the Strategy agent
 *
 * Produced by: agents/strategy
 * Consumed by: agents/bullet-writer, agents/orchestrator, app/strategy screen (A6)
 *
 * The Strategy agent requires BOTH CareerMemory AND JDAnalysis as inputs.
 * It cannot run until both are available. This is enforced by the orchestrator.
 */

import type { RoleType } from "./resume";

export type SectionName =
  | "summary"
  | "technical_skills"
  | "core_skills"
  | "experience"
  | "education"
  | "certifications"
  | "projects"
  | "achievements"
  | "publications";

export interface SectionDecision {
  section: SectionName;
  include: boolean;
  position: number;          // 1-indexed sort order in the final resume
  rationale: string;         // one-sentence explanation shown on Strategy Briefing screen (A6)
  emphasize: boolean;        // true = this section is a primary selling point for this JD
}

export interface WorkHistoryInScope {
  workHistoryId: string;
  company: string;
  title: string;
  include: boolean;
  bulletCountTarget: number;  // how many bullets to generate (3–6 per §8)
  emphasisKeywords: string[]; // from JDAnalysis.topKeywords relevant to this role
  rationale: string;          // why this role is/isn't included
}

export interface KeywordStrategy {
  keyword: string;
  targetSection: SectionName; // where this keyword should appear naturally
  targetWorkHistoryId: string | null; // if null, place in skills/summary
}

/**
 * The full resume strategy.
 * This is the plan the user reviews on screen A6 before generation begins.
 * Generation MUST NOT start before this is user-approved (or auto-approved after 3s).
 */
export interface ResumeStrategy {
  // Metadata
  resumeId: string;
  userId: string;
  strategyVersion: number;
  generatedAt: string;       // ISO 8601
  agentVersion: string;      // e.g. "strategy@1.0.0"
  provider: string;

  // Inputs used (for cache validation)
  careerMemoryVersion: number;
  jdHash: string;

  // Role classification
  roleType: RoleType;        // determines section order template per §8

  // Section plan
  sectionOrder: SectionDecision[];

  // Per-role generation plan
  workHistoryInScope: WorkHistoryInScope[];

  // Keyword placement plan
  keywordStrategy: KeywordStrategy[];

  // Summary guidance
  summaryGuidance: string;   // instructions for generating the summary section

  // For Strategy Briefing screen (A6)
  topEmphases: string[];     // top 3 experience highlights to show user
  keywordsMatched: string[]; // keywords from JD found in CareerMemory
  keywordsUnmatched: string[]; // keywords from JD NOT in CareerMemory (will not be fabricated)
  matchScore: number;        // 0–100 keyword coverage score
}
