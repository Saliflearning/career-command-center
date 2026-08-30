// ---------------------------------------------------------------------------
// Verifier Test Suite — Rule Coverage
//
// Verifies that the Verifier agent correctly catches all 9 quality rules
// and correctly passes clean bullets. One test per rule + one passing case.
//
// Updated for Integration Stabilization Sprint:
//  - Input type: VerifierContext (was BulletWriterOutput)
//  - runVerifier now takes 4 args: (context, bulletId, workHistoryId, resumeId)
//  - Results use canonical VerifierResult.checks (named fields, not failedChecks[])
//  - Retry state: result.attemptNumber + result.maxRetriesReached (not retryCount)
// ---------------------------------------------------------------------------

import { runVerifier, type VerifierContext } from "@agents/verifier";
import type { VerifierResult, VerifierChecks } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mock the AI router
// ---------------------------------------------------------------------------

jest.mock("@/lib/ai/router", () => ({
  route: jest.fn(),
}));

import { route } from "@/lib/ai/router";

const mockRoute = route as jest.MockedFunction<typeof route>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<VerifierContext> = {}): VerifierContext {
  return {
    jobTitle:    "Backend Engineer",
    companyName: "TechCorp",
    dates:       "Jun 2019 – Dec 2021",
    userSkills:  ["Node.js", "TypeScript", "MongoDB"],
    userMetrics: ["40%", "2x"],
    jobDescription: "We need a Node.js expert with TypeScript experience.",
    bullets:     ["Built Node.js microservices reducing latency by 40%"],
    qualifiers:  [{ skill: "MongoDB", level: "intermediate" }],
    ...overrides,
  };
}

function routeReturns(passed: boolean, rule?: number, description?: string, evidence?: string): void {
  const failedChecks =
    !passed && rule !== undefined
      ? [{ rule, description: description ?? "violation", evidence: evidence ?? "evidence text" }]
      : [];
  mockRoute.mockResolvedValue({
    content:      JSON.stringify({ passed, failedChecks }),
    provider:     "anthropic",
    tokensUsed:   60,
    usedFallback: false,
  });
}

/** Map rule number → canonical checks field name. */
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
function failedCheck(result: VerifierResult, ruleNum: number) {
  return result.checks[RULE_FIELD[ruleNum]];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Verifier — Rule 1: Company name, title, and dates match", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches mismatched company name in bullet", async () => {
    routeReturns(false, 1, "Company name, title, and dates", "StartupXYZ");
    const payload = makePayload({
      bullets: ["At StartupXYZ, built Node.js microservices"],
    });
    const result: VerifierResult = await runVerifier(payload, "bullet-r1", "wh-r1", "res-r1");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 1).status).toBe("failed");
    expect(failedCheck(result, 1).detail).toContain("StartupXYZ");
  });

  test("treats past-role identity as distinct from the target job", async () => {
    routeReturns(true);
    const payload = makePayload({
      companyName: "Northstar Logistics",
      jobTitle: "Fulfillment Associate",
      dates: "Jan 2017 - Dec 2023",
      jobDescription: "Senior Operations Manager at Confidential. Own site P&L and warehouse operations.",
      bullets: ["Led 75+ associates across inbound operations while maintaining safety and quality."],
    });

    await runVerifier(payload, "bullet-source-role", "wh-source-role", "res-source-role");

    const request = mockRoute.mock.calls[0][0];
    expect(request.systemPrompt).toContain("They are not supposed to match the target job");
    expect(request.systemPrompt).toContain("NEVER compare source-role identity with targetJobDescription");
    expect(request.messages[0].content).toContain('\"sourceCompanyName\":\"Northstar Logistics\"');
    expect(request.messages[0].content).toContain('\"targetJobDescription\":\"Senior Operations Manager at Confidential');
  });

  test("ignores a model failure that cites a payload field instead of a bullet contradiction", async () => {
    routeReturns(false, 1, "Source-role identity fidelity", "sourceJobTitle");
    const result = await runVerifier(
      makePayload({ bullets: ["Built Node.js services reducing latency by 40%."] }),
      "bullet-spurious",
      "wh-spurious",
      "res-spurious"
    );

    expect(result.passed).toBe(true);
    expect(result.attemptNumber).toBe(1);
    expect(mockRoute).toHaveBeenCalledTimes(1);
  });

  test("ignores a model failure that quotes an accomplishment without an identity claim", async () => {
    routeReturns(false, 1, "Source-role identity fidelity", "Analyzed operational data, reducing defects by 28%.");
    const result = await runVerifier(
      makePayload({
        userMetrics: ["28%"],
        bullets: ["Analyzed operational data, reducing defects by 28%."],
      }),
      "bullet-achievement",
      "wh-achievement",
      "res-achievement"
    );

    expect(result.passed).toBe(true);
    expect(result.attemptNumber).toBe(1);
  });
});

