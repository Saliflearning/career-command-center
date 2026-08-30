// ---------------------------------------------------------------------------
// Compression Agent
//
// Enforces the one-page resume limit by progressively applying LaTeX
// compression techniques in strict priority order.
//
// Compression order (per spec — do NOT reorder):
//   1. \enlargethispage  — gains ~2–3 lines with no visual loss
//   2. Reduce \vspace    — shrink vertical gaps
//   3. Reduce \itemsep   — tighten list item spacing
//   4. Tighten margins   — reduce geometry margins
//   5. Shorten bullets   — AI rewrites verbose bullets (tier1)
//   6. Remove lower-priority bullet — drop the least-impactful bullet
//
// Hard constraints:
//   - Never touch locked bullets or locked sections
//   - Never reduce font size below 10pt
//
// Token budget: tier1, maxTokens from router default (1024)
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";
import { db } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// LaTeX manipulation helpers
// ---------------------------------------------------------------------------

/**
 * Step 1: Append \enlargethispage to gain a couple of extra lines at the
 * bottom of the page. Applied once; safe because it does not reflow content.
 */
function applyEnlargeThisPage(latex: string): string {
  if (latex.includes("\\enlargethispage")) return latex; // already applied
  // Insert before \end{document}
  return latex.replace(
    /\\end\{document\}/,
    "\\enlargethispage{3\\baselineskip}\n\\end{document}"
  );
}

/**
 * Step 2: Reduce \vspace{...} values by a fixed percentage.
 */
function reduceVspace(latex: string, reductionFactor = 0.5): string {
  return latex.replace(
    /\\vspace\{([-\d.]+)(pt|mm|cm|em|ex|in|bp|pc|dd|cc|sp)\}/g,
    (_match, value, unit) => {
      const reduced = (parseFloat(value) * reductionFactor).toFixed(2);
      return `\\vspace{${reduced}${unit}}`;
    }
  );
}

/**
 * Step 3: Reduce \itemsep and \parsep in itemize/enumerate environments.
 */
function reduceItemsep(latex: string): string {
  // Replace \setlength{\itemsep}{...} with a tighter value
  let result = latex.replace(
    /\\setlength\{\\itemsep\}\{([-\d.]+)(pt|mm|em)\}/g,
    (_match, _value, unit) => `\\setlength{\\itemsep}{1${unit}}`
  );
  // Also tighten \topsep and \parsep if present
  result = result.replace(
    /\\setlength\{\\topsep\}\{([-\d.]+)(pt|mm|em)\}/g,
    (_match, _value, unit) => `\\setlength{\\topsep}{1${unit}}`
  );
  result = result.replace(
    /\\setlength\{\\parsep\}\{([-\d.]+)(pt|mm|em)\}/g,
    (_match, _value, unit) => `\\setlength{\\parsep}{0${unit}}`
  );
  return result;
}

/**
 * Step 4: Tighten geometry margins.
 * Only reduces margins that are currently wider than MIN_MARGIN_CM.
 */
const MIN_MARGIN_CM = 1.0;

function tightenMargins(latex: string): string {
  return latex.replace(
    /\\usepackage\[([^\]]*)\]\{geometry\}/,
    (_match, args) => {
      const tightened = args.replace(
        /(top|bottom|left|right|margin)\s*=\s*([\d.]+)(cm|in|mm|pt)/g,
        (_m: string, side: string, value: string, unit: string) => {
          // Convert to cm for comparison
          const valueCm =
            unit === "in" ? parseFloat(value) * 2.54 :
            unit === "mm" ? parseFloat(value) / 10 :
            unit === "pt" ? parseFloat(value) / 28.35 :
            parseFloat(value);
          if (valueCm > MIN_MARGIN_CM) {
            const newCm = Math.max(MIN_MARGIN_CM, valueCm - 0.25).toFixed(2);
            return `${side}=${newCm}cm`;
          }
          return _m;
        }
      );
      return `\\usepackage[${tightened}]{geometry}`;
    }
  );
}

/**
 * Extract all non-locked \item lines from the LaTeX source.
 */
