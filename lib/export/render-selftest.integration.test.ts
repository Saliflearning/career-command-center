/**
 * Runs the deployment self-test against the real render + extraction runtime,
 * for both engines. This is the same code path GET /api/internal/render-check
 * executes on a deployment.
 */
import { runRenderSelfTest } from "./render-selftest";

const ENGINE = "RESUME_RENDER_ENGINE";
let previousEngine: string | undefined;

beforeAll(async () => {
  previousEngine = process.env[ENGINE];
  // Warm the dynamically imported PDF.js / canvas runtime once, so no first-time
  // import can resolve after the jest environment is torn down.
  delete process.env[ENGINE];
  await runRenderSelfTest();
}, 60000);

afterAll(() => {
  if (previousEngine === undefined) delete process.env[ENGINE];
  else process.env[ENGINE] = previousEngine;
});

describe("deployment render self-test", () => {
  it("passes on the react-pdf engine when the flag selects it", async () => {
    process.env[ENGINE] = "react-pdf";
    const { summary, pdf, screenshot } = await runRenderSelfTest();

    expect(summary.engineSelected).toBe("react-pdf");
    expect(summary.engineDetected).toBe("react-pdf");
    expect(summary.pageCount).toBe(1);
    expect(summary.gate.passed).toBe(true);
    expect(summary.gate.minFontSizePt ?? 0).toBeGreaterThanOrEqual(9);
    expect(summary.ok).toBe(true);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(screenshot.length).toBeGreaterThan(0);
  }, 45000);

  it("passes on the legacy engine when the flag is unset", async () => {
    delete process.env[ENGINE];
    const { summary } = await runRenderSelfTest();

    expect(summary.engineSelected).toBe("canvas");
    expect(summary.engineDetected).toBe("canvas");
    expect(summary.gate.passed).toBe(true);
    expect(summary.ok).toBe(true);
  }, 45000);
});