describe("Verifier — Rule 2: No skills or tools not in user profile", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches invented skill (Docker) not in userSkills", async () => {
    routeReturns(false, 2, "No invented skills/tools", "Docker");
    const payload = makePayload({
      bullets: ["Containerized Node.js services with Docker"],
    });
    const result = await runVerifier(payload, "bullet-r2", "wh-r2", "res-r2");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 2).status).toBe("failed");
    expect(failedCheck(result, 2).detail).toContain("Docker");
  });
});

describe("Verifier — Rule 3: Degree status language is accurate", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches 'expected' used for a conferred degree", async () => {
    routeReturns(false, 3, "Degree status accuracy", "B.S. Computer Science (expected 2019)");
    const payload = makePayload({
      degreeStatus: "conferred",
      bullets:      ["B.S. Computer Science (expected 2019)"],
    });
    const result = await runVerifier(payload, "bullet-r3", "wh-r3", "res-r3");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 3).status).toBe("failed");
  });
});

describe("Verifier — Rule 4: All numbers and metrics match user data", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches invented 99% metric not in userMetrics", async () => {
    routeReturns(false, 4, "Metric fidelity", "99%");
    const payload = makePayload({
      bullets: ["Reduced page load time by 99%"],
    });
    const result = await runVerifier(payload, "bullet-r4", "wh-r4", "res-r4");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 4).status).toBe("failed");
    expect(failedCheck(result, 4).detail).toContain("99%");
  });

  test("ignores a model metric failure when every number is source-backed", async () => {
    routeReturns(false, 4, "Metric fidelity", "reducing defects by 28%");
    const result = await runVerifier(
      makePayload({
        userMetrics: ["28%"],
        bullets: ["Analyzed operational data, reducing defects by 28%."],
      }),
      "bullet-grounded-metric",
      "wh-grounded-metric",
      "res-grounded-metric"
    );

    expect(result.passed).toBe(true);
    expect(result.attemptNumber).toBe(1);
    expect(mockRoute).toHaveBeenCalledTimes(1);
  });
});

describe("Verifier — Rule 5: No content from one job placed under another", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches cross-contaminated bullet referencing a different employer", async () => {
    routeReturns(false, 5, "No cross-contamination", "work performed at PreviousCorp");
    const payload = makePayload({
      bullets: ["While at PreviousCorp, architected a distributed cache system"],
    });
    const result = await runVerifier(payload, "bullet-r5", "wh-r5", "res-r5");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 5).status).toBe("failed");
  });
});

describe("Verifier — Rule 6: Resume is tailored to the specific job description", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches bullets with no reference to job description keywords", async () => {
    routeReturns(false, 6, "Job-description tailoring", "no JD keyword found in bullets");
    const payload = makePayload({
      jobDescription: "Requires expertise in GraphQL and Apollo Server",
      bullets:        ["Maintained legacy codebase", "Attended team meetings"],
    });
    const result = await runVerifier(payload, "bullet-r6", "wh-r6", "res-r6");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 6).status).toBe("failed");
  });
});