function extractItemLines(latex: string): Array<{ line: string; idx: number }> {
  const lines = latex.split("\n");
  const items: Array<{ line: string; idx: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim().startsWith("\\item") && !l.includes("%LOCKED")) {
      items.push({ line: l, idx: i });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// AI-assisted steps
// ---------------------------------------------------------------------------

const SHORTEN_SYSTEM = `You are a concise resume editor. You will receive a list of resume bullet points.
Shorten each bullet by 10–20% without losing factual accuracy or quantitative metrics.
Rules:
- Preserve all numbers, percentages, and named technologies
- Remove filler words and redundant phrases
- Keep action verb as the first word
- Do NOT use em dashes
- Return a JSON array of shortened strings in the same order as the input
Output only the JSON array.`;

async function shortenBullets(items: string[]): Promise<string[]> {
  if (items.length === 0) return [];

  const result = await route({
    tier: "tier1",
    agent: "compression",
    systemPrompt: SHORTEN_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Shorten these bullets:\n${JSON.stringify(items, null, 2)}`,
      },
    ],
    maxTokens: 1024,
  });

  try {
    const cleaned = result.content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    const shortened = JSON.parse(cleaned) as string[];
    // Guard: return original if length mismatch
    if (shortened.length !== items.length) return items;
    return shortened;
  } catch {
    return items;
  }
}

// ---------------------------------------------------------------------------
// runCompression
// ---------------------------------------------------------------------------

/**
 * Apply progressive LaTeX compression to fit resume within one page.
 *
 * @param resumeId    - Resume ID (for logging and locked-bullet lookup)
 * @param latexSource - Current LaTeX source string
 * @param pageCount   - Current page count (compression runs only if > 1)
 * @returns Compressed LaTeX source
 */
export async function runCompression(
  resumeId: string,
  latexSource: string,
  pageCount: number
): Promise<string> {
  console.log(
    JSON.stringify({
      event: "compression_start",
      resumeId,
      pageCount,
      latexLength: latexSource.length,
      timestamp: new Date().toISOString(),
    })
  );

  if (pageCount <= 1) {
    return latexSource; // Nothing to do
  }

  let latex = latexSource;
  const stepsApplied: string[] = [];

  // ------------------------------------------------------------------
  // Step 1: \enlargethispage
  // ------------------------------------------------------------------
  latex = applyEnlargeThisPage(latex);
  stepsApplied.push("enlargethispage");

  // ------------------------------------------------------------------
  // Step 2: Reduce \vspace
  // ------------------------------------------------------------------
  latex = reduceVspace(latex);
  stepsApplied.push("reduce_vspace");

  // ------------------------------------------------------------------
  // Step 3: Reduce \itemsep
  // ------------------------------------------------------------------
  latex = reduceItemsep(latex);
  stepsApplied.push("reduce_itemsep");

  // ------------------------------------------------------------------
  // Step 4: Tighten margins (never below 1 cm / 10pt font floor enforced
  //         via geometry — font size is not touched here)
  // ------------------------------------------------------------------
  latex = tightenMargins(latex);
  stepsApplied.push("tighten_margins");

  // ------------------------------------------------------------------
  // Step 5: Shorten bullets via AI (skip locked bullets)
  // ------------------------------------------------------------------
  // Identify locked bullet IDs for this resume
  const lockedBullets = await db.bullet.findMany({
    where: {
      locked: true,
      usedInResumes: { some: { resumeId } },
    },
    select: { content: true },
  });
  const lockedContents = new Set(lockedBullets.map((b: { content: string }) => b.content));

  const itemLines = extractItemLines(latex);
  const shortenableItems = itemLines.filter(
    ({ line }) => !lockedContents.has(line.replace(/^\s*\\item\s*/, "").trim())
  );

  if (shortenableItems.length > 0) {
    const original = shortenableItems.map(({ line }) =>
      line.replace(/^\s*\\item\s*/, "").trim()
    );
    const shortened = await shortenBullets(original);

    const lines = latex.split("\n");
    for (let i = 0; i < shortenableItems.length; i++) {
      const { idx } = shortenableItems[i];
      const indent = lines[idx].match(/^(\s*)/)![1];
      lines[idx] = `${indent}\\item ${shortened[i]}`;
    }
    latex = lines.join("\n");
    stepsApplied.push("shorten_bullets");
  }

  // ------------------------------------------------------------------
  // Step 6: Remove lowest-priority non-locked bullet
  //         Only applied as a last resort (pageCount still > 1 assumed
  //         if we reach here without a re-render; we remove one bullet)
  // ------------------------------------------------------------------
  const remainingItems = extractItemLines(latex);
  if (remainingItems.length > 0) {
    // Remove the last non-locked \item in the document
    const toRemove = remainingItems[remainingItems.length - 1];
    const lines = latex.split("\n");
    lines.splice(toRemove.idx, 1);
    latex = lines.join("\n");
    stepsApplied.push("remove_lowest_priority_bullet");
  }

  console.log(
    JSON.stringify({
      event: "compression_complete",
      resumeId,
      stepsApplied,
      latexLength: latex.length,
      timestamp: new Date().toISOString(),
    })
  );

  return latex;
}
