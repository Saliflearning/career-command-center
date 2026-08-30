import { extractTextItems, renderPageAsImage } from "unpdf";
import type { StructuredTextItem } from "unpdf";
import type { ResumeRoleType } from "@/lib/export/structured-resume-pdf";
import type {
  VisualQAResult,
  VisualCheck,
  VisualCheckStatus,
} from "@/lib/types";

const PAGE_WIDTH_PT = 612;
const PAGE_HEIGHT_PT = 792;
const SCREENSHOT_SCALE = 1.5;
const AGENT_VERSION = "visual-qa@3.0.0";

export interface VisualQAOptions {
  roleType?: ResumeRoleType;
  candidateName?: string | null;
  expectedSections?: string[];
}

export interface VisualQAOutput {
  result: VisualQAResult;
  screenshot: Buffer;
}

interface VisualStandard {
  id: string;
  minPages: number;
  maxPages: number;
  minMarginPt: number;
  minFontSizePt: number;
  minInkCoverage: number;
  maxInkCoverage: number;
}

interface ScreenshotMetrics {
  width: number;
  height: number;
  inkCoverage: number;
  inkBounds: { top: number; right: number; bottom: number; left: number } | null;
}

/**
 * Render and inspect the exact PDF presented to the user.
 * Runtime checks use geometry rather than strict pixel equality, so different
 * truthful content can satisfy the same approved visual standard.
 */
export async function runVisualQA(
  resumeId: string,
  pdfUrl: string,
  pdfBuffer: Buffer,
  options: VisualQAOptions = {}
): Promise<VisualQAOutput> {
  const checkedAt = new Date().toISOString();
  const standard = visualStandardFor(options.roleType ?? null);

  let screenshot: Buffer;
  let screenshotMetrics: ScreenshotMetrics;
  let extracted: Awaited<ReturnType<typeof extractTextItems>>;

  try {
    extracted = await extractTextItems(new Uint8Array(pdfBuffer));
    screenshot = Buffer.from(
      await renderPageAsImage(new Uint8Array(pdfBuffer), 1, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: SCREENSHOT_SCALE,
      })
    );
    screenshotMetrics = await inspectScreenshot(screenshot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return failedRenderResult(resumeId, pdfUrl, standard.id, checkedAt, detail);
  }

  const textItems = extracted.items.flat().filter(hasVisibleText);
  const text = normalize(textItems.map((item) => item.str).join(" "));
  const pageCountPassed =
    extracted.totalPages >= standard.minPages && extracted.totalPages <= standard.maxPages;
  const geometry = inspectTextGeometry(textItems);
  const marginViolations = marginViolationsFor(geometry.margins, standard.minMarginPt);
  const overflowItems = textItems.filter(isOutsidePage);
  const minFontSize = textItems.length > 0
    ? Math.min(...textItems.map((item) => item.fontSize))
    : 0;
  const fontFamilies = new Set(textItems.map((item) => item.fontFamily).filter(Boolean));
  const candidateName = normalize(options.candidateName ?? "");
  const headerItems = textItems.filter((item) => item.y >= PAGE_HEIGHT_PT * 0.78);
  const headerRendered = candidateName
    ? text.includes(candidateName)
    : headerItems.some((item) => item.fontSize >= 14);
  const missingSections = (options.expectedSections ?? []).filter(
    (section) => !text.includes(normalize(section))
  );
  const screenshotAtEdge = screenshotTouchesEdge(screenshotMetrics);
  const densityPassed =
    screenshotMetrics.inkCoverage >= standard.minInkCoverage &&
    screenshotMetrics.inkCoverage <= standard.maxInkCoverage;

  const checks: VisualQAResult["checks"] = {
    pageCount: pageCountPassed
      ? makeCheck("passed")
      : makeCheck(
          "failed",
          `Rendered ${extracted.totalPages} page(s); ${standard.id} allows ${standard.minPages}-${standard.maxPages}`
        ),
    noTextOverflow:
      overflowItems.length === 0 && !screenshotAtEdge
        ? makeCheck("passed")
        : makeCheck(
            "failed",
            `${overflowItems.length} text item(s) or rendered pixels touch the page boundary`
          ),
    noMarginViolation:
      marginViolations.length === 0
        ? makeCheck("passed")
        : makeCheck("failed", `Minimum margin violation: ${marginViolations.join(", ")}`),
    headerRendered: headerRendered
      ? makeCheck("passed")
      : makeCheck("failed", "Candidate identity was not found in the header zone"),
    sectionBreaks:
      missingSections.length === 0
        ? makeCheck("passed")
        : makeCheck("failed", `Missing rendered section(s): ${missingSections.join(", ")}`),
    fontConsistency:
      minFontSize >= standard.minFontSizePt && fontFamilies.size <= 4
        ? makeCheck("passed")
        : makeCheck(
            "failed",
            `Minimum font ${minFontSize.toFixed(1)}pt; ${fontFamilies.size} font families detected`
          ),
    atsLayoutSafe:
      overflowItems.length === 0 && geometry.columns <= 1
        ? makeCheck("passed", "Single-column structured renderer with searchable text")
        : makeCheck("failed", "Rendered geometry is not a safe single-column text layout"),
    screenshotRendered: makeCheck(
      "passed",
      `${screenshotMetrics.width}x${screenshotMetrics.height} PNG captured from final PDF`
    ),
    balancedDensity: densityPassed
      ? makeCheck("passed", `${percent(screenshotMetrics.inkCoverage)} page ink coverage`)
      : makeCheck(
          "warning",
          `${percent(screenshotMetrics.inkCoverage)} page ink coverage is outside the ${percent(standard.minInkCoverage)}-${percent(standard.maxInkCoverage)} reference range`
        ),
  };

  const blockingChecks = [
    checks.pageCount,
    checks.noTextOverflow,
    checks.noMarginViolation,
    checks.headerRendered,
    checks.sectionBreaks,
    checks.fontConsistency,
    checks.atsLayoutSafe,
    checks.screenshotRendered,
  ];
  const passed = blockingChecks.every((check) => check.status === "passed");

  const result: VisualQAResult = {
    resumeId,
    pdfUrl,
    screenshotUrl: null,
    passed,
    checks,
    pageCountActual: extracted.totalPages,
    estimatedAtsSafe: checks.atsLayoutSafe.status === "passed",
    recommendedAction: recommendAction(checks),
    referenceStandard: standard.id,
    layoutMetrics: {
      pageWidthPt: PAGE_WIDTH_PT,
      pageHeightPt: PAGE_HEIGHT_PT,
      marginsPt: geometry.margins,
      minFontSizePt: minFontSize,
      fontFamilyCount: fontFamilies.size,
      inkCoverage: screenshotMetrics.inkCoverage,
      screenshotWidth: screenshotMetrics.width,
      screenshotHeight: screenshotMetrics.height,
    },
    agentVersion: AGENT_VERSION,
    checkedAt,
  };

  console.log(JSON.stringify({
    event: "visual_qa_result",
    resumeId,
    passed,
    referenceStandard: standard.id,
    pageCount: extracted.totalPages,
    inkCoverage: screenshotMetrics.inkCoverage,
    timestamp: checkedAt,
  }));

  return { result, screenshot };
}