describe("Verifier — Rule 7: No em dashes in bullets", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches em dash character in a bullet", async () => {
    routeReturns(false, 7, "No em dashes", "Node.js — TypeScript");
    const payload = makePayload({
      bullets: ["Built APIs with Node.js — TypeScript stack"],
    });
    const result = await runVerifier(payload, "bullet-r7", "wh-r7", "res-r7");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 7).status).toBe("failed");
    expect(failedCheck(result, 7).detail).toContain("—");
  });
});

describe("Verifier — Rule 8: No forbidden buzzwords", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches 'synergized' as a forbidden buzzword", async () => {
    routeReturns(false, 8, "No forbidden buzzwords", "synergized cross-team efforts");
    const payload = makePayload({
      bullets: ["Synergized cross-team efforts to ship the platform"],
    });
    const result = await runVerifier(payload, "bullet-r8", "wh-r8", "res-r8");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 8).status).toBe("failed");
    expect(failedCheck(result, 8).detail).toContain("synergized");
  });
});

describe("Verifier — Rule 9: Qualifier rule not violated (no skill upgrades)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("catches intermediate MongoDB described as expert", async () => {
    routeReturns(false, 9, "No qualifier upgrades", "expert MongoDB");
    const payload = makePayload({
      qualifiers: [{ skill: "MongoDB", level: "intermediate" }],
      bullets:    ["Applied expert MongoDB aggregation pipelines"],
    });
    const result = await runVerifier(payload, "bullet-r9", "wh-r9", "res-r9");
    expect(result.passed).toBe(false);
    expect(failedCheck(result, 9).status).toBe("failed");
    expect(failedCheck(result, 9).detail).toContain("expert MongoDB");
  });

  test("ignores a false upgrade failure for neutral use of a qualified skill", async () => {
    routeReturns(false, 9, "No qualifier upgrades", "some experience with Python");
    const payload = makePayload({
      userSkills: ["Python"],
      qualifiers: [{ skill: "Python", level: "some experience" }],
      bullets: ["Built Python reporting workflows to surface operational trends"],
    });

    const result = await runVerifier(payload, "bullet-r9-neutral", "wh-r9-neutral", "res-r9-neutral");

    expect(result.passed).toBe(true);
    expect(result.attemptNumber).toBe(1);
    expect(mockRoute).toHaveBeenCalledTimes(1);
  });
});

describe("Verifier — Passing case (all 9 rules satisfied)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns passed=true with all checks passing when all rules pass", async () => {
    routeReturns(true);
    const payload = makePayload({
      companyName:    "TechCorp",
      jobTitle:       "Backend Engineer",
      dates:          "Jun 2019 – Dec 2021",
      userSkills:     ["Node.js", "TypeScript", "MongoDB"],
      userMetrics:    ["40%", "2x"],
      degreeStatus:   "conferred",
      jobDescription: "We need a Node.js expert with TypeScript experience.",
      qualifiers:     [{ skill: "MongoDB", level: "intermediate" }],
      bullets: [
        "Built Node.js microservices at TechCorp (Jun 2019 – Dec 2021) reducing latency by 40%",
        "Delivered TypeScript refactor achieving 2x test coverage",
      ],
    });
    const result = await runVerifier(payload, "bullet-pass", "wh-pass", "res-pass");
    expect(result.passed).toBe(true);
    expect(result.maxRetriesReached).toBe(false);
    expect(result.attemptNumber).toBe(1);
    // All named checks must be "passed"
    Object.values(result.checks).forEach((check) => {
      expect(check.status).toBe("passed");
    });
  });
});

// ---------------------------------------------------------------------------
// Retry behaviour
// ---------------------------------------------------------------------------

