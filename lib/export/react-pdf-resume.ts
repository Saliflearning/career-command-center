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
 *
 * This module is NOT wired into the pipeline yet. It is selected only behind a
 * flag by the dispatcher, so turning it on or off never requires a code revert.
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
  formatMonthYearUtc,
  formatMonthYearRangeUtc,
  formatEducationDateUtc,
  formatCertificationLabel,
  preferDateLabel,
} from "@/lib/resume/date-format";

const h = React.createElement;

// Deep-navy accent on a white sheet; Times serif for the name, Helvetica for
// body and labels. (Final step swaps in embedded Source Serif 4 / Source Sans 3;
// the two built-ins keep this first cut dependency-free and ATS-clean.)
const NAVY = "#1f3a5c";
const NAVY_SOFT = "#5a6b82";
const INK = "#1a1a18";
const INK_SOFT = "#4f4f49";
const RULE = "#d8d6cf";

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
  base: number; // body font size (pt)
  leading: number; // line-height multiple
  margin: number; // horizontal page margin (pt)
  sectionGap: number; // space above each section (pt)
}

// Mirrors the legacy density ladder: try comfortable first, tighten until it
// fits one US Letter page.
const DENSITIES: Density[] = [
  { name: "balanced", base: 9.8, leading: 1.42, margin: 50, sectionGap: 14 },
  { name: "compact", base: 9.4, leading: 1.36, margin: 46, sectionGap: 12 },
  { name: "focused", base: 9.1, leading: 1.3, margin: 44, sectionGap: 10 },
  { name: "one-page-safe", base: 8.7, leading: 1.25, margin: 40, sectionGap: 9 },
];

function makeStyles(d: Density) {
  const b = d.base;
  return StyleSheet.create({
    page: {
      paddingTop: Math.round(d.margin * 0.82),
      paddingBottom: Math.round(d.margin * 0.72),
      paddingHorizontal: d.margin,
      fontFamily: SANS,
      color: INK_SOFT,
      fontSize: b,
      lineHeight: d.leading,
    },
    name: { fontFamily: SERIF, fontWeight: 700, fontSize: b * 2.7, color: INK, letterSpacing: -0.3 },
    headline: { fontFamily: SANS, fontWeight: 600, fontSize: b * 0.93, color: NAVY, marginTop: 3, letterSpacing: 0.3 },
    contactRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
    contactItem: { fontSize: b * 0.9, color: INK_SOFT },
    contactSep: { fontSize: b * 0.9, color: NAVY_SOFT, marginHorizontal: 5 },
    accentRule: { height: 1.6, backgroundColor: NAVY, marginTop: 9 },
    section: { marginTop: d.sectionGap },
    secLabelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    secLabel: { fontFamily: SANS, fontWeight: 700, fontSize: b * 0.88, color: NAVY, letterSpacing: 1.3 },
    secRule: { flexGrow: 1, height: 0.8, backgroundColor: RULE, marginLeft: 9 },
    summary: { color: INK_SOFT },
    skillRow: { flexDirection: "row", marginBottom: 2.5 },
    skillCat: { fontFamily: SANS, fontWeight: 700, color: INK, width: b * 11 },
    skillVal: { color: INK_SOFT, flexGrow: 1, flexShrink: 1 },
    job: { marginBottom: b * 1.05 },
    jobHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    jobTitle: { fontFamily: SANS, fontWeight: 700, fontSize: b * 1.05, color: INK, flexShrink: 1, paddingRight: 8 },
    jobDates: { fontSize: b * 0.9, color: INK_SOFT },
    jobOrg: { fontFamily: SANS, fontWeight: 600, fontSize: b * 0.92, color: NAVY, marginTop: 1 },
    bulletRow: { flexDirection: "row", marginTop: 3 },
    bulletMark: { color: NAVY, fontSize: b * 0.9, marginRight: 5 },
    bulletText: { flexGrow: 1, flexShrink: 1, color: INK_SOFT },
    eduRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
    eduLeft: { flexShrink: 1, paddingRight: 8 },
    eduDeg: { fontFamily: SANS, fontWeight: 700, color: INK },
    eduSchool: { fontFamily: SANS, fontWeight: 600, fontSize: b * 0.92, color: NAVY, marginTop: 1 },
    eduDetails: { color: INK_SOFT, marginTop: 1 },
    eduDate: { fontSize: b * 0.9, color: INK_SOFT },
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

function ResumeDocument(input: StructuredResumeExportInput, d: Density) {
  const st = makeStyles(d);
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
              h(Text, { style: st.bulletMark }, "▪"),
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

  let lastDetail = "All density profiles overflowed.";
  for (const d of DENSITIES) {
    const pdf = await renderToBuffer(ResumeDocument(input, d));
    const pages = countPdfPages(pdf);
    if (pages <= 1) {
      return { pdf, pageCount: 1, density: d.name, omittedContent: [] };
    }
    lastDetail = `${d.name} profile produced ${pages} pages.`;
  }

  throw new StructuredResumeOverflowError(lastDetail);
}