function failedRenderResult(
  resumeId: string,
  pdfUrl: string,
  referenceStandard: string,
  checkedAt: string,
  detail: string
): VisualQAOutput {
  const failed = makeCheck("failed", `PDF screenshot rendering failed: ${detail}`);
  const warning = makeCheck("warning", "PDF inspection did not complete");
  return {
    screenshot: Buffer.alloc(0),
    result: {
      resumeId,
      pdfUrl,
      screenshotUrl: null,
      passed: false,
      checks: {
        pageCount: warning,
        noTextOverflow: warning,
        noMarginViolation: warning,
        headerRendered: warning,
        sectionBreaks: warning,
        fontConsistency: warning,
        atsLayoutSafe: warning,
        screenshotRendered: failed,
        balancedDensity: makeCheck("warning", "Screenshot metrics unavailable"),
      },
      pageCountActual: 0,
      estimatedAtsSafe: false,
      recommendedAction: "surface",
      referenceStandard,
      layoutMetrics: null,
      agentVersion: AGENT_VERSION,
      checkedAt,
    },
  };
}

function visualStandardFor(roleType: ResumeRoleType): VisualStandard {
  const allowsTwoPages = roleType === "ACADEMIC" || roleType === "FEDERAL";
  return {
    id: allowsTwoPages ? "documented-detail-v1" : "private-sector-one-page-v1",
    minPages: 1,
    maxPages: allowsTwoPages ? 2 : 1,
    minMarginPt: 36,
    minFontSizePt: 9,
    minInkCoverage: 0.018,
    maxInkCoverage: 0.28,
  };
}

