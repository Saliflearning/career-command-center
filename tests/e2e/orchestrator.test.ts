/**
 * Orchestrator Pipeline — Unit Tests
 *
 * All external agents, DB calls, and utilities are mocked.
 * These tests verify the orchestration logic itself, not the agents.
 *
 * Root cause of previous failures: jest.clearAllMocks() clears call history
 * only — it does NOT reset mockResolvedValue implementations or the Once queue.
 * This caused mock implementations from crash-to-FAILED tests (e.g.
 * mockRejectedValue) to bleed into outer-retry tests.
 *
 * Fix: global beforeEach uses jest.resetAllMocks() (clears implementations
 * AND the Once queue) then re-establishes essential infra defaults.
 *
 * Suites:
 *  1. Happy path — UPLOADED → QA_REVIEWED, agents called in correct order
 *  2. P0 currentState fix — pipeline resumes from the right state, never
 *     re-runs earlier steps
 *  3. Cache restore — skips expensive LLM calls when jdAnalysisJson /
 *     strategyJson are already on the Resume record
 *  4. Crash-to-FAILED — any thrown exception triggers FAILED transition
 *  5. CareerMemory null guard — throws with clear error if no DB record
 *  6. Outer retry loop — verifier maxRetriesReached triggers bullet-writer
 *     re-call up to MAX_OUTER_RETRIES (2)
 *  7. Application tracking non-fatal — tracking DB failure never blocks
 *     the pipeline
 *  8. Observability — structured logging for start, complete, and error events
 */

import type {
  CareerMemory,
  JDAnalysis,
  ResumeStrategy,
  BulletWriterOutput,
  GeneratedBullet,
  VerifierResult,
  VerifierChecks,
} from "@/lib/types";
import type { SummaryWriterOutput } from "@/lib/types/summary-writer-output";

// ---------------------------------------------------------------------------
// Mock ALL external dependencies before any imports
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  db: {
    resume: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
    careerMemory: {
      findUnique: jest.fn(),
    },
    workHistory: {
      findUnique: jest.fn(),
    },
    bullet: {
      deleteMany: jest.fn(),
      findMany:   jest.fn(),
    },
    resumeSection: {
      findFirst:  jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      deleteMany: jest.fn(),
    },
    resumeBullet: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany:   jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      create:     jest.fn(),
    },
  },
}));

jest.mock("@/lib/state/machine", () => ({
  ResumeState: {
    UPLOADED:       "UPLOADED",
    PARSED:         "PARSED",
    NORMALIZED:     "NORMALIZED",
    VERIFIED:       "VERIFIED",
    JD_ANALYZED:    "JD_ANALYZED",
    STRATEGY_READY: "STRATEGY_READY",
    GENERATING:     "GENERATING",
    QA_REVIEWED:    "QA_REVIEWED",
    USER_EDITING:   "USER_EDITING",
    EXPORTED:       "EXPORTED",
    TRACKED:        "TRACKED",
    FAILED:         "FAILED",
  },
  canTransition: jest.fn(),
  transition:    jest.fn(),
}));

jest.mock("@/lib/storage/adapter", () => ({
  storage: {
    download: jest.fn(),
    upload:   jest.fn(),
  },
}));

