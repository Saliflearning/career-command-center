/** Canonical output contract for final rendered-resume visual QA. */
export type VisualCheckStatus = "passed" | "failed" | "warning";

export interface VisualCheck {
  name: string;
  status: VisualCheckStatus;
  detail: string | null;
}

export interface VisualQAResult {
  resumeId: string;
  pdfUrl: string;
  screenshotUrl: string | null;
  passed: boolean;
  checks: {
    pageCount: VisualCheck;
    noTextOverflow: VisualCheck;
    noMarginViolation: VisualCheck;
    headerRendered: VisualCheck;
    sectionBreaks: VisualCheck;
    fontConsistency: VisualCheck;
    atsLayoutSafe: VisualCheck;
    screenshotRendered: VisualCheck;
    balancedDensity: VisualCheck;
  };
  pageCountActual: number;
  estimatedAtsSafe: boolean;
  recommendedAction: "compress" | "rerender" | "surface" | null;
  referenceStandard: string;
  layoutMetrics: {
    pageWidthPt: number;
    pageHeightPt: number;
    marginsPt: { top: number; right: number; bottom: number; left: number };
    minFontSizePt: number;
    fontFamilyCount: number;
    inkCoverage: number;
    screenshotWidth: number;
    screenshotHeight: number;
  } | null;
  agentVersion: string;
  checkedAt: string;
}
