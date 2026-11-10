/**
 * Flag-on integration regression for the react-pdf engine.
 *
 * The direct renderer tests only check page count; the existing route/QA tests
 * mock the legacy renderer. Neither exercises the real production path: render
 * through the dispatcher (`renderResumePdf` with RESUME_RENDER_ENGINE=react-pdf)
 * and run the exact `runVisualQA` gate the generation pipeline enforces.
 *
 * This guards the three contract failures found in review:
 *   1. the output must PASS runVisualQA (letter-spaced headings and sub-9pt
 *      fonts previously failed sectionBreaks / fontConsistency),
 *   2. saved editor presentation (font / scale) must change the output,
 *   3. experience bullet markers must be drawn, not a missing symbol glyph.
 */
import os from "os";
import path from "path";
import fs from "fs";
import { extractTextItems } from "unpdf";
import { renderResumePdf } from "./render-resume-pdf";
import { runVisualQA } from "@/agents/visual-qa";
import type { StructuredResumeExportInput } from "./structured-resume-pdf";
import type { ResumePresentation } from "@/lib/resume/presentation";

const ENGINE = "RESUME_RENDER_ENGINE";
let previousEngine: string | undefined;
beforeAll(async () => {
  previousEngine = process.env[ENGINE];
  process.env[ENGINE] = "react-pdf";
  // Warm the real render + extraction + rasterization runtime once. unpdf
  // (PDF.js) and @napi-rs/canvas load via dynamic import on first use; doing it
  // here means no first-time import inside a test can resolve after the jest
  // environment is torn down ("require after teardown" flakiness).
  const warm = await renderResumePdf(shortResume());
  await runVisualQA("warmup", "mem://warmup.pdf", warm.pdf, {
    roleType: "OPERATIONS",
    candidateName: "Jordan Rivera",
    expectedSections: [],
  });
}, 60000);
afterAll(() => {
  if (previousEngine === undefined) delete process.env[ENGINE];
  else process.env[ENGINE] = previousEngine;
});

// Mirror lib/resume/visual-quality-gate.ts expectedSectionsFor without importing
// that module (it pulls in the db/storage adapters).
function expectedSectionsFor(input: StructuredResumeExportInput): string[] {
  const sections: string[] = [];
  if (input.summary) sections.push("Professional Summary");
  if (input.skills.length > 0) {
    sections.push(
      input.roleType === "TECHNICAL" || input.roleType === "DATA" ? "Technical Skills" : "Core Skills"
    );
  }
  if (input.jobs.length > 0) sections.push("Professional Experience");
  if (input.education.length > 0) sections.push("Education");
  if (input.certifications.length > 0) sections.push("Certifications");
  return sections;
}

function fullResume(presentation?: ResumePresentation): StructuredResumeExportInput {
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
        id: "1", title: "Operations Manager", company: "Midwest Distribution Co",
        location: "Indianapolis, IN", startDate: "2020-02-01", endDate: null, current: true, sortOrder: 0,
        bullets: [
          "Led a cross-functional team of 48 associates across two shifts, lifting on-time throughput 22% in eighteen months.",
          "Reduced controllable operating cost 14% by renegotiating carrier terms and reworking the pick-path layout.",
          "Cut recordable safety incidents 30% through a daily audit routine and refreshed associate onboarding.",
        ],
      },
      {
        id: "2", title: "Shift Supervisor", company: "Regional Logistics Group",
        location: "Columbus, OH", startDate: "2016-06-01", endDate: "2020-01-01", current: false, sortOrder: 1,
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
      { degree: "B.S. Business Administration", institution: "State University", graduationDate: "2016-05-01", inProgress: false },
    ],
    certifications: [
      { name: "Lean Six Sigma Green Belt", issuingBody: null, issueDate: null },
    ],
    ...(presentation ? { presentation } : {}),
  };
}

function shortResume(presentation?: ResumePresentation): StructuredResumeExportInput {
  const base = fullResume(presentation);
  return {
    ...base,
    summary: "Operations professional with a track record of measurable throughput and safety gains.",
    jobs: [base.jobs[0]],
    skills: base.skills.slice(0, 3),
    certifications: [],
  };
}

// A dense resume that forces the renderer down to its tightest rung. This is
// where the gate's margin and font-size floors are most at risk, and where the
// legacy renderer still produces a passing one-page result, so the new engine
// must too (no capacity regression).
function heavyResume(): StructuredResumeExportInput {
  const bullet = (n: number) =>
    `Directed cross-functional initiative ${n} spanning multiple departments, coordinating stakeholders and reducing operational cost while maintaining safety and quality across a high-volume distribution network.`;
  const job = (i: number, bullets: number) => ({
    id: String(i), title: `Senior Operations Manager ${i}`, company: `Global Logistics Company ${i}`,
    location: "Indianapolis, IN", startDate: "2015-01-01", endDate: "2020-01-01", current: false, sortOrder: i,
    bullets: Array.from({ length: bullets }, (_, b) => bullet(b + 1)),
  });
  return {
    ...fullResume(),
    jobs: [job(0, 4), job(1, 4), job(2, 3), job(3, 3)],
    skills: Array.from({ length: 16 }, (_, i) => ({ name: `Skill ${i + 1} Name`, category: i < 8 ? "Leadership" : "Operations" })),
  };
}