describe("Verifier — Retry logic", () => {
  beforeEach(() => jest.clearAllMocks());

  test("retries up to 3 times and returns maxRetriesReached after exhausting retries", async () => {
    mockRoute.mockResolvedValue({
      content: JSON.stringify({
        passed:       false,
        failedChecks: [{ rule: 8, description: "No forbidden buzzwords", evidence: "leveraged" }],
      }),
      provider:     "anthropic",
      tokensUsed:   60,
      usedFallback: false,
    });

    const payload = makePayload({
      bullets: ["Leveraged Node.js to build APIs"],
    });
    const result = await runVerifier(payload, "bullet-retry", "wh-retry", "res-retry");

    expect(result.passed).toBe(false);
    expect(result.maxRetriesReached).toBe(true);
    expect(result.attemptNumber).toBe(3);
    expect(failedCheck(result, 8).status).toBe("failed");
    // Router should have been called exactly MAX_RETRIES (3) times
    expect(mockRoute).toHaveBeenCalledTimes(3);
  });

  test("succeeds on second attempt after first failure", async () => {
    mockRoute
      .mockResolvedValueOnce({
        content: JSON.stringify({
          passed:       false,
          failedChecks: [{ rule: 7, description: "No em dashes", evidence: "— separator" }],
        }),
        provider:     "anthropic",
        tokensUsed:   60,
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        content:      JSON.stringify({ passed: true, failedChecks: [] }),
        provider:     "anthropic",
        tokensUsed:   50,
        usedFallback: false,
      });

    const payload = makePayload({
      bullets: ["Built Node.js microservices — reducing latency by 40%"],
    });
    const result = await runVerifier(payload, "bullet-retry2", "wh-retry2", "res-retry2");
    expect(result.passed).toBe(true);
    expect(result.maxRetriesReached).toBe(false);
    expect(result.attemptNumber).toBe(2);
    expect(mockRoute).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Model response parsing
// ---------------------------------------------------------------------------

describe("Verifier — response parsing", () => {
  beforeEach(() => jest.clearAllMocks());

  test("accepts one fenced verdict followed by model commentary", async () => {
    mockRoute.mockResolvedValue({
      content: [
        "```json",
        JSON.stringify({ passed: true, failedChecks: [] }),
        "```",
        "All requested checks were evaluated.",
      ].join("\n"),
      provider: "anthropic",
      tokensUsed: 60,
      usedFallback: false,
    });

    const result = await runVerifier(makePayload(), "bullet-fenced", "wh-fenced", "res-fenced");

    expect(result.passed).toBe(true);
    expect(result.attemptNumber).toBe(1);
    expect(mockRoute).toHaveBeenCalledTimes(1);
  });

  test("accepts one unambiguous JSON verdict surrounded by prose", async () => {
    mockRoute.mockResolvedValue({
      content: `Verifier result:\n${JSON.stringify({ passed: true, failedChecks: [] })}\nDone.`,
      provider: "anthropic",
      tokensUsed: 60,
      usedFallback: false,
    });

    const result = await runVerifier(makePayload(), "bullet-prose", "wh-prose", "res-prose");

    expect(result.passed).toBe(true);
    expect(result.attemptNumber).toBe(1);
  });

  test("rejects multiple JSON verdicts and fails closed after retries", async () => {
    mockRoute.mockResolvedValue({
      content: [
        JSON.stringify({ passed: true, failedChecks: [] }),
        JSON.stringify({ passed: false, failedChecks: [
          { rule: 4, description: "Metric fidelity", evidence: "50%" },
        ] }),
      ].join("\n"),
      provider: "anthropic",
      tokensUsed: 60,
      usedFallback: false,
    });

    const result = await runVerifier(makePayload(), "bullet-ambiguous", "wh-ambiguous", "res-ambiguous");

    expect(result.passed).toBe(false);
    expect(result.maxRetriesReached).toBe(true);
    expect(result.attemptNumber).toBe(3);
    expect(mockRoute).toHaveBeenCalledTimes(3);
    Object.values(result.checks).forEach((check) => expect(check.status).toBe("skipped"));
  });

  test("rejects a contradictory passing verdict and fails closed", async () => {
    mockRoute.mockResolvedValue({
      content: JSON.stringify({
        passed: true,
        failedChecks: [{ rule: 4, description: "Metric fidelity", evidence: "50%" }],
      }),
      provider: "anthropic",
      tokensUsed: 60,
      usedFallback: false,
    });

    const result = await runVerifier(makePayload(), "bullet-conflict", "wh-conflict", "res-conflict");

    expect(result.passed).toBe(false);
    expect(result.maxRetriesReached).toBe(true);
    expect(result.attemptNumber).toBe(3);
  });
});
