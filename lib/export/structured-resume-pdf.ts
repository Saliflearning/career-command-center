import {
  DEFAULT_RESUME_PRESENTATION,
  parseResumePresentation,
  type ResumePresentation,
} from "@/lib/resume/presentation";
import {
  formatCertificationLabel,
  formatEducationDateUtc,
  formatMonthYearUtc,
  formatMonthYearRangeUtc,
  preferDateLabel,
} from "@/lib/resume/date-format";

export type ResumeRoleType =
  | "TECHNICAL"
  | "OPERATIONS"
  | "BUSINESS"
  | "DATA"
  | "FINANCE"
  | "ACADEMIC"
  | "FEDERAL"
  | "CREATIVE"
  | null;

export interface StructuredResumeExportInput {
  targetRole: string;
  targetCompany: string | null;
  roleType: ResumeRoleType;
  headline: string | null;
  candidate: {
    name: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    location: string | null;
    website: string | null;
  };
  summary: string | null;
  presentation?: ResumePresentation;
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    startDate: Date | string;
    endDate: Date | string | null;
    current: boolean;
    dateLabel?: string;
    sortOrder: number;
    bullets: string[];
  }>;
  projects?: Array<{
    id: string;
    name: string;
    description: string | null;
    technologies: string[];
    url: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  skills: Array<{ name: string; category: string | null }>;
  education: Array<{
    degree: string;
    institution: string;
    graduationDate: string | null;
    inProgress: boolean;
    dateLabel?: string;
    details?: string | null;
  }>;
  certifications: Array<{
    name: string;
    issuingBody: string | null;
    issueDate: string | null;
    dateLabel?: string;
  }>;
}

export interface StructuredResumePdfResult {
  pdf: Buffer;
  pageCount: 1;
  density: string;
  omittedContent: string[];
}

interface DensityProfile {
  name: string;
  margin: number;
  top: number;
  bottom: number;
  bodySize: number;
  bodyLeading: number;
  sectionSize: number;
}

const DENSITY_PROFILES: DensityProfile[] = [
  {
    name: "balanced",
    margin: 54,
    top: 738,
    bottom: 44,
    bodySize: 9.6,
    bodyLeading: 12,
    sectionSize: 10,
  },
  {
    name: "compact",
    margin: 48,
    top: 738,
    bottom: 38,
    bodySize: 9.3,
    bodyLeading: 11,
    sectionSize: 9.5,
  },
  {
    name: "focused",
    margin: 45,
    top: 738,
    bottom: 36,
    bodySize: 9.1,
    bodyLeading: 10.5,
    sectionSize: 9.3,
  },
  {
    name: "one-page-safe",
    margin: 42,
    top: 738,
    bottom: 36,
    bodySize: 9,
    bodyLeading: 10.2,
    sectionSize: 9,
  },
];

class PageOverflowError extends Error {}

export class StructuredResumeOverflowError extends Error {
  readonly code = "RESUME_ONE_PAGE_OVERFLOW";

  constructor(detail?: string) {
    super(
      "Structured resume cannot fit one page without removing or truncating content." +
        (detail ? ` ${detail}` : "")
    );
    this.name = "StructuredResumeOverflowError";
  }
}

export class StructuredResumeContentError extends Error {
  readonly code = "RESUME_UNSUPPORTED_CONTENT";

  constructor(detail?: string) {
    super(
      "Canonical resume content cannot be represented by the structured PDF renderer without changing it." +
        (detail ? ` ${detail}` : "")
    );
    this.name = "StructuredResumeContentError";
  }
}

/**
 * Build a deterministic one-page PDF from structured resume facts.
 *
 * The renderer never consumes LaTeX, invents content, or silently removes
 * canonical fields. Density profiles may compress presentation, but content
 * that still cannot fit on one US Letter page fails with a recoverable error.
 */
