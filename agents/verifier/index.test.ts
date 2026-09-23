/**
 * Verifier — summary-mode contract tests (P0-1, Codex review 2026-09-23)
 *
 * A career summary spans the candidate's whole work history, so when the
 * context carries `allowedRoles` the verifier must:
 *   1. send the career-wide identity contract (allowedSourceRoles) to the LLM,
 *   2. use the summary-mode prompt wording for Rules 1 and 5,
 *   3. clear a Rule-1 failure that merely cites an allowed older role
 *      (the two-role regression: a truthful Amazon mention next to a newer
 *      Resultant role must verify, not quarantine),
 *   4. still fail a Rule-1 claim about a company outside the history.
 *
 * The LLM is mocked at the router — these tests assert the contract the
 * verifier presents to the model, which is the layer Codex's review targets.
 */

import { route } from "@/lib/ai/router";
import { runVerifier, type VerifierContext } from "@/agents/verifier";

jest.mock("@/lib/ai/router", () => ({ route: jest.fn() }));

const mockedRoute = route as jest.MockedFunction<typeof route>;

const PASSING_RESPONSE = JSON.stringify({ passed: true, failedChecks: [] });

function makeSummaryContext(): VerifierContext {
  return {
    jobTitle: "Senior Product Manager",
    companyName: "Resultant",
    dates: "2022-01 – present",
    allowedRoles: [
      {
        jobTitle: "Senior Product Manager",
        companyName: "Resultant",
        dates: "2022-01 – present",
      },
      {
        jobTitle: "Operations Manager",
        companyName: "Amazon",
        dates: "2019-06 – 2021-12",
      },
    ],
    userSkills: ["Product Strategy", "SQL"],
    userMetrics: ["40%"],
    sourceEvidence: [
      "Led activation initiative reducing time-to-first-charge by 40% at Resultant",
      "Ran inbound operations for a 12-person team at Amazon",
    ],
    jobDescription: "Notion is seeking a Director of Product Management to lead growth.",
    bullets: [
      "Operations leader with experience at Amazon and Resultant. Delivered process improvements across both organizations.",
    ],
    qualifiers: [],
  };
}

function makeBulletContext(): VerifierContext {
  const context = makeSummaryContext();
  delete context.allowedRoles;
  return context;
}

function lastRouteArgs() {
  return mockedRoute.mock.calls[mockedRoute.mock.calls.length - 1][0] as {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
  };
}

function payloadOf(callIndex = 0) {
  const args = mockedRoute.mock.calls[callIndex][0] as {
    messages: Array<{ role: string; content: string }>;
  };
  return JSON.parse(args.messages[0].content) as Record<string, unknown>;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedRoute.mockResolvedValue({
    content: PASSING_RESPONSE,
    provider: "test",
    tokensUsed: 20,
    usedFallback: false,
  });
});

describe("verifier summary-mode contract", () => {
  it("sends the career-wide identity contract for a summary context", async () => {
    const context = makeSummaryContext();

    const result = await runVerifier(context, "summary:res-1", "summary", "res-1");

    expect(result.passed).toBe(true);
    const args = lastRouteArgs();
    // Summary-mode prompt wording for Rules 1 and 5
    expect(args.systemPrompt).toContain("allowedSourceRoles");
    expect(args.systemPrompt).toContain("CAREER SUMMARY");
    expect(args.systemPrompt).not.toContain("PAST work-history entry");
    // The payload carries every allowed role/company/date range
    expect(payloadOf()).toMatchObject({
      allowedSourceRoles: [
        {
          jobTitle: "Senior Product Manager",
          companyName: "Resultant",
          dates: "2022-01 – present",
        },
        {
          jobTitle: "Operations Manager",
          companyName: "Amazon",
          dates: "2019-06 – 2021-12",
        },
      ],
    });
  });

  it("keeps the single-role prompt for bullet contexts", async () => {
    const result = await runVerifier(makeBulletContext(), "bullet-1", "wh-1", "res-1");

    expect(result.passed).toBe(true);
    const args = lastRouteArgs();
    expect(args.systemPrompt).not.toContain("allowedSourceRoles");
    expect(args.systemPrompt).toContain("PAST work-history entry");
    expect(payloadOf()).not.toHaveProperty("allowedSourceRoles");
  });

  it("clears a Rule-1 failure that merely cites an allowed older role (two-role regression)", async () => {
    // The model wrongly flags the truthful Amazon mention under the old
    // single-role reading; the deterministic guard must clear it because
    // Amazon is in the career-wide identity contract.
    mockedRoute.mockResolvedValue({
      content: JSON.stringify({
        passed: false,
        failedChecks: [
          {
            rule: 1,
            description: "Source-role identity fidelity",
            evidence: "Amazon",
          },
        ],
      }),
      provider: "test",
      tokensUsed: 20,
      usedFallback: false,
    });

    const result = await runVerifier(makeSummaryContext(), "summary:res-1", "summary", "res-1");

    expect(result.passed).toBe(true);
    expect(result.checks.companyTitleDatesMatch.status).toBe("passed");
  });

  it("still fails a Rule-1 claim about a company outside the history", async () => {
    mockedRoute.mockResolvedValue({
      content: JSON.stringify({
        passed: false,
        failedChecks: [
          {
            rule: 1,
            description: "Source-role identity fidelity",
            evidence: "worked at Google",
          },
        ],
      }),
      provider: "test",
      tokensUsed: 20,
      usedFallback: false,
    });

    const context: VerifierContext = {
      ...makeSummaryContext(),
      bullets: ["Operations leader who worked at Google on launch initiatives."],
    };

    const result = await runVerifier(context, "summary:res-1", "summary", "res-1");

    expect(result.passed).toBe(false);
    expect(result.checks.companyTitleDatesMatch.status).toBe("failed");
    expect(result.retryInstructions).toContain("Rule 1");
  });
});
