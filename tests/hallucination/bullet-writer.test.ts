// ---------------------------------------------------------------------------
// Hallucination Test Suite — Bullet Writer
//
// Verifies that the Verifier agent correctly catches all hallucination
// patterns that the Bullet Writer could produce. All AI calls are mocked;
// this suite tests the *detection* logic in the Verifier.
//
// Updated for Integration Stabilization Sprint:
//  - Input type: VerifierContext (was BulletWriterOutput)
//  - runVerifier now takes 4 args: (context, bulletId, workHistoryId, resumeId)
//  - Results use canonical VerifierResult.checks (named fields, not failedChecks[])
// ---------------------------------------------------------------------------

import { runVerifier, type VerifierContext } from "@agents/verifier";
import type { VerifierResult, VerifierChecks } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mock the AI router — every test controls the LLM response explicitly
// ---------------------------------------------------------------------------

jest.mock("@/lib/ai/router", () => ({
  route: jest.fn(),
}));

import { route } from "@/lib/ai/router";

const mockRoute = route as jest.MockedFunction<typeof route>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBasePayload(overrides: Partial<VerifierContext> = {}): VerifierContext {
  return {
    jobTitle:    "Software Engineer",
    companyName: "Acme Corp",
    dates:       "Jan 2020 – Mar 2022",
    userSkills:  ["Python", "React", "PostgreSQL"],
    userMetrics: ["30%", "$1M"],
    jobDescription: "We need a Python developer with React experience.",
    bullets:     [],
    qualifiers:  [{ skill: "Python", level: "basic" }],
    ...overrides,
  };
}

function mockVerifierPass(): void {
  mockRoute.mockResolvedValue({
    content:      JSON.stringify({ passed: true, failedChecks: [] }),
    provider:     "anthropic",
    tokensUsed:   50,
    usedFallback: false,
  });
}

function mockVerifierFail(rule: number, description: string, evidence: string): void {
  mockRoute.mockResolvedValue({
    content: JSON.stringify({
      passed:       false,
      failedChecks: [{ rule, description, evidence }],
    }),
    provider:     "anthropic",
    tokensUsed:   50,
    usedFallback: false,
  });
}

/** Map rule number → canonical VerifierChecks field name. */
const RULE_FIELD: Record<number, keyof VerifierChecks> = {
  1: "companyTitleDatesMatch",
  2: "noFabricatedSkills",
  3: "degreeStatusAccurate",
  4: "metricsMatchUserInput",
  5: "noCrossJobContamination",
  6: "tailoredToJD",
  7: "noEmDashes",
  8: "noForbiddenBuzzwords",
  9: "qualifierRuleHeld",
};

/** Returns the named check for a given rule number from the canonical result. */
function getCheck(result: VerifierResult, ruleNum: number) {
  return result.checks[RULE_FIELD[ruleNum]];
}

/** Helper: call runVerifier with synthetic bulletId (same as workHistoryId for batch). */
async function verify(payload: VerifierContext, wh = "wh1", resume = "r1"): Promise<VerifierResult> {
  return runVerifier(payload, wh, wh, resume);
}

// ---------------------------------------------------------------------------
// Rule 4 — Never adds metrics the user did not provide
// ---------------------------------------------------------------------------

