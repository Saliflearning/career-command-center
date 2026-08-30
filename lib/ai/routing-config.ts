// ---------------------------------------------------------------------------
// AI Routing Configuration
//
// Per-agent provider assignments. Override tier defaults via env vars:
//   AI_TIER1_PROVIDER, AI_TIER2_PROVIDER, AI_TIER3_PROVIDER
// ---------------------------------------------------------------------------

// Tier type is defined here (source of truth) and re-exported by router.ts
// to avoid a circular dependency.
export type Tier = "tier1" | "tier2" | "tier3";

export interface AgentRouteConfig {
  tier: Tier;
  primary: string;
  secondary: string;
}

// Resolve provider from env override or fall back to the given default
function resolveProvider(tier: Tier, defaultProvider: string): string {
  const envKey = `AI_${tier.toUpperCase()}_PROVIDER` as keyof NodeJS.ProcessEnv;
  return process.env[envKey] ?? defaultProvider;
}

// Build the routing table, honouring env overrides at module load time
function buildRoutingConfig(): Record<string, AgentRouteConfig> {
  const entries: Array<{
    name: string;
    tier: Tier;
    defaultPrimary: string;
    defaultSecondary: string;
  }> = [
    { name: "intake",         tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    { name: "normalizer",     tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    { name: "verifier",       tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // jd-analyst: keyword extraction only — tier1 is sufficient, saves ~10s
    { name: "jd-analyst",     tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // diagnostic: scoring heuristic — tier1 is sufficient, saves ~8s
    { name: "diagnostic",     tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // Bounded, additive scan enrichment; provider failure returns lexical scoring.
    { name: "scan-semantic-match", tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    { name: "recruiter-sim",  tier: "tier2", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // strategy: section + keyword planning — keep tier3, directly affects output quality
    { name: "strategy",       tier: "tier3", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // bullet-writer: core resume content — keep tier3, user demands top quality
    { name: "bullet-writer",  tier: "tier3", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // quick-resume-intake: JD -> plain-language questions for a no-resume user.
    // tier2 is enough for structured question extraction; saves cost/latency.
    { name: "quick-resume-intake", tier: "tier2", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // quick-resume-writer: honest, JD-aligned resume from the user's answers —
    // the core differentiating output, so tier3.
    { name: "quick-resume-writer", tier: "tier3", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    // summary-writer: 3-sentence paragraph — tier1 is sufficient, saves ~8s
    { name: "summary-writer", tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    { name: "bullet-rewrite", tier: "tier2", defaultPrimary: "anthropic", defaultSecondary: "openai" },
    { name: "compression",    tier: "tier1", defaultPrimary: "anthropic", defaultSecondary: "openai" },
  ];

  const config: Record<string, AgentRouteConfig> = {};
  for (const e of entries) {
    const primary = resolveProvider(e.tier, e.defaultPrimary);
    // Keep the secondary a DIFFERENT provider than the primary — an env
    // override that matched both would silently disable fallback.
    const secondary =
      primary === e.defaultSecondary ? e.defaultPrimary : e.defaultSecondary;
    config[e.name] = {
      tier: e.tier,
      primary,
      secondary,
    };
  }
  return config;
}

export const ROUTING_CONFIG: Record<string, AgentRouteConfig> = buildRoutingConfig();