export function buildStructuredResumePdf(
  input: StructuredResumeExportInput
): StructuredResumePdfResult {
  assertRepresentableInput(input);

  let lastError: Error | null = null;
  const presentation = input.presentation
    ? parseResumePresentation(input.presentation)
    : DEFAULT_RESUME_PRESENTATION;

  for (const baseProfile of DENSITY_PROFILES) {
    const profile = applyPresentation(baseProfile, presentation);
    try {
      return renderWithProfile(input, profile, presentation);
    } catch (error) {
      if (!(error instanceof PageOverflowError)) throw error;
      lastError = error;
    }
  }

  throw new StructuredResumeOverflowError(
    lastError?.message ?? "All density profiles overflowed."
  );
}

function renderWithProfile(
  input: StructuredResumeExportInput,
  profile: DensityProfile,
  presentation: ResumePresentation
): StructuredResumePdfResult {
  const writer = new OnePageResumePdf(profile, presentation);
  const candidateName = cleanText(input.candidate.name || "");

  writer.centerWrapped(candidateName, 17, "bold");

  const headline = cleanText(input.headline || "");
  if (headline) {
    writer.centerWrapped(headline, 10, "bold");
  }

  const contacts = nonEmptyStrings([
    input.candidate.location,
    input.candidate.phone,
    input.candidate.email,
    input.candidate.linkedin,
    input.candidate.website,
  ]);
  if (contacts.length > 0) {
    writer.centerWrapped(contacts.join(" | "), 9, "regular");
  }
  writer.rule();

  const summary = cleanText(input.summary || "");
  if (summary) {
    writer.section("Professional Summary");
    writer.paragraph(summary);
  }

  const skillGroups = groupSkills(input.skills);
  if (skillGroups.length > 0) {
    writer.section(skillSectionTitle(input.roleType));
    skillGroups.forEach(([category, values]) => {
      writer.labeledLine(category, values.join(", "));
    });
  }

  const jobs = [...input.jobs]
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (jobs.length > 0) {
    writer.section("Professional Experience");
    jobs.forEach((job) => {
      writer.jobHeader({
        title: job.title,
        company: job.company,
        location: job.location,
        dates: preferDateLabel(
          job.dateLabel,
          () => formatDateRange(job.startDate, job.endDate, job.current)
        ),
      });
      nonEmptyStrings(job.bullets).forEach((bullet) => writer.bullet(bullet));
    });
  }

  const projects = input.projects ?? [];
  if (projects.length > 0) {
    writer.section("Projects");
    projects.forEach((project) => {
      writer.projectHeader(
        project.name,
        nonEmptyStrings([...project.technologies, project.url]).join(" | "),
        formatProjectDateRange(project.startDate, project.endDate)
      );
      if (project.description) {
        writer.paragraph(project.description);
      }
    });
  }

  if (input.education.length > 0) {
    writer.section("Education");
    input.education.forEach((education) => {
      writer.educationLine(
        education.degree,
        education.institution,
        preferDateLabel(
          education.dateLabel,
          () => formatEducationDate(education.graduationDate, education.inProgress)
        ),
        education.details || ""
      );
    });

  }

  const certifications = input.certifications.filter((certification) => {
    return Boolean(cleanText(certification.name));
  });
  if (certifications.length > 0) {
    writer.section("Certifications");
    writer.paragraph(certifications.map(formatCertificationLabel).join(" | "));
  }

  return {
    pdf: writer.toBuffer(),
    pageCount: 1,
    density: profile.name,
    omittedContent: [],
  };
}

class OnePageResumePdf {
  private content = "";
  private y: number;
  private readonly width = 612;

  constructor(
    private readonly profile: DensityProfile,
    private readonly presentation: ResumePresentation
  ) {
    this.y = profile.top;
  }

  centerWrapped(
    text: string,
    size: number,
    font: "regular" | "bold"
  ) {
    const lines = wrapByWidth(cleanText(text), this.availableWidth(), size);
    this.ensureSpace(lines.length * (size + 4));
    lines.forEach((line) => {
      const x = Math.max(
        this.profile.margin,
        (this.width - estimateTextWidth(line, size)) / 2
      );
      this.text(line, x, this.y, size, font);
      this.y -= size + 4;
    });
  }