function inspectTextGeometry(items: StructuredTextItem[]) {
  const left = items.length > 0 ? Math.min(...items.map((item) => item.x)) : 0;
  const rightEdge = items.length > 0
    ? Math.max(...items.map((item) => item.x + item.width))
    : PAGE_WIDTH_PT;
  const bottom = items.length > 0 ? Math.min(...items.map((item) => item.y)) : 0;
  const topEdge = items.length > 0
    ? Math.max(...items.map((item) => item.y + item.height))
    : PAGE_HEIGHT_PT;

  return {
    margins: {
      top: Math.max(0, PAGE_HEIGHT_PT - topEdge),
      right: Math.max(0, PAGE_WIDTH_PT - rightEdge),
      bottom: Math.max(0, bottom),
      left: Math.max(0, left),
    },
    columns: estimateColumnCount(items),
  };
}

async function inspectScreenshot(png: Buffer): Promise<ScreenshotMetrics> {
  const canvasModule = await import("@napi-rs/canvas");
  const image = await canvasModule.loadImage(png);
  const canvas = canvasModule.createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, image.width, image.height);
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;

  let ink = 0;
  let left = image.width;
  let right = -1;
  let top = image.height;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = pixels[offset + 3];
      const brightness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      if (alpha > 16 && brightness < 242) {
        ink += 1;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return {
    width: image.width,
    height: image.height,
    inkCoverage: ink / Math.max(1, image.width * image.height),
    inkBounds: ink > 0 ? { top, right, bottom, left } : null,
  };
}

function estimateColumnCount(items: StructuredTextItem[]) {
  const bodyItems = items.filter((item) => item.y < PAGE_HEIGHT_PT * 0.78);
  // Short right-aligned metadata such as employment and education dates is a
  // normal part of an ATS-safe single-column resume. Only count substantial
  // right-side text blocks as evidence of a second content column.
  const rightColumnItems = bodyItems.filter(
    (item) => item.x > PAGE_WIDTH_PT * 0.56 && item.width >= 120
  );
  const leftColumnItems = bodyItems.filter((item) => item.x < PAGE_WIDTH_PT * 0.44);
  const overlappingRows = rightColumnItems.filter((right) =>
    leftColumnItems.some((left) => Math.abs(left.y - right.y) < 2 && left.width > 120)
  );
  return overlappingRows.length >= 4 ? 2 : 1;
}

function screenshotTouchesEdge(metrics: ScreenshotMetrics) {
  if (!metrics.inkBounds) return true;
  const edge = Math.max(3, Math.round(metrics.width * 0.004));
  return (
    metrics.inkBounds.left <= edge ||
    metrics.inkBounds.top <= edge ||
    metrics.width - metrics.inkBounds.right <= edge ||
    metrics.height - metrics.inkBounds.bottom <= edge
  );
}

function marginViolationsFor(
  margins: { top: number; right: number; bottom: number; left: number },
  minimum: number
) {
  return (Object.entries(margins) as Array<[keyof typeof margins, number]>)
    .filter(([, value]) => value < minimum)
    .map(([side, value]) => `${side} ${value.toFixed(1)}pt`);
}

function isOutsidePage(item: StructuredTextItem) {
  const tolerance = 0.5;
  return (
    item.x < -tolerance ||
    item.y < -tolerance ||
    item.x + item.width > PAGE_WIDTH_PT + tolerance ||
    item.y + item.height > PAGE_HEIGHT_PT + tolerance
  );
}

function hasVisibleText(item: StructuredTextItem) {
  return item.str.trim().length > 0;
}

function recommendAction(
  checks: VisualQAResult["checks"]
): VisualQAResult["recommendedAction"] {
  if (checks.pageCount.status === "failed") return "compress";
  if (
    checks.noTextOverflow.status === "failed" ||
    checks.noMarginViolation.status === "failed"
  ) return "rerender";
  if (
    checks.headerRendered.status === "failed" ||
    checks.sectionBreaks.status === "failed" ||
    checks.fontConsistency.status === "failed" ||
    checks.screenshotRendered.status === "failed"
  ) return "surface";
  return null;
}

function makeCheck(
  status: VisualCheckStatus,
  detail: string | null = null
): VisualCheck {
  return {
    name: status === "passed" ? "ok" : status === "warning" ? "warning" : "fail",
    status,
    detail,
  };
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
