/**
 * VerifierResult — canonical output schema for the Verifier agent
 *
 * Produced by: agents/verifier (runs per bullet, per work history entry)
 * Consumed by: agents/orchestrator, agents/bullet-writer (on retry), workspace (A8)
 *
 * The Verifier enforces all 9 accuracy rules from §8 (Step 4).
 * Every check is individually reported so the Bullet Writer can make
 * surgical corrections on retry rather than regenerating everything.
 *
 * Max 3 retries per bullet before surfacing to user (§8).
 */

export type CheckStatus = "passed" | "failed" | "skipped";

export interface VerifierCheck {
  rule: string;             // human-readable rule name
  status: CheckStatus;
  detail: string | null;    // if failed: specific failure reason. if passed: null.
}

/**
 * All 9 mandatory checks from §8, Step 4.
 * These field names are the contract — do not rename without updating all consumers.
 */
export interface VerifierChecks {
  companyTitleDatesMatch: VerifierCheck;      // names, titles, dates match user input
  noFabricatedSkills: VerifierCheck;          // no tools/skills not in CareerMemory
  degreeStatusAccurate: VerifierCheck;        // conferred vs. expected language
  metricsMatchUserInput: VerifierCheck;       // numbers trace back to source
  noCrossJobContamination: VerifierCheck;     // content under correct company
  tailoredToJD: VerifierCheck;               // JD keywords naturally present
  noEmDashes: VerifierCheck;                 // §8 NEVER rule
  noForbiddenBuzzwords: VerifierCheck;        // §8 NEVER list
  qualifierRuleHeld: VerifierCheck;           // never upgraded skill self-assessment
}

export interface VerifierResult {
  // What was checked
  bulletId: string;
  workHistoryId: string;
  resumeId: string;
  attemptNumber: number;

  // Overall verdict
  passed: boolean;         // true only if ALL checks passed
  checks: VerifierChecks;

  // If failed: what the Bullet Writer must fix on the next attempt
  retryInstructions: string | null;

  // After 3 failures: this surfaces to the user
  maxRetriesReached: boolean;
  userMessage: string | null; // shown in UI if maxRetriesReached — plain English, no jargon

  agentVersion: string;
  provider: string;
  verifiedAt: string;      // ISO 8601
}