  rule() {
    this.y -= 2;
    this.ensureSpace(8);
    this.line(this.profile.margin, this.y, this.width - this.profile.margin, this.y, 0.6);
    this.y -= 10;
  }

  section(label: string) {
    this.y -= 4;
    this.ensureSpace(20);
    this.text(cleanText(label).toUpperCase(), this.profile.margin, this.y, this.profile.sectionSize, "bold");
    this.y -= 4;
    this.line(this.profile.margin, this.y, this.width - this.profile.margin, this.y, 0.35);
    this.y -= 9;
  }

  paragraph(text: string) {
    this.wrappedText(text, this.profile.margin, this.availableWidth(), this.profile.bodySize, "regular");
    this.y -= 3;
  }

  labeledLine(label: string, value: string) {
    const prefix = `${cleanText(label)}: `;
    const firstLineWidth = Math.max(80, this.availableWidth() - estimateTextWidth(prefix, this.profile.bodySize));
    const valueLines = wrapByWidth(cleanText(value), firstLineWidth, this.profile.bodySize);
    this.ensureSpace(Math.max(1, valueLines.length) * this.profile.bodyLeading + 2);
    this.text(prefix, this.profile.margin, this.y, this.profile.bodySize, "bold");
    if (valueLines[0]) {
      this.text(
        valueLines[0],
        this.profile.margin + estimateTextWidth(prefix, this.profile.bodySize),
        this.y,
        this.profile.bodySize,
        "regular"
      );
    }
    this.y -= this.profile.bodyLeading;
    valueLines.slice(1).forEach((line) => {
      this.text(line, this.profile.margin, this.y, this.profile.bodySize, "regular");
      this.y -= this.profile.bodyLeading;
    });
    this.y -= 1;
  }