function visibleItems(pdf: Buffer) {
  return extractTextItems(new Uint8Array(pdf)).then((e) =>
    e.items.flat().filter((i) => i.str.trim().length > 0)
  );
}

describe("react-pdf engine passes the production visual gate (flag on)", () => {
  const outDir = path.join(os.tmpdir(), "rpr-visual-gate");
  beforeAll(() => { try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* ignore */ } });

  it("renders through renderResumePdf and runVisualQA reports passed", async () => {
    const input = fullResume();
    const rendered = await renderResumePdf(input);
    expect(rendered.pageCount).toBe(1);

    const { result, screenshot } = await runVisualQA(
      "gate-test",
      "mem://final-preview.pdf",
      rendered.pdf,
      {
        roleType: input.roleType,
        candidateName: input.candidate.name,
        expectedSections: expectedSectionsFor(input),
      }
    );
    try {
      fs.writeFileSync(path.join(outDir, "full.pdf"), rendered.pdf);
      if (screenshot.length) fs.writeFileSync(path.join(outDir, "full.png"), screenshot);
    } catch { /* ignore */ }

    // The two checks review flagged, called out explicitly for a clear failure.
    expect(result.checks.sectionBreaks.status).toBe("passed");
    expect(result.checks.fontConsistency.status).toBe("passed");
    expect(result.checks.noMarginViolation.status).toBe("passed");
    expect(result.checks.headerRendered.status).toBe("passed");
    expect(result.passed).toBe(true);
    expect(result.layoutMetrics?.minFontSizePt ?? 0).toBeGreaterThanOrEqual(9);
  }, 45000);

  it("honors saved presentation: font + scale change the output, both pass the gate", async () => {
    const compactSans = shortResume({ font: "sans", scale: "compact", density: "tight" });
    const largeSerif = shortResume({ font: "serif", scale: "large", density: "open" });

    const a = await renderResumePdf(compactSans);
    const b = await renderResumePdf(largeSerif);

    // Font honored: the serif render embeds the serif body face and never the
    // sans face; the sans render embeds the sans face. (Checked on the PDF bytes
    // so it does not depend on the extractor's font naming.)
    const aBytes = a.pdf.toString("latin1");
    const bBytes = b.pdf.toString("latin1");
    expect(aBytes.includes("SourceSans3")).toBe(true);
    expect(bBytes.includes("SourceSerif4")).toBe(true);
    expect(bBytes.includes("SourceSans3")).toBe(false);

    // Scale honored: the large render's biggest type is larger than compact's.
    const aItems = await visibleItems(a.pdf);
    const bItems = await visibleItems(b.pdf);
    const aMax = Math.max(...aItems.map((i) => i.fontSize));
    const bMax = Math.max(...bItems.map((i) => i.fontSize));
    expect(bMax).toBeGreaterThan(aMax + 1);

    // Both still clear the gate.
    for (const [input, rendered] of [[compactSans, a], [largeSerif, b]] as const) {
      const { result } = await runVisualQA("gate-pres", "mem://p.pdf", rendered.pdf, {
        roleType: input.roleType,
        candidateName: input.candidate.name,
        expectedSections: expectedSectionsFor(input),
      });
      expect(result.passed).toBe(true);
    }
  }, 60000);

  it("draws bullet markers instead of a symbol glyph (no missing-glyph char, bullet text intact)", async () => {
    const input = fullResume();
    const rendered = await renderResumePdf(input);
    const items = await visibleItems(rendered.pdf);
    const text = items.map((i) => i.str).join(" ").replace(/\s+/g, " ");

    // No reliance on a symbol glyph that fonts may not cover.
    expect(text).not.toContain("▪"); // ▪
    expect(text).not.toContain("●"); // ●
    expect(text).not.toContain("•"); // •
    // The bullet CONTENT is present and extractable (ATS-safe).
    expect(text).toContain("Led a cross-functional team of 48 associates");
    expect(text).toContain("Reduced controllable operating cost 14%");
  }, 45000);

  it("a dense resume still fits one page AND passes the gate at the tightest rung", async () => {
    const input = heavyResume();
    const rendered = await renderResumePdf(input);
    expect(rendered.pageCount).toBe(1);

    const { result, screenshot } = await runVisualQA("gate-dense", "mem://dense.pdf", rendered.pdf, {
      roleType: input.roleType,
      candidateName: input.candidate.name,
      expectedSections: expectedSectionsFor(input),
    });
    try {
      fs.writeFileSync(path.join(outDir, "dense.pdf"), rendered.pdf);
      if (screenshot.length) fs.writeFileSync(path.join(outDir, "dense.png"), screenshot);
    } catch { /* ignore */ }

    // Margins and font floor are the first things to break on a crowded page.
    expect(result.checks.noMarginViolation.status).toBe("passed");
    expect(result.checks.fontConsistency.status).toBe("passed");
    expect(result.checks.noTextOverflow.status).toBe("passed");
    expect(result.passed).toBe(true);
    expect(result.layoutMetrics?.minFontSizePt ?? 0).toBeGreaterThanOrEqual(9);
  }, 45000);
});
