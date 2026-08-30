/**
 * GeneratedBullet — canonical output schema for the Bullet Writer agent
 *
 * Produced by: agents/bullet-writer (one call per WorkHistory entry)
 * Consumed by: agents/verifier, agents/orchestrator, workspace editor (A8)
 *
 * The Bullet Writer runs PER work history entry, not per resume.
 * This is the Divide and Conquer principle applied to generation (§4).
 *
 * Token budget: max 500 output tokens per work history entry (§13).
 */

export type BulletVerificationStatus =
  | "pending"   // not yet checked by Verifier
  | "passed"    // Verifier confirmed this bullet
  | "failed"    // Verifier rejected; must retry or surface to user
  | "accepted_by_user"; // user accepted despite Verifier warning

export interface GeneratedBullet {
  id: string;                    // cuid, stable across retries
  workHistoryId: string;
  resumeId: string;
  content: string;               // the final bullet text

  // Evidence chain — every claim must trace back to user-provided data
  metricsUsed: string[];         // e.g. ["$2M", "40%"] — must exist in source CareerMemory
  keywordsMatched: string[];     // JD keywords this bullet satisfies
  sourceCareerMemoryBulletIds: string[]; // if derived from existing bullets

  // Quality checks (enforced by Bullet Writer before handing to Verifier)
  startsWithActionVerb: boolean;
  lineCount: number;             // must be 1 or 2 (§8 rule)
  forbiddenWordsCheck: "passed" | "failed";
  qualifierRuleCheck: "passed" | "failed"; // never upgrade skill self-assessment
  emDashCheck: "passed" | "failed";        // no em dashes in bullets (§8)

  // Generation metadata
  confidence: number;            // 0–1
  warnings: string[];            // non-blocking notes (e.g. "no metric provided for this claim")
  attemptNumber: number;         // 1 = first try, 2-3 = retry after Verifier failure

  // Verifier handoff
  verificationStatus: BulletVerificationStatus;

  agentVersion: string;
  provider: string;
  generatedAt: string;           // ISO 8601
}

/**
 * The full output from one Bullet Writer invocation (one WorkHistory entry).
 */
export interface BulletWriterOutput {
  workHistoryId: string;
  resumeId: string;
  bullets: GeneratedBullet[];
  totalAttempts: number;
  agentVersion: string;
  provider: string;
  generatedAt: string;
}
