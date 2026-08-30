import { db } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// ResumeState enum — mirrors the Prisma schema enum exactly
// ---------------------------------------------------------------------------

export enum ResumeState {
  UPLOADED       = "UPLOADED",
  PARSED         = "PARSED",
  NORMALIZED     = "NORMALIZED",
  VERIFIED       = "VERIFIED",
  JD_ANALYZED    = "JD_ANALYZED",
  STRATEGY_READY = "STRATEGY_READY",
  GENERATING     = "GENERATING",
  QA_REVIEWED    = "QA_REVIEWED",
  USER_EDITING   = "USER_EDITING",
  EXPORTED       = "EXPORTED",
  TRACKED        = "TRACKED",
  FAILED         = "FAILED",
}

// ---------------------------------------------------------------------------
// Valid state transitions
//
// Design rules:
//  - The pipeline flows linearly from UPLOADED → … → TRACKED
//  - Any state can transition to FAILED (error path)
//  - USER_EDITING can loop back to GENERATING for re-generation
//  - EXPORTED can re-enter USER_EDITING for post-export edits
//  - FAILED can re-enter UPLOADED so the user can retry from scratch
// ---------------------------------------------------------------------------

export const VALID_TRANSITIONS: Record<ResumeState, ResumeState[]> = {
  [ResumeState.UPLOADED]: [
    ResumeState.PARSED,
    ResumeState.FAILED,
  ],
  [ResumeState.PARSED]: [
    ResumeState.NORMALIZED,
    ResumeState.FAILED,
  ],
  [ResumeState.NORMALIZED]: [
    ResumeState.VERIFIED,
    ResumeState.FAILED,
  ],
  [ResumeState.VERIFIED]: [
    ResumeState.JD_ANALYZED,
    ResumeState.FAILED,
  ],
  [ResumeState.JD_ANALYZED]: [
    ResumeState.STRATEGY_READY,
    ResumeState.FAILED,
  ],
  [ResumeState.STRATEGY_READY]: [
    ResumeState.GENERATING,
    ResumeState.FAILED,
  ],
  [ResumeState.GENERATING]: [
    ResumeState.QA_REVIEWED,
    ResumeState.FAILED,
  ],
  [ResumeState.QA_REVIEWED]: [
    ResumeState.USER_EDITING,
    ResumeState.EXPORTED,
    ResumeState.FAILED,
  ],
  [ResumeState.USER_EDITING]: [
    ResumeState.GENERATING,   // re-generate after user edits
    ResumeState.EXPORTED,
    ResumeState.FAILED,
  ],
  [ResumeState.EXPORTED]: [
    ResumeState.TRACKED,
    ResumeState.USER_EDITING, // post-export revision
    ResumeState.FAILED,
  ],
  [ResumeState.TRACKED]: [
    ResumeState.FAILED,
  ],
  [ResumeState.FAILED]: [
    ResumeState.UPLOADED, // allow full retry
  ],
};

// ---------------------------------------------------------------------------
// canTransition — pure predicate; no DB access
// ---------------------------------------------------------------------------

/**
 * Return true if moving from `from` to `to` is a legal transition.
 */
export function canTransition(from: ResumeState, to: ResumeState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// transition — validates + persists the state change
// ---------------------------------------------------------------------------

/**
 * Transition a resume to a new state.
 *
 * Validates the transition against VALID_TRANSITIONS, then writes the new
 * state and an updatedAt timestamp to the database via Prisma.
 *
 * @param resumeId  The cuid of the Resume record to update
 * @param to        The target ResumeState
 * @throws          If the transition is invalid or the DB write fails
 */
export async function transition(
  resumeId: string,
  to: ResumeState
): Promise<void> {
  // Fetch the current state — select only what we need
  const resume = await db.resume.findUnique({
    where: { id: resumeId },
    select: { id: true, state: true },
  });

  if (!resume) {
    throw new Error(`Resume not found: ${resumeId}`);
  }

  // Map the Prisma enum string back to our local ResumeState enum
  const from = resume.state as ResumeState;

  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid state transition for resume "${resumeId}": ${from} → ${to}. ` +
        `Allowed next states from ${from}: [${(VALID_TRANSITIONS[from] ?? []).join(", ")}]`
    );
  }

  // Persist — updatedAt is managed automatically by Prisma (@updatedAt)
  await db.resume.update({
    where: { id: resumeId },
    data: {
      state: to,
      // Explicitly touch updatedAt so callers can treat it as a transition timestamp
      updatedAt: new Date(),
    },
  });

  // Structured log for observability (stdout-safe; no user PII beyond the id)
  console.log(
    JSON.stringify({
      event: "resume_state_transition",
      resumeId,
      from,
      to,
      timestamp: new Date().toISOString(),
    })
  );
}
