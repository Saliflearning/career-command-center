/**
 * JDAnalysis — canonical output schema for the JD Analyst agent
 *
 * Produced by: agents/jd-analyst
 * Consumed by: agents/strategy, app/strategy screen, app/target screen
 *
 * This schema is the contract. If the JD Analyst changes its output shape,
 * it must update this type and all consumers must be updated accordingly.
 */

export type JDTone = "formal" | "startup" | "corporate" | "government" | "academic";

export interface JDKeyword {
  term: string;
  frequency: number;        // how many times it appeared in the JD
  required: boolean;        // true = "required", false = "preferred" / "nice to have"
  category: "technical" | "soft" | "domain" | "certification" | "other";
}

export interface JDRequirement {
  text: string;             // verbatim or lightly normalized from JD
  type: "hard" | "soft";    // hard = must-have, soft = preferred
  matchedInProfile: boolean; // did we find evidence in CareerMemory?
  matchedSkillIds: string[]; // IDs from CareerMemory.skills that match
}

export interface JDSection {
  name: string;             // e.g. "Responsibilities", "Requirements", "About the Role"
  content: string;          // extracted text for that section
}

/**
 * The full JD analysis result.
 *
 * Token budget: max 2,000 input tokens (JD truncated if longer) per §13.
 */
export interface JDAnalysis {
  // Metadata
  resumeId: string;
  jdHash: string;           // SHA-256 of raw JD text — used for cache keying (§13)
  analyzedAt: string;       // ISO 8601
  agentVersion: string;     // e.g. "jd-analyst@1.0.0"
  provider: string;         // which LLM provider produced this

  // Source
  rawJdText: string;        // truncated to 2,000 tokens if longer
  targetCompany: string | null;
  targetRole: string;

  // Core outputs
  tone: JDTone;
  topKeywords: JDKeyword[];     // top 20, sorted by (required=true first, then frequency)
  requirements: JDRequirement[];
  sections: JDSection[];

  // Derived signals for Strategy agent
  seniorityLevel: "entry" | "mid" | "senior" | "staff" | "executive" | null;
  remotePolicy: "remote" | "hybrid" | "onsite" | null;
  teamSize: string | null;       // e.g. "10-person team", extracted verbatim
  industryDomain: string | null; // e.g. "fintech", "healthtech", "government"

  // For the Strategy Briefing screen (A6)
  summaryForUser: string;  // 2–3 sentence plain-English summary of what this role needs
  keyGapsInProfile: string[]; // skills/requirements in JD not found in CareerMemory
                               // MUST note: these will NOT be fabricated (§8 rule)
}