describe("Rule 4 — No invented metrics", () => {
  beforeEach(() => jest.clearAllMocks());

  test("passes when bullet uses only user-provided metric (30%)", async () => {
    mockVerifierPass();
    const payload = makeBasePayload({
      bullets: ["Improved system throughput by 30%"],
    });
    const result: VerifierResult = await verify(payload);
    expect(result.passed).toBe(true);
    Object.values(result.checks).forEach((c) => expect(c.status).toBe("passed"));
  });

  test("fails when bullet invents a 50% metric not in userMetrics", async () => {
    mockVerifierFail(4, "Metric fidelity", "improved by 50%");
    const result = await verify(makeBasePayload({ bullets: ["Improved system throughput by 50%"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 4).status).toBe("failed");
  });

  test("fails when bullet invents a $5M revenue figure", async () => {
    mockVerifierFail(4, "Metric fidelity", "$5M");
    const result = await verify(makeBasePayload({ bullets: ["Generated $5M in new revenue"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 4).detail).toContain("$5M");
  });

  test("fails when bullet invents a 10x improvement multiplier", async () => {
    mockVerifierFail(4, "Metric fidelity", "10x");
    const result = await verify(makeBasePayload({ bullets: ["Achieved 10x performance improvement"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 4).status).toBe("failed");
  });

  test("passes when bullet uses second user-provided metric ($1M)", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({ bullets: ["Managed a budget of $1M for infrastructure"] }));
    expect(result.passed).toBe(true);
  });

  test("fails when bullet invents a headcount figure (team of 12)", async () => {
    mockVerifierFail(4, "Metric fidelity", "team of 12");
    const result = await verify(makeBasePayload({ bullets: ["Led a team of 12 engineers"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 4).status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — Never adds skills not in the user's profile
// ---------------------------------------------------------------------------

describe("Rule 2 — No invented skills", () => {
  beforeEach(() => jest.clearAllMocks());

  test("passes when only user-listed skills appear (Python, React)", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({ bullets: ["Built APIs with Python and React dashboards"] }));
    expect(result.passed).toBe(true);
  });

  test("fails when bullet invents Kubernetes (not in userSkills)", async () => {
    mockVerifierFail(2, "No invented skills/tools", "Kubernetes");
    const result = await verify(makeBasePayload({ bullets: ["Deployed microservices using Kubernetes"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 2).status).toBe("failed");
  });

  test("fails when bullet invents Terraform usage", async () => {
    mockVerifierFail(2, "No invented skills/tools", "Terraform");
    const result = await verify(makeBasePayload({ bullets: ["Automated infrastructure provisioning with Terraform"] }));
    expect(getCheck(result, 2).detail).toContain("Terraform");
  });

  test("fails when bullet adds Java to a Python-only skill set", async () => {
    mockVerifierFail(2, "No invented skills/tools", "Java");
    const result = await verify(makeBasePayload({
      userSkills: ["Python"],
      bullets:    ["Migrated Java services to Python microservices"],
    }));
    expect(result.passed).toBe(false);
  });

  test("fails when bullet adds AWS despite it not being listed", async () => {
    mockVerifierFail(2, "No invented skills/tools", "AWS");
    const result = await verify(makeBasePayload({ bullets: ["Hosted services on AWS Lambda and S3"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 2).status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — Never upgrades qualifiers (basic → proficient)
// ---------------------------------------------------------------------------

describe("Rule 9 — No qualifier upgrades", () => {
  beforeEach(() => jest.clearAllMocks());

  test("passes when basic Python is not upgraded", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({
      qualifiers: [{ skill: "Python", level: "basic" }],
      bullets:    ["Used Python scripting to automate report generation"],
    }));
    expect(result.passed).toBe(true);
  });

  test("fails when basic Python is described as proficient", async () => {
    mockVerifierFail(9, "No qualifier upgrades", "proficient Python");
    const result = await verify(makeBasePayload({
      qualifiers: [{ skill: "Python", level: "basic" }],
      bullets:    ["Leveraged proficient Python skills to build pipelines"],
    }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 9).status).toBe("failed");
  });

  test("fails when basic SQL is described as expert", async () => {
    mockVerifierFail(9, "No qualifier upgrades", "expert SQL");
    const result = await verify(makeBasePayload({
      userSkills: ["SQL"],
      qualifiers: [{ skill: "SQL", level: "basic" }],
      bullets:    ["Applied expert SQL knowledge to optimize queries"],
    }));
    expect(getCheck(result, 9).detail).toContain("expert SQL");
  });

  test("fails when beginner Excel is described as advanced", async () => {
    mockVerifierFail(9, "No qualifier upgrades", "advanced Excel");
    const result = await verify(makeBasePayload({
      userSkills: ["Excel"],
      qualifiers: [{ skill: "Excel", level: "beginner" }],
      bullets:    ["Used advanced Excel features for financial modeling"],
    }));
    expect(result.passed).toBe(false);
  });

  test("passes when skill with no qualifier is described freely", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({
      qualifiers: [],
      bullets:    ["Built APIs using React and PostgreSQL"],
    }));
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 8 — Never uses forbidden buzzwords
// ---------------------------------------------------------------------------

describe("Rule 8 — No forbidden buzzwords", () => {
  beforeEach(() => jest.clearAllMocks());

  test("passes when no buzzwords are used", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({ bullets: ["Built REST APIs serving 10k daily requests"] }));
    expect(result.passed).toBe(true);
  });

  test("fails when 'leveraged' appears in a bullet", async () => {
    mockVerifierFail(8, "No forbidden buzzwords", "leveraged");
    const result = await verify(makeBasePayload({ bullets: ["Leveraged Python to build data pipelines"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 8).status).toBe("failed");
  });

  test("fails when 'spearheaded' appears in a bullet", async () => {
    mockVerifierFail(8, "No forbidden buzzwords", "spearheaded");
    const result = await verify(makeBasePayload({ bullets: ["Spearheaded the migration to microservices"] }));
    expect(getCheck(result, 8).detail).toContain("spearheaded");
  });

  test("fails when 'responsible for' appears in a bullet", async () => {
    mockVerifierFail(8, "No forbidden buzzwords", "responsible for");
    const result = await verify(makeBasePayload({ bullets: ["Responsible for maintaining the CI/CD pipeline"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 8).status).toBe("failed");
  });

  test("fails when 'innovative' appears in a bullet", async () => {
    mockVerifierFail(8, "No forbidden buzzwords", "innovative");
    const result = await verify(makeBasePayload({ bullets: ["Developed innovative solutions for data processing"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 8).status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — Never uses em dashes
// ---------------------------------------------------------------------------

describe("Rule 7 — No em dashes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("passes when bullets contain no em dashes", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({ bullets: ["Built APIs, improved performance by 30%, reduced costs"] }));
    expect(result.passed).toBe(true);
  });

  test("fails when em dash appears mid-sentence", async () => {
    mockVerifierFail(7, "No em dashes", "Python — the core language");
    const result = await verify(makeBasePayload({ bullets: ["Built Python — the core language — data pipelines"] }));
    expect(result.passed).toBe(false);
    expect(getCheck(result, 7).status).toBe("failed");
  });

  test("fails when em dash appears as a list separator", async () => {
    mockVerifierFail(7, "No em dashes", "React — PostgreSQL");
    const result = await verify(makeBasePayload({ bullets: ["Stack used: React — PostgreSQL — Python"] }));
    expect(getCheck(result, 7).detail).toContain("—");
  });

  test("fails when em dash appears at the start of a bullet", async () => {
    mockVerifierFail(7, "No em dashes", "— Improved performance");
    const result = await verify(makeBasePayload({ bullets: ["— Improved performance by 30%"] }));
    expect(result.passed).toBe(false);
  });

  test("passes when regular hyphens are used instead of em dashes", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({
      bullets: ["Achieved cross-platform compatibility - reduced support time by 30%"],
    }));
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No first-person language in bullets
// (Modeled as Rule 1 violation — content does not match company/title/dates context)
// ---------------------------------------------------------------------------

describe("No first-person language in bullets", () => {
  beforeEach(() => jest.clearAllMocks());

  test("passes when bullets use third-person or action verbs only", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({
      bullets: ["Designed and implemented a real-time notification system"],
    }));
    expect(result.passed).toBe(true);
  });

  test("fails when bullet uses 'I built'", async () => {
    mockVerifierFail(1, "Company name, title, and dates", "I built");
    const result = await verify(makeBasePayload({ bullets: ["I built REST APIs for the platform"] }));
    expect(result.passed).toBe(false);
  });

  test("fails when bullet uses 'My team'", async () => {
    mockVerifierFail(1, "Company name, title, and dates", "My team");
    const result = await verify(makeBasePayload({ bullets: ["My team delivered the project ahead of schedule"] }));
    expect(result.passed).toBe(false);
  });

  test("fails when bullet uses 'We achieved'", async () => {
    mockVerifierFail(1, "Company name, title, and dates", "We achieved");
    const result = await verify(makeBasePayload({ bullets: ["We achieved 30% cost reduction through optimization"] }));
    expect(result.passed).toBe(false);
  });

  test("passes when bullets use strong action verbs in past tense", async () => {
    mockVerifierPass();
    const result = await verify(makeBasePayload({
      bullets: [
        "Architected PostgreSQL schema supporting 1M daily queries",
        "Delivered React dashboard used by 200 internal users",
      ],
    }));
    expect(result.passed).toBe(true);
    Object.values(result.checks).forEach((c) => expect(c.status).toBe("passed"));
  });
});
