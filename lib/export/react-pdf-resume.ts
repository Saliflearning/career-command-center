/**
 * Template-engine resume renderer (react-pdf), the replacement for the
 * hand-written byte emitter in `structured-resume-pdf.ts`.
 *
 * Why this exists: the legacy renderer draws raw PDF operators and *estimates*
 * glyph width as `length * size * 0.49`, so wrapping and one-page fit are
 * fragile and the output is generic. react-pdf measures text with real font
 * metrics (fontkit), supports full Unicode, and lets the layout be premium.
 *
 * Contract parity with the legacy renderer is deliberate:
 *   - same public shape: StructuredResumeExportInput -> StructuredResumePdfResult
 *   - same section order (summary, skills, experience, projects, education, certs)
 *   - same one-page guarantee via a density ladder; overflow throws the same
 *     StructuredResumeOverflowError the callers already handle.
 *   - honors the saved editor presentation (font / scale / density), matching
 *     the legacy renderer's applyPresentation mapping, so the downloaded PDF
 *     reflects the same choices the editor preview shows.
 *
 * Output is built to pass the production visual gate (agents/visual-qa):
 *   - section headings carry NO letterSpacing, so they extract as contiguous
 *     text the gate's section search can find (letter-spaced headings extract
 *     as "P R O F E S S I O N A L" and fail).
 *   - every rendered font size is floored at FONT_FLOOR (>= the gate's 9pt
 *     minimum), mirroring the legacy renderer's max(9, ...) clamp.
 *   - bullet markers are drawn (a filled View), not a font glyph, so they are
 *     always visible regardless of a font's symbol coverage.
 *
 * This module is selected only behind a flag by the dispatcher, so turning it
 * on or off never requires a code revert.
 */
import path from "path";
import fontkit from "fontkit";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  type StructuredResumeExportInput,
  type StructuredResumePdfResult,
  type ResumeRoleType,
  StructuredResumeOverflowError,
  StructuredResumeContentError,
} from "./structured-resume-pdf";
import {
  DEFAULT_RESUME_PRESENTATION,
  type ResumePresentation,
} from "@/lib/resume/presentation";
import {
  formatMonthYearUtc,
  formatMonthYearRangeUtc,
  formatEducationDateUtc,
  formatCertificationLabel,
  preferDateLabel,
} from "@/lib/resume/date-format";

const h = React.createElement;

// Deep-navy accent on a white sheet. Serif name over a clean body: the name is
// always the serif face; body/labels follow the chosen font (serif or sans).
const NAVY = "#1f3a5c";
const NAVY_SOFT = "#5a6b82";
const INK = "#1a1a18";
const INK_SOFT = "#4f4f49";
const RULE = "#d8d6cf";

// The production visual gate (agents/visual-qa) fails fontConsistency when any
// extracted text item is below 9pt. We floor every size a little above that so
// extraction rounding can never cross the line; this mirrors the legacy
// renderer's `Math.max(9, ...)` clamp in applyPresentation.
const FONT_FLOOR = 9.5;

