/**
 * Resume types — shared enums and role classification
 *
 * These mirror the Prisma enums but are the wire-format contract used
 * between agents and API routes. Import from here, not from @prisma/client,
 * in agent code.
 */

export type RoleType =
  | "TECHNICAL"
  | "OPERATIONS"
  | "BUSINESS"
  | "DATA"
  | "FINANCE"
  | "ACADEMIC"
  | "FEDERAL"
  | "CREATIVE";

export type ResumeState =
  | "UPLOADED"
  | "PARSED"
  | "NORMALIZED"
  | "VERIFIED"
  | "JD_ANALYZED"
  | "STRATEGY_READY"
  | "GENERATING"
  | "QA_REVIEWED"
  | "USER_EDITING"
  | "EXPORTED"
  | "TRACKED"
  | "FAILED";