  jobHeader(job: {
    title: string;
    company: string;
    location: string | null;
    dates: string;
  }) {
    const dates = cleanText(job.dates);
    const dateWidth = estimateTextWidth(dates, this.profile.bodySize);
    const title = cleanText(job.title);
    const titleSize = this.profile.bodySize + 0.3;
    const sameLine = !dates || estimateTextWidth(title, titleSize) + dateWidth + 14 <= this.availableWidth();
    const titleLines = wrapByWidth(title, this.availableWidth(), titleSize);
    const company = [job.company, job.location]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" | ");
    const companyLines = wrapByWidth(cleanText(company), this.availableWidth(), this.profile.bodySize);
    this.ensureSpace(
      (titleLines.length + companyLines.length + (dates && !sameLine ? 1 : 0)) *
        this.profile.bodyLeading + 2
    );
    titleLines.forEach((line, index) => {
      this.text(line, this.profile.margin, this.y, titleSize, "bold");
      if (index === 0 && dates && sameLine) {
        this.text(
          dates,
          this.width - this.profile.margin - dateWidth,
          this.y,
          this.profile.bodySize,
          "regular"
        );
      }
      this.y -= this.profile.bodyLeading;
    });
    if (dates && !sameLine) {
      this.text(
        dates,
        this.width - this.profile.margin - dateWidth,
        this.y,
        this.profile.bodySize,
        "regular"
      );
      this.y -= this.profile.bodyLeading;
    }
    companyLines.forEach((line) => {
      this.text(line, this.profile.margin, this.y, this.profile.bodySize, "bold");
      this.y -= this.profile.bodyLeading;
    });
    this.y -= 1;
  }

  bullet(text: string) {
    const bulletX = this.profile.margin + 10;
    const textX = this.profile.margin + 22;
    const lines = wrapByWidth(
      cleanText(text),
      this.width - this.profile.margin - textX,
      this.profile.bodySize
    );
    this.ensureSpace(lines.length * this.profile.bodyLeading + 2);
    lines.forEach((line, index) => {
      if (index === 0) this.text("-", bulletX, this.y, this.profile.bodySize, "regular");
      this.text(line, textX, this.y, this.profile.bodySize, "regular");
      this.y -= this.profile.bodyLeading;
    });
    this.y -= 1;
  }

  educationLine(degree: string, institution: string, date: string, details = "") {
    const cleanedDegree = cleanText(degree);
    const cleanedDate = cleanText(date);
    const dateWidth = estimateTextWidth(cleanedDate, this.profile.bodySize);
    const sameLine = !cleanedDate || estimateTextWidth(cleanedDegree, this.profile.bodySize) + dateWidth + 12 <= this.availableWidth();
    const degreeLines = wrapByWidth(cleanedDegree, this.availableWidth(), this.profile.bodySize);
    const institutionLines = wrapByWidth(cleanText(institution), this.availableWidth(), this.profile.bodySize);
    const detailLines = details
      ? wrapByWidth(cleanText(details), this.availableWidth(), this.profile.bodySize)
      : [];
    this.ensureSpace(
      this.profile.bodyLeading *
        (degreeLines.length + institutionLines.length + detailLines.length + (cleanedDate && !sameLine ? 1 : 0)) +
        2
    );
    degreeLines.forEach((line, index) => {
      this.text(line, this.profile.margin, this.y, this.profile.bodySize, "bold");
      if (index === 0 && cleanedDate && sameLine) {
        this.text(cleanedDate, this.width - this.profile.margin - dateWidth, this.y, this.profile.bodySize, "regular");
      }
      this.y -= this.profile.bodyLeading;
    });
    if (cleanedDate && !sameLine) {
      this.text(
        cleanedDate,
        this.width - this.profile.margin - dateWidth,
        this.y,
        this.profile.bodySize,
        "regular"
      );
      this.y -= this.profile.bodyLeading;
    }
    institutionLines.forEach((line) => {
      this.text(line, this.profile.margin, this.y, this.profile.bodySize, "regular");
      this.y -= this.profile.bodyLeading;
    });
    detailLines.forEach((line) => {
      this.text(line, this.profile.margin, this.y, this.profile.bodySize, "regular");
      this.y -= this.profile.bodyLeading;
    });
    this.y -= 1;
  }

  projectHeader(name: string, detail: string, dates: string) {
    const cleanedDates = cleanText(dates);
    const dateWidth = estimateTextWidth(cleanedDates, this.profile.bodySize);
    const nameWidth = cleanedDates
      ? Math.max(80, this.availableWidth() - dateWidth - 14)
      : this.availableWidth();
    const nameLines = wrapByWidth(cleanText(name), nameWidth, this.profile.bodySize + 0.2);
    const detailLines = detail
      ? wrapByWidth(cleanText(detail), this.availableWidth(), this.profile.bodySize)
      : [];
    this.ensureSpace(this.profile.bodyLeading * (nameLines.length + detailLines.length) + 2);
    nameLines.forEach((line, index) => {
      this.text(line, this.profile.margin, this.y, this.profile.bodySize + 0.2, "bold");
      if (index === 0 && cleanedDates) {
        this.text(
          cleanedDates,
          this.width - this.profile.margin - dateWidth,
          this.y,
          this.profile.bodySize,
          "regular"
        );
      }
      this.y -= this.profile.bodyLeading;
    });
    detailLines.forEach((line) => {
      this.text(line, this.profile.margin, this.y, this.profile.bodySize, "regular");
      this.y -= this.profile.bodyLeading;
    });
    this.y -= 1;
  }

  toBuffer() {
    const regularFont = this.presentation.font === "serif" ? "Times-Roman" : "Helvetica";
    const boldFont = this.presentation.font === "serif" ? "Times-Bold" : "Helvetica-Bold";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [5 0 R] /Count 1 >>",
      `<< /Type /Font /Subtype /Type1 /BaseFont /${regularFont} /Encoding /WinAnsiEncoding >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${boldFont} /Encoding /WinAnsiEncoding >>`,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>",
      `<< /Length ${Buffer.byteLength(this.content, "latin1")} >>\nstream\n${this.content}\nendstream`,
    ];

    let body = "%PDF-1.4\n";
    const offsets: number[] = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(body, "latin1"));
      body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(body, "latin1");
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      body += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(body, "latin1");
  }

  private wrappedText(
    text: string,
    x: number,
    width: number,
    size: number,
    font: "regular" | "bold"
  ) {
    const lines = wrapByWidth(text, width, size);
    this.ensureSpace(lines.length * this.profile.bodyLeading);
    lines.forEach((line) => {
      this.text(line, x, this.y, size, font);
      this.y -= this.profile.bodyLeading;
    });
  }

  private availableWidth() {
    return this.width - this.profile.margin * 2;
  }

  private ensureSpace(required: number) {
    if (this.y - required < this.profile.bottom) {
      throw new PageOverflowError(
        `${this.profile.name} profile overflowed at y=${this.y.toFixed(1)}`
      );
    }
  }

  private text(text: string, x: number, y: number, size: number, font: "regular" | "bold") {
    const cleaned = cleanText(text);
    const rightEdge = x + estimateTextWidth(cleaned, size);
    if (x < this.profile.margin || rightEdge > this.width - this.profile.margin) {
      throw new PageOverflowError("Canonical text exceeds the available page width.");
    }
    const fontName = font === "bold" ? "F2" : "F1";
    this.content += `BT /${fontName} ${size.toFixed(1)} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${escapePdfText(cleaned)}) Tj ET\n`;
  }

  private line(x1: number, y1: number, x2: number, y2: number, width: number) {
    this.content += `${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
  }
}

function applyPresentation(
  profile: DensityProfile,
  presentation: ResumePresentation
): DensityProfile {
  const scale = presentation.scale === "compact"
    ? 0.94
    : presentation.scale === "large"
      ? 1.08
      : 1;
  const lineSpacing = presentation.density === "tight"
    ? 0.9
    : presentation.density === "open"
      ? 1.12
      : 1;

  return {
    ...profile,
    bodySize: Math.max(9, roundLayout(profile.bodySize * scale)),
    bodyLeading: Math.max(10.2, roundLayout(profile.bodyLeading * scale * lineSpacing)),
    sectionSize: Math.max(9, roundLayout(profile.sectionSize * scale)),
  };
}

function roundLayout(value: number) {
  return Math.round(value * 10) / 10;
}

function groupSkills(skills: StructuredResumeExportInput["skills"]) {
  const groups = new Map<string, string[]>();
  skills.forEach((skill) => {
    const category = cleanText(skill.category || "Core Skills");
    const name = cleanText(skill.name);
    if (!name) return;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(name);
  });
  return Array.from(groups.entries());
}

function skillSectionTitle(roleType: ResumeRoleType) {
  return roleType === "TECHNICAL" || roleType === "DATA"
    ? "Technical Skills"
    : "Core Skills";
}

function formatDateRange(
  startDate: Date | string,
  endDate: Date | string | null,
  current: boolean
) {
  // Explicit source end dates are authoritative, even if an old record has a
  // stale current=true flag. Canonical Jan/Dec boundaries represent a source
  // year-only range and are rendered without invented month precision.
  return formatMonthYearRangeUtc(startDate, endDate, endDate ? false : current);
}

function formatEducationDate(value: string | null, inProgress: boolean) {
  return formatEducationDateUtc(value, inProgress);
}

function formatProjectDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return "";
  const start = startDate ? formatMonthYearUtc(startDate) : "";
  const end = endDate ? formatMonthYearUtc(endDate) : "";
  return [start, end].filter(Boolean).join(" - ");
}

function nonEmptyStrings(values: Array<string | null | undefined>) {
  return values
    .map((value) => cleanText(value || ""))
    .filter(Boolean);
}

function wrapByWidth(value: string, width: number, size: number) {
  const words = cleanText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (estimateTextWidth(word, size) > width) {
      throw new PageOverflowError("Canonical token exceeds the available page width.");
    }
    const next = current ? `${current} ${word}` : word;
    if (current && estimateTextWidth(next, size) > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function cleanText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function estimateTextWidth(text: string, size: number) {
  return text.length * size * 0.49;
}

function escapePdfText(value: string) {
  return encodeWinAnsi(cleanText(value))
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function assertRepresentableInput(input: StructuredResumeExportInput) {
  assertCanonicalStructure(input);
  const unsupported = collectCanonicalStrings(input).some((value) =>
    Array.from(cleanText(value)).some((character) => winAnsiByte(character) === null)
  );
  if (unsupported) throw new StructuredResumeContentError();
}

function assertCanonicalStructure(input: StructuredResumeExportInput) {
  if (!cleanText(input.candidate.name || "")) {
    throw new StructuredResumeContentError("A candidate name is required.");
  }
  if (input.jobs.some((job) => !cleanText(job.title))) {
    throw new StructuredResumeContentError("Every job requires a title.");
  }
  if (input.skills.some((skill) => !cleanText(skill.name) && cleanText(skill.category || ""))) {
    throw new StructuredResumeContentError("Every categorized skill requires a name.");
  }
  if ((input.projects ?? []).some((project) =>
    !cleanText(project.name) && Boolean(
      cleanText(project.description || "") ||
      cleanText(project.url || "") ||
      project.technologies.some((technology) => cleanText(technology)) ||
      project.startDate ||
      project.endDate
    )
  )) {
    throw new StructuredResumeContentError("Every populated project requires a name.");
  }
  if (input.education.some((education) =>
    !cleanText(education.degree) && Boolean(
      cleanText(education.institution) ||
      cleanText(education.details || "") ||
      cleanText(education.dateLabel || "") ||
      education.graduationDate
    )
  )) {
    throw new StructuredResumeContentError("Every populated education record requires a degree.");
  }
  if (input.certifications.some((certification) =>
    !cleanText(certification.name) && Boolean(
      cleanText(certification.issuingBody || "") ||
      cleanText(certification.dateLabel || "") ||
      certification.issueDate
    )
  )) {
    throw new StructuredResumeContentError("Every populated certification requires a name.");
  }
}

const WIN_ANSI_SPECIAL_BYTES: Readonly<Record<string, number>> = {
  "\u20AC": 0x80,
  "\u201A": 0x82,
  "\u0192": 0x83,
  "\u201E": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u02C6": 0x88,
  "\u2030": 0x89,
  "\u0160": 0x8a,
  "\u2039": 0x8b,
  "\u0152": 0x8c,
  "\u017D": 0x8e,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201C": 0x93,
  "\u201D": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u02DC": 0x98,
  "\u2122": 0x99,
  "\u0161": 0x9a,
  "\u203A": 0x9b,
  "\u0153": 0x9c,
  "\u017E": 0x9e,
  "\u0178": 0x9f,
};

function winAnsiByte(character: string): number | null {
  const special = WIN_ANSI_SPECIAL_BYTES[character];
  if (special !== undefined) return special;
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return null;
  if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint;
  return null;
}

function encodeWinAnsi(value: string): string {
  return Array.from(value, (character) => {
    const byte = winAnsiByte(character);
    if (byte === null) throw new StructuredResumeContentError();
    return String.fromCharCode(byte);
  }).join("");
}

function collectCanonicalStrings(input: StructuredResumeExportInput): string[] {
  return nonEmptyStrings([
    input.headline,
    input.candidate.name,
    input.candidate.email,
    input.candidate.phone,
    input.candidate.linkedin,
    input.candidate.location,
    input.candidate.website,
    input.summary,
    ...input.jobs.flatMap((job) => [
      job.title,
      job.company,
      job.location,
      job.dateLabel,
      ...job.bullets,
    ]),
    ...(input.projects ?? []).flatMap((project) => [
      project.name,
      project.description,
      project.url,
      ...project.technologies,
    ]),
    ...input.skills.flatMap((skill) => [skill.name, skill.category]),
    ...input.education.flatMap((education) => [
      education.degree,
      education.institution,
      education.dateLabel,
      education.details,
    ]),
    ...input.certifications.flatMap((certification) => [
      certification.name,
      certification.issuingBody,
      certification.dateLabel,
    ]),
  ]);
}
