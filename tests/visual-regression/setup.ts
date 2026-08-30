// ---------------------------------------------------------------------------
// Visual Regression Test Setup
//
// Provides a helper to compare a rendered screenshot against a stored
// reference (baseline) image using pixelmatch for pixel-level diffing.
//
// Usage in tests:
//   import { compareScreenshot } from "@tests/visual-regression/setup";
//   const { passed, diffPixels, threshold } = await compareScreenshot(
//     actualBuffer,
//     "dashboard-empty-state"
//   );
//
// Baseline images are stored in:
//   tests/visual-regression/baselines/<screenName>.png
//
// To update baselines, set the environment variable UPDATE_BASELINES=true
// when running tests. This will write the actual screenshot as the new
// baseline instead of comparing.
//
// Dependencies: pixelmatch, pngjs (peer)
// Install: npm install --save-dev pixelmatch @types/pixelmatch pngjs @types/pngjs
// ---------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompareScreenshotResult {
  /** True if the pixel difference is within the acceptable threshold */
  passed: boolean;
  /** Number of pixels that differ between actual and baseline */
  diffPixels: number;
  /** Maximum allowed differing pixels for this comparison */
  threshold: number;
  /** Path to the diff image, written only when the comparison fails */
  diffImagePath?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASELINES_DIR = path.join(
  __dirname,
  "baselines"
);

const DIFFS_DIR = path.join(
  __dirname,
  "__diffs__"
);

/**
 * Maximum fraction of pixels allowed to differ before the test fails.
 * 0.001 = 0.1% of total pixels (e.g. ~830 pixels on a 1280×650 canvas).
 */
const DEFAULT_DIFF_THRESHOLD_FRACTION = 0.001;

/**
 * pixelmatch per-pixel colour-distance threshold (0–1).
 * 0.1 is a good default — it tolerates sub-pixel anti-aliasing differences
 * without being too lenient.
 */
const PIXEL_MATCH_THRESHOLD = 0.1;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadPng(filePath: string): { data: Buffer; width: number; height: number } {
  const rawData = fs.readFileSync(filePath);
  const png = PNG.sync.read(rawData);
  return { data: png.data, width: png.width, height: png.height };
}

function bufferToPng(pngBuffer: Buffer): { data: Buffer; width: number; height: number } {
  const png = PNG.sync.read(pngBuffer);
  return { data: png.data, width: png.width, height: png.height };
}

function saveDiffImage(
  diffData: Buffer,
  width: number,
  height: number,
  diffPath: string
): void {
  const diffPng = new PNG({ width, height });
  diffPng.data = diffData;
  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare an actual PNG screenshot against the stored baseline for the given
 * screen name.
 *
 * @param actual      Raw PNG bytes of the rendered screen (from a headless browser
 *                    or Playwright/Puppeteer screenshot call)
 * @param screenName  Identifier for the baseline image (e.g. "dashboard-empty-state").
 *                    The baseline file is looked up at:
 *                    tests/visual-regression/baselines/<screenName>.png
 * @param options     Optional overrides for the diff threshold
 * @returns           CompareScreenshotResult with pass/fail status and pixel count
 */
export async function compareScreenshot(
  actual: Buffer,
  screenName: string,
  options: {
    /** Override the acceptable diff fraction (default: 0.001) */
    maxDiffFraction?: number;
    /** Override the per-pixel color threshold (default: 0.1) */
    pixelThreshold?: number;
  } = {}
): Promise<CompareScreenshotResult> {
  const maxDiffFraction = options.maxDiffFraction ?? DEFAULT_DIFF_THRESHOLD_FRACTION;
  const pixelThreshold = options.pixelThreshold ?? PIXEL_MATCH_THRESHOLD;

  const baselinePath = path.join(BASELINES_DIR, `${screenName}.png`);

  // ------------------------------------------------------------------
  // Baseline update mode — write the actual as the new baseline
  // ------------------------------------------------------------------
  if (process.env.UPDATE_BASELINES === "true") {
    ensureDir(BASELINES_DIR);
    fs.writeFileSync(baselinePath, actual);
    console.log(`[visual-regression] Baseline updated: ${baselinePath}`);
    return { passed: true, diffPixels: 0, threshold: 0 };
  }

  // ------------------------------------------------------------------
  // Verify baseline exists
  // ------------------------------------------------------------------
  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Baseline image not found for "${screenName}" at: ${baselinePath}\n` +
        `Run with UPDATE_BASELINES=true to create it.`
    );
  }

  // ------------------------------------------------------------------
  // Decode both images
  // ------------------------------------------------------------------
  const actualImg = bufferToPng(actual);
  const baselineImg = loadPng(baselinePath);

  if (actualImg.width !== baselineImg.width || actualImg.height !== baselineImg.height) {
    const diffPixels = actualImg.width * actualImg.height; // consider every pixel different
    const threshold = Math.floor(actualImg.width * actualImg.height * maxDiffFraction);
    return {
      passed: false,
      diffPixels,
      threshold,
      diffImagePath: undefined,
    };
  }

  const { width, height } = actualImg;
  const totalPixels = width * height;
  const maxAllowedDiffPixels = Math.floor(totalPixels * maxDiffFraction);

  // ------------------------------------------------------------------
  // Run pixelmatch
  // ------------------------------------------------------------------
  const diffData = Buffer.alloc(width * height * 4); // RGBA

  const diffPixels = pixelmatch(
    actualImg.data,
    baselineImg.data,
    diffData,
    width,
    height,
    { threshold: pixelThreshold, includeAA: false }
  );

  const passed = diffPixels <= maxAllowedDiffPixels;

  // ------------------------------------------------------------------
  // Save diff image on failure for manual inspection
  // ------------------------------------------------------------------
  let diffImagePath: string | undefined;

  if (!passed) {
    ensureDir(DIFFS_DIR);
    diffImagePath = path.join(DIFFS_DIR, `${screenName}.diff.png`);
    saveDiffImage(diffData, width, height, diffImagePath);
    console.warn(
      `[visual-regression] FAILED "${screenName}": ${diffPixels} differing pixels ` +
        `(threshold: ${maxAllowedDiffPixels}). Diff saved to: ${diffImagePath}`
    );
  }

  return {
    passed,
    diffPixels,
    threshold: maxAllowedDiffPixels,
    ...(diffImagePath ? { diffImagePath } : {}),
  };
}

// ---------------------------------------------------------------------------
// Jest custom matcher (optional convenience)
// ---------------------------------------------------------------------------

/**
 * Extend Jest's expect with a .toPassVisualRegression() matcher.
 *
 * Usage in a test file:
 *   import "@tests/visual-regression/setup";
 *   // ... inside a test:
 *   const result = await compareScreenshot(screenshot, "my-screen");
 *   expect(result).toPassVisualRegression();
 */
expect.extend({
  toPassVisualRegression(received: CompareScreenshotResult) {
    const pass = received.passed;
    if (pass) {
      return {
        message: () =>
          `Expected visual regression to fail but it passed (diffPixels=${received.diffPixels})`,
        pass: true,
      };
    }
    return {
      message: () =>
        `Visual regression failed: ${received.diffPixels} pixels differ ` +
        `(max allowed: ${received.threshold}). ` +
        (received.diffImagePath
          ? `Diff image: ${received.diffImagePath}`
          : ""),
      pass: false,
    };
  },
});

// Augment Jest's expect typings
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toPassVisualRegression(): R;
    }
  }
}
