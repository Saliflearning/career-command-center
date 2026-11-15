/**
 * Deployment self-test for resume PDF rendering.
 *
 * Renders a fixed, built-in sample resume through the same dispatcher the
 * export route uses (`renderResumePdf`, so it honors RESUME_RENDER_ENGINE) and
 * runs the same visual gate (`runVisualQA`). It exists to answer one question
 * on a real deployment: does PDF rendering work in this runtime, with the
 * fonts, wasm layout engine, and native canvas that the bundle actually ships?
 *
 * It takes no input and needs no database, auth, or storage, so it can run on a
 * preview deployment that has none of the production secrets.
 */
import { runVisualQA } from "@/agents/visual-qa";
import { expectedSectionsFor } from "@/lib/resume/expected-sections";
import { renderResumePdf } from "./render-resume-pdf";
import type { StructuredResumeExportInput } from "./structured-resume-pdf";

export const RENDER_SELFTEST_FLAG = "RESUME_RENDER_SELFTEST";

/** The self-test is off unless the deployment explicitly opts in. */
export function isRenderSelfTestEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[RENDER_SELFTEST_FLAG]?.trim() === "1";
}

export type RenderEngineName = "react-pdf" | "canvas";

export interface RenderSelfTestSummary {
  ok: boolean;
  /** Engine the RESUME_RENDER_ENGINE flag selects on this deployment. */
  engineSelected: RenderEngineName;
  /** Engine that actually produced the PDF, read from the PDF itself. */
  engineDetected: RenderEngineName;
  pageCount: number;
  density: string;
  pdfBytes: number;
  gate: {
    passed: boolean;
    referenceStandard: string;
    checks: Record<string, { status: string; detail: string | null }>;
    minFontSizePt: number | null;
    marginsPt: { top: number; right: number; bottom: number; left: number } | null;
    inkCoverage: number | null;
  };
  runtime: {
    node: string;
    vercelEnv: string | null;
    region: string | null;
    branch: string | null;
    commit: string | null;
  };
  durationMs: number;
}

export interface RenderSelfTestResult {
  summary: RenderSelfTestSummary;
  pdf: Buffer;
  screenshot: Buffer;
}

/** Fixed sample resume. Synthetic data only; never derived from a request. */
export function renderSelfTestFixture(): StructuredResumeExportInput {
  return {
    targetRole: "Operations Manager",
    targetCompany: null,
    roleType: "OPERATIONS",
    headline: "Operations leader focused on throughput, safety, and cost",
    candidate: {
      name: "Jordan Rivera",
      email: "jordan.rivera@example.com",
      phone: "(555) 555-0142",
      linkedin: "linkedin.com/in/jordan-rivera",
      location: "Indianapolis, IN",
      website: null,
    },
    summary:
      "Operations professional with nine years leading distribution and fulfillment teams, improving throughput and safety while reducing operating cost across high-volume sites.",
    jobs: [
      {
        id: "1",
        title: "Operations Manager",
        company: "Midwest Distribution Co",
        location: "Indianapolis, IN",
        startDate: "2020-02-01",
        endDate: null,
        current: true,
        sortOrder: 0,
        bullets: [
          "Led a cross-functional team of 48 associates across two shifts, lifting on-time throughput 22% in eighteen months.",
          "Reduced controllable operating cost 14% by renegotiating carrier terms and reworking the pick-path layout.",
          "Cut recordable safety incidents 30% through a daily audit routine and refreshed associate onboarding.",
        ],
      },
      {
        id: "2",
        title: "Shift Supervisor",
        company: "Regional Logistics Group",
        location: "Columbus, OH",
        startDate: "2016-06-01",
        endDate: "2020-01-01",
        current: false,
        sortOrder: 1,
        bullets: [
          "Supervised a 20-person night shift, consistently meeting a 99.3% order-accuracy target.",
          "Trained and mentored six associates who were later promoted into lead roles.",
        ],
      },
    ],
    skills: [
      { name: "Team Leadership", category: "Core Skills" },
      { name: "Process Improvement", category: "Core Skills" },
      { name: "KPI Reporting", category: "Core Skills" },
      { name: "Scheduling", category: "Core Skills" },
      { name: "Vendor Management", category: "Core Skills" },
    ],
    education: [
      {
        degree: "B.S. Business Administration",
        institution: "State University",
        graduationDate: "2016-05-01",
        inProgress: false,
      },
    ],
    certifications: [{ name: "Lean Six Sigma Green Belt", issuingBody: null, issueDate: null }],
  };
}

function selectedEngine(env: Record<string, string | undefined>): RenderEngineName {
  return env.RESUME_RENDER_ENGINE?.trim() === "react-pdf" ? "react-pdf" : "canvas";
}

// The react-pdf engine embeds the Source families; the legacy engine uses the
// PDF base fonts. Reading this from the bytes proves which engine really ran.
function detectEngine(pdf: Buffer): RenderEngineName {
  const bytes = pdf.toString("latin1");
  return bytes.includes("SourceSans3") || bytes.includes("SourceSerif4") ? "react-pdf" : "canvas";
}

export async function runRenderSelfTest(
  env: Record<string, string | undefined> = process.env
): Promise<RenderSelfTestResult> {
  const startedAt = Date.now();
  const input = renderSelfTestFixture();
  const rendered = await renderResumePdf(input);
  const { result, screenshot } = await runVisualQA("render-selftest", "", rendered.pdf, {
    roleType: input.roleType,
    candidateName: input.candidate.name,
    expectedSections: expectedSectionsFor(input),
  });

  const engineSelected = selectedEngine(env);
  const engineDetected = detectEngine(rendered.pdf);
  const checks: RenderSelfTestSummary["gate"]["checks"] = {};
  for (const [name, check] of Object.entries(result.checks)) {
    checks[name] = { status: check.status, detail: check.detail };
  }

  const summary: RenderSelfTestSummary = {
    ok: result.passed && rendered.pageCount === 1 && engineDetected === engineSelected,
    engineSelected,
    engineDetected,
    pageCount: rendered.pageCount,
    density: rendered.density,
    pdfBytes: rendered.pdf.length,
    gate: {
      passed: result.passed,
      referenceStandard: result.referenceStandard,
      checks,
      minFontSizePt: result.layoutMetrics?.minFontSizePt ?? null,
      marginsPt: result.layoutMetrics?.marginsPt ?? null,
      inkCoverage: result.layoutMetrics?.inkCoverage ?? null,
    },
    runtime: {
      node: process.version,
      vercelEnv: env.VERCEL_ENV ?? null,
      region: env.VERCEL_REGION ?? null,
      branch: env.VERCEL_GIT_COMMIT_REF ?? null,
      commit: env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    durationMs: Date.now() - startedAt,
  };

  return { summary, pdf: rendered.pdf, screenshot };
}