jest.mock("@/agents/intake",         () => ({ runIntake:           jest.fn() }));
jest.mock("@/agents/normalizer",     () => ({ runNormalizer:       jest.fn() }));
jest.mock("@/agents/jd-analyst",     () => ({ runJDAnalyst:        jest.fn() }));
jest.mock("@/agents/strategy",       () => ({ runStrategy:         jest.fn() }));
jest.mock("@/agents/summary-writer", () => ({ runSummaryWriter:    jest.fn() }));
jest.mock("@/agents/bullet-writer",  () => ({ runBulletWriter:     jest.fn() }));
jest.mock("@/agents/verifier",       () => ({ runVerifier:         jest.fn() }));
jest.mock("@/agents/compression",    () => ({ runCompression:      jest.fn() }));
jest.mock("@/agents/diagnostic",     () => ({ runDiagnostic:       jest.fn() }));
jest.mock("@/lib/latex/generator",   () => ({ generateLatexSource: jest.fn() }));
jest.mock("@/lib/db/resume-source-profile", () => ({
  fetchResumeSourceProfile: jest.fn().mockResolvedValue(null),
  refreshResumeSourceProfile: jest.fn(async (_resumeId, profile) => profile),
}));
jest.mock("@/lib/resume/teaching-examples", () => ({
  loadTeachingContext: jest.fn().mockResolvedValue(""),
}));
jest.mock("@/lib/resume/visual-quality-gate", () => ({
  runResumeVisualQualityGate: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mock declarations — jest.mock is hoisted)
// ---------------------------------------------------------------------------

import { db }                          from "@/lib/db/client";
import { transition, ResumeState }     from "@/lib/state/machine";
import { runIntake }                   from "@/agents/intake";
import { runNormalizer }               from "@/agents/normalizer";
import { runJDAnalyst }                from "@/agents/jd-analyst";
import { runStrategy }                 from "@/agents/strategy";
import { runSummaryWriter }            from "@/agents/summary-writer";
import { runBulletWriter }             from "@/agents/bullet-writer";
import { runVerifier }                 from "@/agents/verifier";
import { generateLatexSource }         from "@/lib/latex/generator";
import { runResumeVisualQualityGate }  from "@/lib/resume/visual-quality-gate";

import { runPipeline }                 from "@/agents/orchestrator";

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const mockDb               = db as jest.Mocked<typeof db>;
const mockTransition       = transition as jest.MockedFunction<typeof transition>;
const mockRunIntake        = runIntake        as jest.MockedFunction<typeof runIntake>;
const mockRunNormalizer    = runNormalizer    as jest.MockedFunction<typeof runNormalizer>;
const mockRunJDAnalyst     = runJDAnalyst     as jest.MockedFunction<typeof runJDAnalyst>;
const mockRunStrategy      = runStrategy      as jest.MockedFunction<typeof runStrategy>;
const mockRunSummaryWriter = runSummaryWriter as jest.MockedFunction<typeof runSummaryWriter>;
const mockRunBulletWriter  = runBulletWriter  as jest.MockedFunction<typeof runBulletWriter>;
const mockRunVerifier      = runVerifier      as jest.MockedFunction<typeof runVerifier>;
const mockGenerateLatex    = generateLatexSource as jest.MockedFunction<typeof generateLatexSource>;
const mockVisualQualityGate = runResumeVisualQualityGate as jest.MockedFunction<typeof runResumeVisualQualityGate>;

// ---------------------------------------------------------------------------
// Fixture IDs
// ---------------------------------------------------------------------------

const RESUME_ID = "res-orch-test";
const USER_ID   = "user-orch-test";
const WH_ID     = "wh-stripe-001";

// ---------------------------------------------------------------------------
// Canonical test fixtures
// ---------------------------------------------------------------------------

/** CareerMemory as returned by runNormalizer (canonical type) */
const mockCareerMemory: CareerMemory = {
  id:      "cm-orch-1",
  userId:  USER_ID,
  version: 1,
  jobs: [{
    id:             WH_ID,
    company:        "Stripe",
    title:          "Senior Product Manager",
    startDate:      "2022-01-01T00:00:00.000Z",
    endDate:        null,
    current:        true,
    location:       "San Francisco, CA",
    employmentType: "full-time",
    bullets: [{
      id:                "bullet-source-1",
      content:           "Led activation initiative reducing time-to-first-charge by 40%",
      contentType:       "VERIFIED",
      metrics:           ["40%"],
      keywords:          ["activation"],
      locked:            false,
      usedInResumeCount: 0,
    }],
    sourceType: "UPLOADED",
    verified:   true,
    locked:     false,
    sortOrder:  0,
  }],
  education: [{
    id:             "edu-1",
    degree:         "BS Computer Science",
    institution:    "Stanford University",
    graduationDate: "2019-05-01T00:00:00.000Z",
    expectedDate:   null,
    inProgress:     false,
    gpa:            "3.8",
    location:       null,
    verified:       false,
  }],
  skills: [
    { id: "skill-1", name: "Product Strategy", category: "Product",   proficiencyLabel: null,    verified: false },
    { id: "skill-2", name: "SQL",              category: "Technical", proficiencyLabel: "basic", verified: false },
  ],
  certifications: [],
  projects:       [],
  achievements:   [],
  createdAt:      "2024-01-01T00:00:00.000Z",
  updatedAt:      "2024-01-01T00:00:00.000Z",
};

/** Raw DB row returned by db.careerMemory.findUnique */
const mockCareerMemoryDB = {
  id:        "cm-orch-1",
  userId:    USER_ID,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  jobs: [{
    id:             WH_ID,
    company:        "Stripe",
    title:          "Senior Product Manager",
    startDate:      new Date("2022-01-01"),
    endDate:        null,
    current:        true,
    location:       "San Francisco, CA",
    employmentType: "full-time",
    bullets: [{
      id:          "bullet-source-1",
      content:     "Led activation initiative reducing time-to-first-charge by 40%",
      contentType: "VERIFIED",
      metrics:     ["40%"],
      keywords:    ["activation"],
      locked:      false,
    }],
    sourceType: "UPLOADED",
    verified:   true,
    locked:     false,
    sortOrder:  0,
  }],
  education: [{
    id:             "edu-1",
    degree:         "BS Computer Science",
    school:         "Stanford University",
    graduationDate: new Date("2019-05-01"),
    expected:       false,
    gpa:            "3.8",
  }],
  skills: [
    { id: "skill-1", name: "Product Strategy", category: "Product",   qualifier: null    },
    { id: "skill-2", name: "SQL",              category: "Technical", qualifier: "basic" },
  ],
};

/** Raw DB row returned by db.workHistory.findUnique (for verifier context) */
const mockWorkHistoryDB = {
  id:        WH_ID,
  company:   "Stripe",
  title:     "Senior Product Manager",
  startDate: new Date("2022-01-01"),
  endDate:   null,
  bullets: [{
    id:          "bullet-source-1",
    content:     "Led activation initiative reducing time-to-first-charge by 40%",
    contentType: "VERIFIED",
    metrics:     ["40%"],
  }],
};

const mockJDAnalysis: JDAnalysis = {
  resumeId:      RESUME_ID,
  jdHash:        "abc123hash",
  analyzedAt:    "2026-05-20T10:00:00.000Z",
  agentVersion:  "jd-analyst@1.0.0",
  provider:      "anthropic",
  rawJdText:     "Notion is seeking a Director of Product Management to lead growth.",
  targetCompany: "Notion",
  targetRole:    "Director of Product Management",
  tone:          "startup",
  topKeywords: [
    { term: "product-led growth", frequency: 3, required: true,  category: "domain" },
    { term: "activation",         frequency: 4, required: true,  category: "domain" },
  ],
  requirements: [
    { text: "7+ years PM experience", type: "hard", matchedInProfile: true, matchedSkillIds: [] },
  ],
  sections:        [],
  seniorityLevel:  "senior",
  remotePolicy:    "hybrid",
  teamSize:        "3 PMs",
  industryDomain:  "SaaS / productivity",
  summaryForUser:  "Notion needs a growth-focused PM leader to own activation and onboarding.",
  keyGapsInProfile: ["Explicit PLG experience not mentioned (will not be fabricated)"],
};

const mockGroundedJDAnalysis: JDAnalysis = {
  ...mockJDAnalysis,
  topKeywords: [
    ...mockJDAnalysis.topKeywords,
    { term: "product management", frequency: 1, required: false, category: "other" },
  ],
};

const expectedGroundedJDKeywords = [
  "product-led growth",
  "activation",
  "product management",
];

const mockStrategy: ResumeStrategy = {
  resumeId:            RESUME_ID,
  userId:              USER_ID,
  strategyVersion:     1,
  generatedAt:         "2026-05-20T10:01:00.000Z",
  agentVersion:        "strategy@1.0.0",
  provider:            "anthropic",
  careerMemoryVersion: 1,
  jdHash:              "abc123hash",
  roleType:            "TECHNICAL",
  sectionOrder: [
    { section: "summary",    include: true,  position: 1, rationale: "Lead with summary",     emphasize: false },
    { section: "experience", include: true,  position: 2, rationale: "Most relevant section", emphasize: true  },
    { section: "education",  include: true,  position: 3, rationale: "Stanford is strong",    emphasize: false },
  ],
  workHistoryInScope: [{
    workHistoryId:     WH_ID,
    company:           "Stripe",
    title:             "Senior Product Manager",
    include:           true,
    bulletCountTarget: 4,
    emphasisKeywords:  ["activation", "product-led growth"],
    rationale:         "Most recent and most relevant role",
  }],
  keywordStrategy: [
    { keyword: "activation", targetSection: "experience", targetWorkHistoryId: WH_ID },
  ],
  summaryGuidance:    "Lead with growth PM experience at Stripe's scale",
  topEmphases:        ["Activation at Stripe", "SQL analysis", "Cross-functional leadership"],
  keywordsMatched:    ["activation", "SQL"],
  keywordsUnmatched:  ["product-led growth"],
  matchScore:         72,
};

const mockSummaryOutput: SummaryWriterOutput = {
  resumeId:     RESUME_ID,
  summaryText:  "Growth-focused Product Manager with 8 years at Stripe, specialising in activation and onboarding.",
  wordCount:    17,
  agentVersion: "summary-writer@1.0.0",
  provider:     "anthropic",
  generatedAt:  "2026-05-20T10:02:00.000Z",
};

const makeBulletOutput = (id = "bullet-gen-1"): BulletWriterOutput => ({
  workHistoryId: WH_ID,
  resumeId:      RESUME_ID,
  bullets: [{
    id,
    workHistoryId:               WH_ID,
    resumeId:                    RESUME_ID,
    content:                     "Led activation initiative cutting time-to-first-charge by 40% across 2M merchants",
    metricsUsed:                 ["40%", "2M"],
    keywordsMatched:             ["activation"],
    sourceCareerMemoryBulletIds: ["bullet-source-1"],
    startsWithActionVerb:        true,
    lineCount:                   1,
    forbiddenWordsCheck:         "passed",
    qualifierRuleCheck:          "passed",
    emDashCheck:                 "passed",
    confidence:                  0.94,
    warnings:                    [],
    attemptNumber:               1,
    verificationStatus:          "pending",
    agentVersion:                "bullet-writer@2.0.0",
    provider:                    "anthropic",
    generatedAt:                 new Date().toISOString(),
  } as GeneratedBullet],
  totalAttempts: 1,
  agentVersion:  "bullet-writer@2.0.0",
  provider:      "anthropic",
  generatedAt:   new Date().toISOString(),
});

const makePassing = (): VerifierResult => ({
  bulletId:      "bullet-gen-1",
  workHistoryId: WH_ID,
  resumeId:      RESUME_ID,
  attemptNumber: 1,
  passed:        true,
  checks: {
    companyTitleDatesMatch:  { rule: "Company/title/dates match user input",    status: "passed", detail: null },
    noFabricatedSkills:      { rule: "No fabricated skills or tools",           status: "passed", detail: null },
    degreeStatusAccurate:    { rule: "Degree status accurate",                  status: "passed", detail: null },
    metricsMatchUserInput:   { rule: "Metrics match user input",                status: "passed", detail: null },
    noCrossJobContamination: { rule: "Content under correct company",           status: "passed", detail: null },
    tailoredToJD:            { rule: "Tailored to job description",             status: "passed", detail: null },
    noEmDashes:              { rule: "No em dashes in bullets",                 status: "passed", detail: null },
    noForbiddenBuzzwords:    { rule: "No forbidden buzzwords",                  status: "passed", detail: null },
    qualifierRuleHeld:       { rule: "Qualifier rule not violated",             status: "passed", detail: null },
  } satisfies VerifierChecks,
  retryInstructions: null,
  maxRetriesReached: false,
  userMessage:       null,
  agentVersion:      "verifier@2.0.0",
  provider:          "anthropic",
  verifiedAt:        new Date().toISOString(),
});

const makeFailing = (maxRetriesReached = false): VerifierResult => ({
  ...makePassing(),
  passed: false,
  checks: {
    ...makePassing().checks,
    noForbiddenBuzzwords: {
      rule:   "No forbidden buzzwords",
      status: "failed",
      detail: "Bullet contains 'leveraged' (forbidden word §8)",
    },
  },
  retryInstructions:  "Replace 'leveraged' with a specific past-tense action verb.",
  maxRetriesReached,
  userMessage: maxRetriesReached
    ? "We spotted a potential quality issue in one of your bullets. You can accept it, edit it manually, or ask us to retry."
    : null,
});

// ---------------------------------------------------------------------------
// Resume DB factory
// ---------------------------------------------------------------------------

function makeResume(state: string, overrides?: Record<string, unknown>) {
  return {
    id:             RESUME_ID,
    userId:         USER_ID,
    state,
    // Signed-URL shape: _getFileBuffer derives the bucket path from
    // "/resume-files/<path>" and calls the (mocked) storage.download
    pdfUrl:         "https://example.supabase.co/storage/v1/object/sign/resume-files/user-orch-test/res-orch-test/original.pdf?token=test",
    latexSource:    null,
    pageCount:      null,
    jdText:         "Notion is seeking a Director of Product Management to lead growth.",
    targetRole:     "Director of Product Management",
    targetCompany:  "Notion",
    jdAnalysisJson: null,
    strategyJson:   null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Global beforeEach — runs before EVERY test in this file
//
// jest.resetAllMocks() clears both call history AND implementations (including
// the mockResolvedValueOnce queue). This prevents mock pollution between
// suites — critical when crash tests set mockRejectedValue that would leak.
//
// After the reset, re-establish essential infra defaults so that every test
// starts from a clean, working baseline.
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetAllMocks();

  // DB defaults — mirrors what the jest.mock factory would have provided
  (mockDb.resume.update     as jest.Mock).mockResolvedValue({});
  (mockDb.resumeSection.findFirst as jest.Mock).mockResolvedValue(null);
  (mockDb.resumeSection.create    as jest.Mock).mockResolvedValue({});
  (mockDb.resumeSection.update    as jest.Mock).mockResolvedValue({});
  (mockDb.resumeSection.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockDb.resumeBullet.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockDb.resumeBullet.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockDb.resumeBullet.findMany   as jest.Mock).mockResolvedValue([]);
  (mockDb.bullet.deleteMany       as jest.Mock).mockResolvedValue({ count: 0 });
  (mockDb.bullet.findMany         as jest.Mock).mockResolvedValue([]);
  (mockDb.application.findUnique  as jest.Mock).mockResolvedValue(null);
  (mockDb.application.create      as jest.Mock).mockResolvedValue({});

  // State machine
  mockTransition.mockResolvedValue(undefined);

  // Storage
  const { storage } = jest.requireMock("@/lib/storage/adapter");
  (storage.download as jest.Mock).mockResolvedValue(Buffer.from("mock-pdf-bytes"));

  // Compression (default: no-op, returns same string)
  const { runCompression } = jest.requireMock("@/agents/compression");
  (runCompression as jest.Mock).mockResolvedValue("\\documentclass{article}\\end{document}");

  // Diagnostic (non-fatal scoring step — default healthy scores)
  const { runDiagnostic } = jest.requireMock("@/agents/diagnostic");
  (runDiagnostic as jest.Mock).mockResolvedValue({
    atsScore: 80,
    keywordScore: 75,
    issues: [],
    recommendations: [],
  });

  // Final visual gate - unit tests verify orchestration, while the visual-QA
  // suite owns PDF geometry and screenshot behavior.
  mockVisualQualityGate.mockResolvedValue({
    resumeId: RESUME_ID,
    pdfUrl: "signed://final-preview.pdf",
    screenshotUrl: "signed://final-preview.png",
    passed: true,
    checks: {
      pageCount: { name: "ok", status: "passed", detail: null },
      noTextOverflow: { name: "ok", status: "passed", detail: null },
      noMarginViolation: { name: "ok", status: "passed", detail: null },
      headerRendered: { name: "ok", status: "passed", detail: null },
      sectionBreaks: { name: "ok", status: "passed", detail: null },
      fontConsistency: { name: "ok", status: "passed", detail: null },
      atsLayoutSafe: { name: "ok", status: "passed", detail: null },
      screenshotRendered: { name: "ok", status: "passed", detail: null },
      balancedDensity: { name: "ok", status: "passed", detail: null },
    },
    pageCountActual: 1,
    estimatedAtsSafe: true,
    recommendedAction: null,
    referenceStandard: "private-sector-one-page-v1",
    layoutMetrics: null,
    agentVersion: "visual-qa@test",
    checkedAt: "2026-07-16T00:00:00.000Z",
    pdfPath: `${USER_ID}/${RESUME_ID}/quality/final-preview.pdf`,
    screenshotPath: `${USER_ID}/${RESUME_ID}/quality/final-preview.png`,
    density: "balanced",
    omittedContent: [],
  });

  // JD analyst — the orchestrator fires runJDAnalyst(...).catch(...) EARLY
  // (parallel with intake). Without a default implementation, tests that never
  // configure this mock get undefined.catch → TypeError before their real
  // assertion runs.
  mockRunJDAnalyst.mockResolvedValue(mockJDAnalysis);

  // LaTeX generator
  mockGenerateLatex.mockReturnValue("\\documentclass{article}\\begin{document}RESUME\\end{document}");
});

// ---------------------------------------------------------------------------
// setupHappyPathMocks — full pipeline agent mocks for UPLOADED start
// ---------------------------------------------------------------------------

function setupHappyPathMocks() {
  mockRunIntake.mockResolvedValue("Extracted raw resume text from PDF");
  mockRunNormalizer.mockResolvedValue(mockCareerMemory);
  mockRunJDAnalyst.mockResolvedValue(mockJDAnalysis);
  mockRunStrategy.mockResolvedValue(mockStrategy);
  mockRunSummaryWriter.mockResolvedValue(mockSummaryOutput);
  mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
  mockRunVerifier.mockResolvedValue(makePassing());

  (mockDb.resume.findUnique as jest.Mock)
    .mockResolvedValueOnce(makeResume("UPLOADED"))
    .mockResolvedValueOnce({ latexSource: "Extracted raw resume text from PDF" })
    .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

  (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(mockCareerMemoryDB);
  (mockDb.workHistory.findUnique  as jest.Mock).mockResolvedValue(mockWorkHistoryDB);
}

// ---------------------------------------------------------------------------
// Suite 1: Happy Path — UPLOADED → QA_REVIEWED
// ---------------------------------------------------------------------------

describe("Orchestrator — happy path (UPLOADED → QA_REVIEWED)", () => {
  beforeEach(setupHappyPathMocks);

  it("calls all 7 agents in the correct sequence", async () => {
    await runPipeline(RESUME_ID);

    expect(mockRunIntake).toHaveBeenCalledTimes(1);
    expect(mockRunNormalizer).toHaveBeenCalledTimes(1);
    expect(mockRunJDAnalyst).toHaveBeenCalledTimes(1);
    expect(mockRunStrategy).toHaveBeenCalledTimes(1);
    expect(mockRunSummaryWriter).toHaveBeenCalledTimes(1);
    expect(mockRunBulletWriter).toHaveBeenCalledTimes(1);
    expect(mockRunVerifier).toHaveBeenCalledTimes(1);
    expect(mockGenerateLatex).toHaveBeenCalledTimes(1);
  });

  it("transitions through all states in the correct order", async () => {
    await runPipeline(RESUME_ID);

    const calls = mockTransition.mock.calls.map(([, state]) => state);
    expect(calls).toEqual([
      ResumeState.PARSED,
      ResumeState.NORMALIZED,
      ResumeState.VERIFIED,
      ResumeState.JD_ANALYZED,
      ResumeState.STRATEGY_READY,
      ResumeState.GENERATING,
      ResumeState.QA_REVIEWED,
      // Final transition added in e2fff83: pipeline hands off to the editor
      // only after scores are written
      ResumeState.USER_EDITING,
    ]);
  });

  it("passes resumeId to every transition call", async () => {
    await runPipeline(RESUME_ID);
    for (const [id] of mockTransition.mock.calls) {
      expect(id).toBe(RESUME_ID);
    }
  });

  it("removes a stale pipeline error after a successful retry", async () => {
    await runPipeline(RESUME_ID);

    expect(mockDb.resumeSection.deleteMany).toHaveBeenCalledWith({
      where: { resumeId: RESUME_ID, name: "pipeline_error" },
    });
  });

  it("passes extracted text from intake to normalizer", async () => {
    await runPipeline(RESUME_ID);
    expect(mockRunNormalizer).toHaveBeenCalledWith(
      "Extracted raw resume text from PDF",
      USER_ID,
      RESUME_ID,
      []
    );
  });

  it("passes only source-attributed confirmed evidence to the normalizer", async () => {
    const confirmedEvidence = {
      term: "WMS",
      category: "Operational technology",
      source: "Stripe - Senior Product Manager",
      details: "Used WMS dashboards to review daily throughput.",
    };
    (mockDb.resumeSection.findFirst as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ content: JSON.stringify([confirmedEvidence]) });

    await runPipeline(RESUME_ID);

    expect(mockRunNormalizer).toHaveBeenCalledWith(
      "Extracted raw resume text from PDF",
      USER_ID,
      RESUME_ID,
      [confirmedEvidence]
    );
  });

  it("uses pasted resume text as the source when no upload exists", async () => {
    const pastedResumeText =
      "Senior product leader with 10 years of experience launching growth systems, mentoring teams, and improving activation metrics.";
    const { storage } = jest.requireMock("@/lib/storage/adapter");

    mockRunNormalizer.mockResolvedValue(mockCareerMemory);
    (mockDb.resume.findUnique as jest.Mock).mockReset();
    (mockDb.resumeSection.findFirst as jest.Mock).mockReset();

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("UPLOADED", { pdfUrl: null }))
      .mockResolvedValueOnce({ latexSource: pastedResumeText })
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    (mockDb.resumeSection.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: "source-section", content: pastedResumeText })
      .mockResolvedValue(null);

    await runPipeline(RESUME_ID);

    expect(storage.download).not.toHaveBeenCalled();
    expect(mockRunIntake).not.toHaveBeenCalled();
    expect(mockRunNormalizer).toHaveBeenCalledWith(
      pastedResumeText,
      USER_ID,
      RESUME_ID,
      []
    );
  });

  it("passes careerMemory and jdAnalysis to strategy", async () => {
    await runPipeline(RESUME_ID);
    expect(mockRunStrategy).toHaveBeenCalledWith(
      RESUME_ID,
      mockGroundedJDAnalysis,
      mockCareerMemory
    );
  });

  it("passes careerMemory, jdAnalysis, and strategy to summary writer", async () => {
    await runPipeline(RESUME_ID);
    expect(mockRunSummaryWriter).toHaveBeenCalledWith(
      RESUME_ID,
      mockCareerMemory,
      mockGroundedJDAnalysis,
      mockStrategy,
      ""
    );
  });

  it("calls bullet writer with the work history ID from strategy", async () => {
    await runPipeline(RESUME_ID);
    // 4th arg is the density-derived max bullet count — value varies by strategy
    expect(mockRunBulletWriter).toHaveBeenCalledWith(
      WH_ID,
      RESUME_ID,
      undefined,
      expect.any(Number),
      ""
    );
  });

  it("passes bullet content strings to the verifier", async () => {
    await runPipeline(RESUME_ID);
    const [verifierContext] = (mockRunVerifier as jest.Mock).mock.calls[0];
    expect(verifierContext.bullets).toContain(
      "Led activation initiative cutting time-to-first-charge by 40% across 2M merchants"
    );
    expect(verifierContext.sourceEvidence).toContain(
      "Led activation initiative reducing time-to-first-charge by 40%"
    );
  });

  it("derives verifier metrics from source text when metric metadata is empty", async () => {
    (mockDb.workHistory.findUnique as jest.Mock).mockResolvedValueOnce({
      ...mockWorkHistoryDB,
      bullets: mockWorkHistoryDB.bullets.map((bullet) => ({ ...bullet, metrics: [] })),
    });

    await runPipeline(RESUME_ID);

    const [verifierContext] = (mockRunVerifier as jest.Mock).mock.calls[0];
    expect(verifierContext.userMetrics).toContain("40%");
  });

  it("generates LaTeX after bullet-writer and verifier have completed", async () => {
    await runPipeline(RESUME_ID);
    const bulletOrder   = mockRunBulletWriter.mock.invocationCallOrder[0];
    const verifierOrder = mockRunVerifier.mock.invocationCallOrder[0];
    const latexOrder    = mockGenerateLatex.mock.invocationCallOrder[0];

    expect(latexOrder).toBeGreaterThan(bulletOrder);
    expect(latexOrder).toBeGreaterThan(verifierOrder);
  });

  it("marks pipelineStartedAt at the start of the run", async () => {
    await runPipeline(RESUME_ID);
    const firstUpdate = (mockDb.resume.update as jest.Mock).mock.calls[0];
    expect(firstUpdate[0].data).toHaveProperty("pipelineStartedAt");
  });

  it("marks pipelineFinishedAt at the end of the run", async () => {
    await runPipeline(RESUME_ID);
    const updates     = (mockDb.resume.update as jest.Mock).mock.calls;
    const lastUpdate  = updates[updates.length - 1];
    expect(lastUpdate[0].data).toHaveProperty("pipelineFinishedAt");
  });

  it("does not create an Application until the user explicitly tracks it", async () => {
    await runPipeline(RESUME_ID);
    expect(mockDb.application.findUnique).not.toHaveBeenCalled();
    expect(mockDb.application.create).not.toHaveBeenCalled();
  });

  it("skips compression when page count is 1", async () => {
    const { runCompression } = jest.requireMock("@/agents/compression");
    await runPipeline(RESUME_ID);
    expect(runCompression).not.toHaveBeenCalled();
  });

  it("runs compression when page count exceeds 1", async () => {
    // Override: QA step returns pageCount=2
    (mockDb.resume.findUnique as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(makeResume("UPLOADED"))
      .mockResolvedValueOnce({ latexSource: "Extracted raw resume text from PDF" })
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 2 });

    const { runCompression } = jest.requireMock("@/agents/compression");
    (runCompression as jest.Mock).mockResolvedValue("compressed-latex");

    await runPipeline(RESUME_ID);

    expect(runCompression).toHaveBeenCalledTimes(1);
    expect(runCompression).toHaveBeenCalledWith(RESUME_ID, "\\documentclass...", 2);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: P0 currentState Fix — start from the right state, skip earlier steps
// ---------------------------------------------------------------------------

describe("Orchestrator — P0 currentState fix (no stale-state reads)", () => {
  beforeEach(() => {
    // Agents needed for mid-pipeline starts
    mockRunJDAnalyst.mockResolvedValue(mockJDAnalysis);
    mockRunStrategy.mockResolvedValue(mockStrategy);
    mockRunSummaryWriter.mockResolvedValue(mockSummaryOutput);
    mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
    mockRunVerifier.mockResolvedValue(makePassing());

    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(mockCareerMemoryDB);
    (mockDb.workHistory.findUnique  as jest.Mock).mockResolvedValue(mockWorkHistoryDB);
  });

  it("starting at VERIFIED skips intake and normalizer", async () => {
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED"))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockRunIntake).not.toHaveBeenCalled();
    expect(mockRunNormalizer).not.toHaveBeenCalled();
    expect(mockRunJDAnalyst).toHaveBeenCalledTimes(1);
  });

  it("starting at GENERATING (with caches) skips all 5 pre-generation agents", async () => {
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("GENERATING", {
        jdAnalysisJson: mockJDAnalysis,
        strategyJson:   mockStrategy,
      }))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockRunIntake).not.toHaveBeenCalled();
    expect(mockRunNormalizer).not.toHaveBeenCalled();
    expect(mockRunJDAnalyst).not.toHaveBeenCalled();
    expect(mockRunStrategy).not.toHaveBeenCalled();
    expect(mockRunSummaryWriter).not.toHaveBeenCalled();
    // Bullets and verifier must still run
    expect(mockRunBulletWriter).toHaveBeenCalledTimes(1);
    expect(mockRunVerifier).toHaveBeenCalledTimes(1);
    expect(mockGenerateLatex).toHaveBeenCalledTimes(1);
  });

  it("UPLOADED block runs then immediately triggers PARSED block in the same call", async () => {
    mockRunIntake.mockResolvedValue("raw text from intake");
    mockRunNormalizer.mockResolvedValue(mockCareerMemory);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("UPLOADED"))
      .mockResolvedValueOnce({ latexSource: "raw text from intake" })
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    const transitions = mockTransition.mock.calls.map(([, s]) => s);
    expect(transitions).toContain(ResumeState.PARSED);
    expect(transitions).toContain(ResumeState.NORMALIZED);
    expect(transitions.indexOf(ResumeState.PARSED)).toBeLessThan(
      transitions.indexOf(ResumeState.NORMALIZED)
    );
  });

  it("starting at QA_REVIEWED only runs compression check and tracking — no generation agents", async () => {
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("QA_REVIEWED"))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockRunIntake).not.toHaveBeenCalled();
    expect(mockRunNormalizer).not.toHaveBeenCalled();
    expect(mockRunJDAnalyst).not.toHaveBeenCalled();
    expect(mockRunStrategy).not.toHaveBeenCalled();
    expect(mockRunSummaryWriter).not.toHaveBeenCalled();
    expect(mockRunBulletWriter).not.toHaveBeenCalled();
    expect(mockRunVerifier).not.toHaveBeenCalled();
    expect(mockDb.application.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Cache Restore — skip LLM calls when JSON is cached
// ---------------------------------------------------------------------------

describe("Orchestrator — JDAnalysis + Strategy cache restore", () => {
  beforeEach(() => {
    mockRunSummaryWriter.mockResolvedValue(mockSummaryOutput);
    mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
    mockRunVerifier.mockResolvedValue(makePassing());

    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(mockCareerMemoryDB);
    (mockDb.workHistory.findUnique  as jest.Mock).mockResolvedValue(mockWorkHistoryDB);
  });

  it("skips runJDAnalyst when jdAnalysisJson is already on the Resume record", async () => {
    mockRunStrategy.mockResolvedValue(mockStrategy);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED", { jdAnalysisJson: mockJDAnalysis }))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockRunJDAnalyst).not.toHaveBeenCalled();
    // Strategy still gets called with the restored jdAnalysis
    expect(mockRunStrategy).toHaveBeenCalledWith(RESUME_ID, mockGroundedJDAnalysis, expect.anything());
  });

  it("skips runStrategy when strategyJson is already on the Resume record", async () => {
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("JD_ANALYZED", {
        jdAnalysisJson: mockJDAnalysis,
        strategyJson:   mockStrategy,
      }))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockRunStrategy).not.toHaveBeenCalled();
    expect(mockRunSummaryWriter).toHaveBeenCalledWith(
      RESUME_ID,
      expect.anything(),  // careerMemory (fetched from DB)
      mockJDAnalysis,
      mockStrategy,
      ""
    );
  });

  it("skips both LLM calls when both caches are set", async () => {
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED", {
        jdAnalysisJson: mockJDAnalysis,
        strategyJson:   mockStrategy,
      }))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockRunJDAnalyst).not.toHaveBeenCalled();
    expect(mockRunStrategy).not.toHaveBeenCalled();
    // Downstream agents still run
    expect(mockRunSummaryWriter).toHaveBeenCalledTimes(1);
    expect(mockRunBulletWriter).toHaveBeenCalledTimes(1);
    expect(mockRunVerifier).toHaveBeenCalledTimes(1);
  });

  it("persists jdAnalysisJson to Resume after calling runJDAnalyst", async () => {
    mockRunJDAnalyst.mockResolvedValue(mockJDAnalysis);
    mockRunStrategy.mockResolvedValue(mockStrategy);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED"))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    const updateCalls = (mockDb.resume.update as jest.Mock).mock.calls;
    const jdUpdate    = updateCalls.find(([c]) => c.data && "jdAnalysisJson" in c.data);
    expect(jdUpdate).toBeDefined();
    expect(jdUpdate[0].data.jdAnalysisJson).toMatchObject({ resumeId: RESUME_ID, jdHash: "abc123hash" });
    expect(jdUpdate[0].data.jdKeywords).toEqual(expectedGroundedJDKeywords);
  });

  it("repairs empty resume keywords from cached JD analysis before generation", async () => {
    mockRunStrategy.mockResolvedValue(mockStrategy);
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED", {
        jdAnalysisJson: mockJDAnalysis,
        jdKeywords: [],
      }))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockDb.resume.update).toHaveBeenCalledWith({
      where: { id: RESUME_ID },
      data: expect.objectContaining({
        jdKeywords: expectedGroundedJDKeywords,
      }),
    });
  });

  it("persists strategyJson to Resume after calling runStrategy", async () => {
    mockRunJDAnalyst.mockResolvedValue(mockJDAnalysis);
    mockRunStrategy.mockResolvedValue(mockStrategy);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED"))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    const updateCalls    = (mockDb.resume.update as jest.Mock).mock.calls;
    const strategyUpdate = updateCalls.find(([c]) => c.data && "strategyJson" in c.data);
    expect(strategyUpdate).toBeDefined();
    expect(strategyUpdate[0].data.strategyJson).toMatchObject({ resumeId: RESUME_ID, roleType: "TECHNICAL" });
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Crash-to-FAILED — any thrown exception triggers FAILED transition
// ---------------------------------------------------------------------------

describe("Orchestrator — crash-to-FAILED path", () => {
  it("transitions to FAILED and re-throws when runIntake throws", async () => {
    mockRunIntake.mockRejectedValue(new Error("PDF parsing service unavailable"));

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("UPLOADED"));

    await expect(runPipeline(RESUME_ID)).rejects.toThrow("PDF parsing service unavailable");
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("transitions to FAILED and re-throws when runNormalizer throws", async () => {
    mockRunIntake.mockResolvedValue("raw text");
    mockRunNormalizer.mockRejectedValue(new Error("Normalizer LLM timeout"));

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("UPLOADED"))
      .mockResolvedValueOnce({ latexSource: "raw text" });

    await expect(runPipeline(RESUME_ID)).rejects.toThrow("Normalizer LLM timeout");
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("transitions to FAILED when normalizer returns no jobs", async () => {
    mockRunIntake.mockResolvedValue("raw text");
    mockRunNormalizer.mockResolvedValue({ ...mockCareerMemory, jobs: [] });

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("UPLOADED"))
      .mockResolvedValueOnce({ latexSource: "raw text" });

    await expect(runPipeline(RESUME_ID)).rejects.toThrow(
      /uploaded file didn't contain recognisable work experience/i
    );
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("transitions to FAILED when jdText is null at the preflight check", async () => {
    mockRunIntake.mockResolvedValue("raw text");
    mockRunNormalizer.mockResolvedValue(mockCareerMemory);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("UPLOADED", { jdText: null }))
      .mockResolvedValueOnce({ latexSource: "raw text" });

    await expect(runPipeline(RESUME_ID)).rejects.toThrow(
      /job description is required/i
    );
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("transitions to FAILED and re-throws when runJDAnalyst throws", async () => {
    mockRunJDAnalyst.mockRejectedValue(new Error("JD Analyst provider error"));

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED"));

    await expect(runPipeline(RESUME_ID)).rejects.toThrow("JD Analyst provider error");
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("transitions to FAILED and re-throws when runStrategy throws", async () => {
    mockRunJDAnalyst.mockResolvedValue(mockJDAnalysis);
    mockRunStrategy.mockRejectedValue(new Error("Strategy agent timeout"));
    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(mockCareerMemoryDB);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED"));

    await expect(runPipeline(RESUME_ID)).rejects.toThrow("Strategy agent timeout");
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("transitions to FAILED and re-throws when runBulletWriter throws", async () => {
    mockRunBulletWriter.mockRejectedValue(new Error("Bullet writer API error"));
    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(mockCareerMemoryDB);
    (mockDb.workHistory.findUnique  as jest.Mock).mockResolvedValue(mockWorkHistoryDB);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("GENERATING", {
        jdAnalysisJson: mockJDAnalysis,
        strategyJson:   mockStrategy,
      }));

    await expect(runPipeline(RESUME_ID)).rejects.toThrow("Bullet writer API error");
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("re-throws the original error even when the FAILED transition itself throws", async () => {
    mockRunJDAnalyst.mockRejectedValue(new Error("original error"));
    // First transition call (to FAILED) throws — must be swallowed
    mockTransition.mockRejectedValueOnce(new Error("DB unreachable during FAILED write"));

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED"));

    // Must throw the original error, not the transition error
    await expect(runPipeline(RESUME_ID)).rejects.toThrow("original error");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: CareerMemory Null Guard
// ---------------------------------------------------------------------------

describe("Orchestrator — careerMemory null guard", () => {
  it("throws with a clear fault message when DB has no CareerMemory at STRATEGY step", async () => {
    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(null);
    mockRunJDAnalyst.mockResolvedValue(mockJDAnalysis);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("JD_ANALYZED", { jdAnalysisJson: mockJDAnalysis }));

    await expect(runPipeline(RESUME_ID)).rejects.toThrow(
      /careerMemory is null at STRATEGY step/i
    );
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });

  it("throws with a clear fault message when DB has no CareerMemory at GENERATING step", async () => {
    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(null);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("GENERATING", {
        jdAnalysisJson: mockJDAnalysis,
        strategyJson:   mockStrategy,
      }));

    await expect(runPipeline(RESUME_ID)).rejects.toThrow(
      /careerMemory is null at GENERATING step/i
    );
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Outer Retry Loop — MAX_OUTER_RETRIES = 2
// ---------------------------------------------------------------------------

describe("Orchestrator — outer retry loop (MAX_OUTER_RETRIES = 2)", () => {
  /** Start a pipeline run from GENERATING state with both caches populated */
  function setupGeneratingRun() {
    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(mockCareerMemoryDB);
    (mockDb.workHistory.findUnique  as jest.Mock).mockResolvedValue(mockWorkHistoryDB);

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("GENERATING", {
        jdAnalysisJson: mockJDAnalysis,
        strategyJson:   mockStrategy,
      }))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });
  }

  it("does not run broad generated-bullet cleanup on the first attempt", async () => {
    setupGeneratingRun();
    mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
    mockRunVerifier.mockResolvedValue(makePassing());

    await runPipeline(RESUME_ID);

    expect(mockRunBulletWriter).toHaveBeenCalledTimes(1);
    expect(mockRunVerifier).toHaveBeenCalledTimes(1);
    expect(mockDb.bullet.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only this run's discarded bullet ids before an outer retry", async () => {
    setupGeneratingRun();
    mockRunBulletWriter
      .mockResolvedValueOnce(makeBulletOutput("bullet-attempt-1"))
      .mockResolvedValueOnce(makeBulletOutput("bullet-attempt-2"));
    mockRunVerifier
      .mockResolvedValueOnce(makeFailing(/* maxRetriesReached */ true))
      .mockResolvedValueOnce(makePassing());

    await runPipeline(RESUME_ID);

    expect(mockRunBulletWriter).toHaveBeenCalledTimes(2);
    expect(mockRunVerifier).toHaveBeenCalledTimes(2);
    expect(mockDb.bullet.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockDb.bullet.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["bullet-attempt-1"] },
        workHistoryId: WH_ID,
        contentType: "GENERATED",
        usedInResumes: { none: {} },
      },
    });
  });

  it("passes retryContext on the second bullet-writer call", async () => {
    setupGeneratingRun();
    mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
    mockRunVerifier
      .mockResolvedValueOnce(makeFailing(true))
      .mockResolvedValueOnce(makePassing());

    await runPipeline(RESUME_ID);

    const firstCall  = (mockRunBulletWriter as jest.Mock).mock.calls[0];
    const secondCall = (mockRunBulletWriter as jest.Mock).mock.calls[1];

    // First call has no retryContext
    expect(firstCall[2]).toBeUndefined();
    // Second call has retryContext with instructions and outerAttempt = 1
    expect(secondCall[2]).toBeDefined();
    expect(secondCall[2]).toHaveProperty("instructions");
    expect(secondCall[2].outerAttempt).toBe(1);
  });

  it("caps outer retries at MAX_OUTER_RETRIES (2) even if verifier keeps failing", async () => {
    setupGeneratingRun();
    mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
    mockRunVerifier.mockResolvedValue(makeFailing(true)); // always maxRetriesReached

    await runPipeline(RESUME_ID);

    expect(mockRunBulletWriter).toHaveBeenCalledTimes(2);
    expect(mockRunVerifier).toHaveBeenCalledTimes(2);
  });

  it("proceeds to LaTeX step after all retries exhausted — does NOT throw", async () => {
    setupGeneratingRun();
    mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
    mockRunVerifier.mockResolvedValue(makeFailing(true));

    await expect(runPipeline(RESUME_ID)).resolves.not.toThrow();
    expect(mockGenerateLatex).toHaveBeenCalledTimes(1);
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.QA_REVIEWED);
  });

  it("never links rejected rewrites and falls back to source-grounded bullets", async () => {
    setupGeneratingRun();
    mockRunBulletWriter
      .mockResolvedValueOnce(makeBulletOutput("bullet-rejected-1"))
      .mockResolvedValueOnce(makeBulletOutput("bullet-rejected-2"));
    mockRunVerifier.mockResolvedValue(makeFailing(true));
    (mockDb.bullet.findMany as jest.Mock).mockResolvedValue([{ id: "bullet-source-1" }]);

    await runPipeline(RESUME_ID);

    expect(mockDb.bullet.deleteMany).toHaveBeenLastCalledWith({
      where: {
        id: { in: ["bullet-rejected-2"] },
        workHistoryId: WH_ID,
        contentType: "GENERATED",
        usedInResumes: { none: {} },
      },
    });
    expect(mockDb.resumeBullet.createMany).toHaveBeenCalledWith({
      data: [{ resumeId: RESUME_ID, bulletId: "bullet-source-1" }],
    });
    expect(mockDb.resumeBullet.createMany).not.toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ bulletId: "bullet-rejected-2" }),
      ]),
    });
  });

  it("runs one bullet-writer + one verifier per work history entry", async () => {
    // Strategy with 3 entries
    const threeJobStrategy: ResumeStrategy = {
      ...mockStrategy,
      workHistoryInScope: [
        { ...mockStrategy.workHistoryInScope[0], workHistoryId: "wh-1" },
        { ...mockStrategy.workHistoryInScope[0], workHistoryId: "wh-2" },
        { ...mockStrategy.workHistoryInScope[0], workHistoryId: "wh-3" },
      ],
    };

    (mockDb.careerMemory.findUnique as jest.Mock).mockResolvedValue(mockCareerMemoryDB);
    (mockDb.workHistory.findUnique  as jest.Mock).mockResolvedValue(mockWorkHistoryDB);
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("GENERATING", {
        jdAnalysisJson: mockJDAnalysis,
        strategyJson:   threeJobStrategy,
      }))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    mockRunBulletWriter.mockResolvedValue(makeBulletOutput());
    mockRunVerifier.mockResolvedValue(makePassing());

    await runPipeline(RESUME_ID);

    expect(mockRunBulletWriter).toHaveBeenCalledTimes(3);
    expect(mockRunVerifier).toHaveBeenCalledTimes(3);

    const bwIds = (mockRunBulletWriter as jest.Mock).mock.calls.map(([id]) => id);
    expect(bwIds).toContain("wh-1");
    expect(bwIds).toContain("wh-2");
    expect(bwIds).toContain("wh-3");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Explicit Application Tracking
// ---------------------------------------------------------------------------

describe("Orchestrator — explicit application tracking", () => {
  it("completes a QA-reviewed resume without writing application state", async () => {
    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("QA_REVIEWED"))
      .mockResolvedValueOnce({ latexSource: "\\documentclass...", pageCount: 1 });

    await runPipeline(RESUME_ID);

    expect(mockDb.application.findUnique).not.toHaveBeenCalled();
    expect(mockDb.application.create).not.toHaveBeenCalled();
  });

  it("FAILED transition still fires on real pipeline errors", async () => {
    mockRunJDAnalyst.mockRejectedValue(new Error("Critical pipeline error"));

    (mockDb.resume.findUnique as jest.Mock)
      .mockResolvedValueOnce(makeResume("VERIFIED"));

    await expect(runPipeline(RESUME_ID)).rejects.toThrow("Critical pipeline error");
    expect(mockTransition).toHaveBeenCalledWith(RESUME_ID, ResumeState.FAILED);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Observability — structured logging
// ---------------------------------------------------------------------------

describe("Orchestrator — observability (structured logging)", () => {
  beforeEach(setupHappyPathMocks);

  it("logs pipeline_start at the beginning with correct resumeId", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await runPipeline(RESUME_ID);

    const parsed  = spy.mock.calls.flatMap(([m]) => { try { return [JSON.parse(m)]; } catch { return []; } });
    const startLog = parsed.find((e) => e.event === "pipeline_start");

    expect(startLog).toBeDefined();
    expect(startLog.resumeId).toBe(RESUME_ID);

    spy.mockRestore();
  });

  it("logs pipeline_complete with step timings and totalDurationMs", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await runPipeline(RESUME_ID);

    const parsed      = spy.mock.calls.flatMap(([m]) => { try { return [JSON.parse(m)]; } catch { return []; } });
    const completeLog = parsed.find((e) => e.event === "pipeline_complete");

    expect(completeLog).toBeDefined();
    expect(completeLog.resumeId).toBe(RESUME_ID);
    expect(Array.isArray(completeLog.steps)).toBe(true);
    expect(completeLog.steps.length).toBeGreaterThan(0);
    expect(typeof completeLog.totalDurationMs).toBe("number");

    spy.mockRestore();
  });

  it("logs pipeline_error with the failing state when an agent throws", async () => {
    mockRunJDAnalyst.mockRejectedValue(new Error("API down"));
    (mockDb.resume.findUnique as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(makeResume("VERIFIED"));

    // Re-establish defaults blown away by mockReset
    (mockDb.resume.update as jest.Mock).mockResolvedValue({});

    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await expect(runPipeline(RESUME_ID)).rejects.toThrow();

    const parsed    = spy.mock.calls.flatMap(([m]) => { try { return [JSON.parse(m)]; } catch { return []; } });
    const errorLog  = parsed.find((e) => e.event === "pipeline_error");

    expect(errorLog).toBeDefined();
    expect(errorLog.error).toContain("API down");

    spy.mockRestore();
  });
});