// Embedded Source Serif 4 (name) + Source Sans 3 (body/labels), committed under
// assets/fonts. Registration is lazy (fontkit reads the file at render), so the
// files must ship with the deployment (see next.config outputFileTracingIncludes).
// Registering more than once is harmless; guard so hot-reload does not warn.
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const SERIF = "SourceSerif4";
const SANS = "SourceSans3";
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: SERIF,
    fonts: [
      { src: path.join(FONT_DIR, "SourceSerif4-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "SourceSerif4-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: SANS,
    fonts: [
      { src: path.join(FONT_DIR, "SourceSans3-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "SourceSans3-Semibold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "SourceSans3-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Resumes should never show hyphenated line breaks; keep every word whole.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

// Glyph-coverage guard. The embedded Source families cover Latin (incl.
// extended) and Cyrillic, but not CJK, Arabic, Hebrew, etc. Rather than render
// a silent blank box for an uncovered character, we throw the same content error
// the legacy renderer threw, so the caller surfaces a clear "review this text"
// message instead of shipping a corrupted resume. Coverage is checked against
// the body face; the serif name face has equivalent Latin/Cyrillic coverage.
let coverageFont: { hasGlyphForCodePoint(codePoint: number): boolean } | null = null;
function supportsCodePoint(codePoint: number): boolean {
  if (codePoint === 0x20 || codePoint === 0x09 || codePoint === 0x0a) return true;
  if (!coverageFont) {
    coverageFont = fontkit.openSync(
      path.join(FONT_DIR, "SourceSans3-Regular.ttf")
    ) as unknown as { hasGlyphForCodePoint(codePoint: number): boolean };
  }
  return coverageFont.hasGlyphForCodePoint(codePoint);
}

function collectStrings(input: StructuredResumeExportInput): string[] {
  const c = input.candidate;
  return [
    c.name, c.email, c.phone, c.linkedin, c.location, c.website,
    input.headline, input.summary, input.targetRole, input.targetCompany,
    ...input.jobs.flatMap((j) => [j.title, j.company, j.location, j.dateLabel, ...j.bullets]),
    ...(input.projects ?? []).flatMap((p) => [p.name, p.description, p.url, ...p.technologies]),
    ...input.skills.flatMap((s) => [s.name, s.category]),
    ...input.education.flatMap((e) => [e.degree, e.institution, e.dateLabel, e.details]),
    ...input.certifications.flatMap((ct) => [ct.name, ct.issuingBody, ct.dateLabel]),
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
}

function assertRenderable(input: StructuredResumeExportInput): void {
  for (const value of collectStrings(input)) {
    for (const ch of value) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && !supportsCodePoint(cp)) {
        throw new StructuredResumeContentError(
          `Character "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, "0")}) cannot be rendered by the resume fonts.`
        );
      }
    }
  }
}

interface Density {
  name: string;
  base: number; // body font size (pt) before the presentation scale
  leading: number; // line-height multiple
  margin: number; // horizontal page margin (pt)
  sectionGap: number; // space above each section (pt)
  jobGap: number; // space below each job/project entry (pt)
  bulletGap: number; // space above each bullet row (pt)
}

// Try comfortable first, tighten until it fits one US Letter page. Every base
// is >= FONT_FLOOR so body text is never rendered below the gate minimum; the
// floor in makeStyles then protects the smaller label/date text as well.
// Denser rungs recover space through inter-element spacing (jobGap, bulletGap,
// leading) rather than by shrinking page margins or font sizes, so the visual
// gate's margin and font-size floors are never at risk on a dense resume.
const DENSITIES: Density[] = [
  { name: "balanced", base: 10.6, leading: 1.38, margin: 50, sectionGap: 14, jobGap: 11, bulletGap: 3 },
  { name: "compact", base: 10.0, leading: 1.3, margin: 46, sectionGap: 11, jobGap: 8, bulletGap: 2.3 },
  { name: "focused", base: 9.7, leading: 1.2, margin: 40, sectionGap: 8, jobGap: 5.5, bulletGap: 1.8 },
  { name: "one-page-safe", base: 9.5, leading: 1.12, margin: 38, sectionGap: 6, jobGap: 3.5, bulletGap: 1.2 },
];

// Saved editor presentation -> render parameters. Mirrors the legacy renderer's
// applyPresentation: scale multiplies sizes, density multiplies line spacing,
// and the font choice selects the body/label face.
interface RenderOpts {
  fontScale: number;
  leadingScale: number;
  bodyFamily: string;
}

function renderOptsFor(presentation: ResumePresentation): RenderOpts {
  const fontScale =
    presentation.scale === "compact" ? 0.94 : presentation.scale === "large" ? 1.08 : 1;
  const leadingScale =
    presentation.density === "tight" ? 0.9 : presentation.density === "open" ? 1.12 : 1;
  // "system" is a sans-serif stack in the editor; render it with the sans face.
  const bodyFamily = presentation.font === "serif" ? SERIF : SANS;
  return { fontScale, leadingScale, bodyFamily };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function makeStyles(d: Density, opts: RenderOpts) {
  const b = d.base * opts.fontScale; // scaled body size
  // Font sizes are floored so no extracted text item falls below the gate's 9pt
  // minimum; sizes above the floor keep the type hierarchy intact.
  const sz = (factor: number) => Math.max(FONT_FLOOR, round1(b * factor));
  const body = sz(1);
  const label = sz(0.9);
  const leading = round1(d.leading * opts.leadingScale);
  const BODY = opts.bodyFamily;
  return StyleSheet.create({
    page: {
      // The visual gate rejects any page margin below 36pt (measured from the
      // outermost text), so floor every side comfortably above it on all rungs.
      paddingTop: Math.max(40, Math.round(d.margin * 0.82)),
      paddingBottom: Math.max(38, Math.round(d.margin * 0.72)),
      paddingHorizontal: d.margin,
      fontFamily: BODY,
      color: INK_SOFT,
      fontSize: body,
      lineHeight: leading,
    },
    name: { fontFamily: SERIF, fontWeight: 700, fontSize: round1(b * 2.7), color: INK, letterSpacing: -0.3 },
    headline: { fontFamily: BODY, fontWeight: 600, fontSize: sz(0.95), color: NAVY, marginTop: 3 },
    contactRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
    contactItem: { fontSize: label, color: INK_SOFT },
    contactSep: { fontSize: label, color: NAVY_SOFT, marginHorizontal: 5 },
    accentRule: { height: 1.6, backgroundColor: NAVY, marginTop: 9 },
    section: { marginTop: d.sectionGap },
    // No letterSpacing on the heading: the visual gate searches extracted text
    // for the section label, and letter-spacing makes it extract as separated
    // characters ("P R O F E S S I O N A L") that never match. Weight + color +
    // the trailing rule carry the premium treatment instead.
    secLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    secLabel: { fontFamily: BODY, fontWeight: 700, fontSize: label, color: NAVY },
    secRule: { flexGrow: 1, height: 0.8, backgroundColor: RULE, marginLeft: 9 },
    summary: { color: INK_SOFT },
    skillRow: { flexDirection: "row", marginBottom: 2.5 },
    skillCat: { fontFamily: BODY, fontWeight: 700, color: INK, width: b * 11, flexShrink: 0 },
    // flexBasis:0 makes the value size come from the remaining row width, not its
    // own content width, so a long comma list wraps inside the column instead of
    // overflowing the right page margin.
    skillVal: { color: INK_SOFT, flexGrow: 1, flexShrink: 1, flexBasis: 0 },
    job: { marginBottom: d.jobGap },
    jobHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    jobTitle: { fontFamily: BODY, fontWeight: 700, fontSize: sz(1.05), color: INK, flexShrink: 1, paddingRight: 8 },
    jobDates: { fontSize: label, color: INK_SOFT },
    jobOrg: { fontFamily: BODY, fontWeight: 600, fontSize: sz(0.92), color: NAVY, marginTop: 1 },
    bulletRow: { flexDirection: "row", marginTop: d.bulletGap },
    // Drawn marker, not a font glyph: always visible regardless of symbol-font
    // coverage. Nudged down to sit against the first text line.
    bulletMark: { width: 2.6, height: 2.6, backgroundColor: NAVY, borderRadius: 0.4, marginRight: 6, marginTop: round1(body * 0.34) },
    bulletText: { flexGrow: 1, flexShrink: 1, flexBasis: 0, color: INK_SOFT },
    eduRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
    eduLeft: { flexShrink: 1, paddingRight: 8 },
    eduDeg: { fontFamily: BODY, fontWeight: 700, color: INK },
    eduSchool: { fontFamily: BODY, fontWeight: 600, fontSize: sz(0.92), color: NAVY, marginTop: 1 },
    eduDetails: { color: INK_SOFT, marginTop: 1 },
    eduDate: { fontSize: label, color: INK_SOFT },
    certs: { color: INK_SOFT },
  });
}

type Styles = ReturnType<typeof makeStyles>;

function clean(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}
function nonEmpty(values: Array<string | null | undefined>): string[] {
  return values.map((v) => clean(v)).filter(Boolean);
}
function skillSectionTitle(roleType: ResumeRoleType): string {
  return roleType === "TECHNICAL" || roleType === "DATA" ? "Technical Skills" : "Core Skills";
}
function groupSkills(skills: StructuredResumeExportInput["skills"]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const skill of skills) {
    const name = clean(skill.name);
    if (!name) continue;
    const category = clean(skill.category || "Core Skills");
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(name);
  }
  return Array.from(groups.entries());
}
function jobDateLabel(job: StructuredResumeExportInput["jobs"][number]): string {
  return preferDateLabel(job.dateLabel, () =>
    formatMonthYearRangeUtc(job.startDate, job.endDate, job.endDate ? false : job.current)
  );
}
function projectDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "";
  return [startDate ? formatMonthYearUtc(startDate) : "", endDate ? formatMonthYearUtc(endDate) : ""]
    .filter(Boolean)
    .join(" – ");
}

function section(st: Styles, label: string, body: React.ReactNode) {
  // No wrap:false here. A section taller than a page must FLOW onto additional
  // pages (which the page counter then rejects so a denser profile is tried, or
  // overflow is thrown). wrap:false would instead clip an over-tall section onto
  // one page, which the counter cannot detect — a silent corruption.
  return h(View, { style: st.section },
    h(View, { style: st.secLabelRow },
      h(Text, { style: st.secLabel }, label.toUpperCase()),
      h(View, { style: st.secRule })),
    body);
}

function ResumeDocument(input: StructuredResumeExportInput, d: Density, opts: RenderOpts) {
  const st = makeStyles(d, opts);
  const c = input.candidate;
  const contacts = nonEmpty([c.location, c.phone, c.email, c.linkedin, c.website]);
  const skillGroups = groupSkills(input.skills);
  const jobs = [...input.jobs].sort((a, b) => a.sortOrder - b.sortOrder);
  const projects = input.projects ?? [];
  const certs = input.certifications.filter((ct) => clean(ct.name));

  const children: React.ReactNode[] = [];

  // Header (left-aligned, premium)
  children.push(
    h(View, { key: "head" },
      h(Text, { style: st.name }, clean(c.name)),
      clean(input.headline) ? h(Text, { style: st.headline }, clean(input.headline)) : null,
      contacts.length
        ? h(View, { style: st.contactRow },
            ...contacts.flatMap((p, i) =>
              i === 0
                ? [h(Text, { key: `c${i}`, style: st.contactItem }, p)]
                : [
                    h(Text, { key: `sep${i}`, style: st.contactSep }, "·"),
                    h(Text, { key: `c${i}`, style: st.contactItem }, p),
                  ]))
        : null,
      h(View, { style: st.accentRule }))
  );

  if (clean(input.summary)) {
    children.push(section(st, "Professional Summary", h(Text, { style: st.summary }, clean(input.summary))));
  }

  if (skillGroups.length) {
    children.push(section(st, skillSectionTitle(input.roleType),
      h(View, {}, ...skillGroups.map(([cat, names], i) =>
        h(View, { key: i, style: st.skillRow },
          h(Text, { style: st.skillCat }, cat),
          h(Text, { style: st.skillVal }, names.join(", ")))))));
  }

  if (jobs.length) {
    children.push(section(st, "Professional Experience",
      h(View, {}, ...jobs.map((job, i) => {
        const org = nonEmpty([job.company, job.location]).join("  ·  ");
        const dates = clean(jobDateLabel(job));
        return h(View, { key: job.id || i, style: st.job },
          h(View, { style: st.jobHead },
            h(Text, { style: st.jobTitle }, clean(job.title)),
            dates ? h(Text, { style: st.jobDates }, dates) : null),
          org ? h(Text, { style: st.jobOrg }, org) : null,
          ...nonEmpty(job.bullets).map((b, bi) =>
            h(View, { key: bi, style: st.bulletRow },
              h(View, { style: st.bulletMark }),
              h(Text, { style: st.bulletText }, b))));
      }))));
  }

  if (projects.length) {
    children.push(section(st, "Projects",
      h(View, {}, ...projects.map((p, i) => {
        const detail = nonEmpty([...p.technologies, p.url]).join(" | ");
        const dates = clean(projectDateRange(p.startDate, p.endDate));
        return h(View, { key: p.id || i, style: st.job },
          h(View, { style: st.jobHead },
            h(Text, { style: st.jobTitle }, clean(p.name)),
            dates ? h(Text, { style: st.jobDates }, dates) : null),
          detail ? h(Text, { style: st.jobOrg }, detail) : null,
          clean(p.description) ? h(Text, { style: st.summary }, clean(p.description)) : null);
      }))));
  }

  if (input.education.length) {
    children.push(section(st, "Education",
      h(View, {}, ...input.education.map((e, i) => {
        const date = clean(preferDateLabel(e.dateLabel, () => formatEducationDateUtc(e.graduationDate, e.inProgress)));
        return h(View, { key: i, style: st.eduRow },
          h(View, { style: st.eduLeft },
            h(Text, { style: st.eduDeg }, clean(e.degree)),
            clean(e.institution) ? h(Text, { style: st.eduSchool }, clean(e.institution)) : null,
            clean(e.details || "") ? h(Text, { style: st.eduDetails }, clean(e.details || "")) : null),
          date ? h(Text, { style: st.eduDate }, date) : null);
      }))));
  }

  if (certs.length) {
    children.push(section(st, "Certifications",
      h(Text, { style: st.certs }, certs.map(formatCertificationLabel).join("   ·   "))));
  }

  return h(Document, {}, h(Page, { size: "LETTER", style: st.page }, ...children));
}

// react-pdf paginates overflowing content; count the Page objects it wrote.
function countPdfPages(buffer: Buffer): number {
  const text = buffer.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches ? matches.length : 1;
}

/**
 * Render a one-page premium resume PDF from canonical structured facts.
 * Same return contract and one-page guarantee as buildStructuredResumePdf.
 */
export async function renderStructuredResumePdfReactPdf(
  input: StructuredResumeExportInput
): Promise<StructuredResumePdfResult> {
  ensureFonts();
  if (!clean(input.candidate.name)) {
    throw new StructuredResumeContentError("A candidate name is required.");
  }
  assertRenderable(input);

  const opts = renderOptsFor(input.presentation ?? DEFAULT_RESUME_PRESENTATION);

  let lastDetail = "All density profiles overflowed.";
  for (const d of DENSITIES) {
    const pdf = await renderToBuffer(ResumeDocument(input, d, opts));
    const pages = countPdfPages(pdf);
    if (pages <= 1) {
      return { pdf, pageCount: 1, density: d.name, omittedContent: [] };
    }
    lastDetail = `${d.name} profile produced ${pages} pages.`;
  }

  throw new StructuredResumeOverflowError(lastDetail);
}
