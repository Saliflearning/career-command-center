// ---------------------------------------------------------------------------
// LaTeX Source Generator
//
// Converts structured resume data into a valid XeLaTeX source document.
// This is template-based (not LLM) — correctness and speed are the priority.
//
// Design principles:
//  - ATS-safe: no multi-column layout, no text boxes, no images
//  - One page enforced at layout level (Compression agent handles overflow)
//  - Palatino font, standard in any texlive-full installation
//  - Section order follows the strategy agent's SectionDecision[]
//  - All user content is LaTeX-escaped before insertion
//  - Matches CLAUDE.md §9 LaTeX Formatting Specification exactly
//
// Output: a complete .tex document string ready for XeLaTeX compilation
// ---------------------------------------------------------------------------

import type {
  CareerMemory,
  ResumeStrategy,
  WorkHistoryEntry,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// LaTeX character escaping
// ---------------------------------------------------------------------------

/**
 * Escape all LaTeX special characters in user-provided strings.
 * Must be applied to every string sourced from user data before insertion.
 */
function esc(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g,  "\\&")
    .replace(/%/g,  "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g,  "\\#")
    .replace(/_/g,  "\\_")
    .replace(/\^/g, "\\^{}")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g,  "\\textasciitilde{}")
    .replace(/—/g,  "---")   // em dash -> LaTeX em dash
    .replace(/–/g,  "--")    // en dash
    .replace(/”/g, "''")  // curly right double quote
    .replace(/“/g, "``")  // curly left double quote
    .replace(/’/g, "'")   // curly right single quote
    .replace(/‘/g, "`");  // curly left single quote
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(isoDate: string | null, current = false): string {
  if (current) return "Present";
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Section generators — using CLAUDE.md §9 custom commands
// ---------------------------------------------------------------------------

function generateHeader(
  careerMemory: CareerMemory,
  nameSize: string,
  headerBottomSpace: string,
  resumeHeader?: ResumeHeader | null
): string {
  // CareerMemory doesn't carry contact info directly (normalizer strips PII to DB)
  // Placeholder tokens are replaced by the workspace editor (A8) when user reviews.
  // This is intentional — the system never stores or embeds PII in generated
  // source files outside the user's session.
  const name = resumeHeader?.name || "[Full Name]";
  const linkedin = resumeHeader?.linkedin?.replace(/^https?:\/\//i, "");
  const contactItems = [
    resumeHeader?.location || careerMemory.jobs[0]?.location || "",
    resumeHeader?.phone || "[Phone]",
    resumeHeader?.email ? `\\href{mailto:${esc(resumeHeader.email)}}{${esc(resumeHeader.email)}}` : "[email]",
    linkedin ? `\\href{https://${esc(linkedin)}}{${esc(linkedin)}}` : "[linkedin]",
  ].filter(Boolean);

  return `%% -- HEADER ----------------------------------------------------------------
\\begin{center}
  {${nameSize} \\textbf{${esc(name)}}}\\\\[2pt]
  {\\small ${contactItems.join(" \\;|\\; ")}}
\\end{center}
\\vspace{${headerBottomSpace}}`;
}

function generateSummary(summaryText: string): string {
  if (!summaryText.trim()) return "";
  return `%% -- SUMMARY ---------------------------------------------------------------
\\section{Professional Summary}
${esc(summaryText)}`;
}

function generateSkills(careerMemory: CareerMemory): string {
  const byCategory = careerMemory.skills.reduce<Record<string, string[]>>(
    (acc, s) => {
      const cat = s.category ?? "Other";
      if (!acc[cat]) acc[cat] = [];
      // Include proficiency label if present (qualifier rule: never drop it)
      const label = s.proficiencyLabel ? ` (${s.proficiencyLabel})` : "";
      acc[cat].push(`${esc(s.name)}${esc(label)}`);
      return acc;
    },
    {}
  );

  if (Object.keys(byCategory).length === 0) return "";

  const rows = Object.entries(byCategory)
    .slice(0, 5)
    .map(([cat, skills]) => `  \\textbf{${esc(cat)}:} ${skills.slice(0, 8).join(", ")}`)
    .join(" \\\\\n");

  return `%% -- SKILLS ----------------------------------------------------------------
\\section{Skills}
${rows}`;
}

function generateExperience(
  careerMemory: CareerMemory,
  strategy: ResumeStrategy
): string {
  // Filter to only the jobs the strategy says to include, in strategy order
  const includedIds = new Set(
    strategy.workHistoryInScope.filter((w) => w.include).map((w) => w.workHistoryId)
  );

  const orderedJobs: WorkHistoryEntry[] = strategy.workHistoryInScope
    .filter((w) => w.include)
    .map((w) => careerMemory.jobs.find((j) => j.id === w.workHistoryId))
    .filter((j): j is WorkHistoryEntry => j !== undefined);

  // Fallback: if strategy IDs don't match (e.g. demo mode), use top 3 jobs
  const jobs = orderedJobs.length > 0
    ? orderedJobs
    : careerMemory.jobs.filter((j) => includedIds.has(j.id)).slice(0, 3);

  if (jobs.length === 0) return "";

  const entries = jobs.map((job) => {
    const start    = formatDate(job.startDate);
    const end      = formatDate(job.endDate, job.current);
    const location = job.location ? ` \\textnormal{|} ${esc(job.location)}` : "";
    const empType  = job.employmentType ? esc(job.employmentType) : "";

    // Use only GENERATED bullets if available, fall back to VERIFIED originals
    const generatedBullets = job.bullets.filter(b => b.contentType === "GENERATED");
    const bulletSource = generatedBullets.length > 0 ? generatedBullets : job.bullets;
    const bulletCount  = strategy.workHistoryInScope.find(w => w.workHistoryId === job.id)?.bulletCountTarget ?? 4;
    const bullets      = bulletSource.slice(0, bulletCount);

    const bulletLines = bullets.length > 0
      ? `  \\itemListStart\n` +
        bullets.map(b => `    \\resumeItem{${esc(b.content)}}`).join("\n") +
        `\n  \\itemListEnd`
      : "";

    return `  \\jobEntry
    {${esc(job.title)}}
    {${esc(start)} -- ${esc(end)}}
    {${esc(job.company)}${location}}
    {${empType}}
${bulletLines}`;
  });

  return `%% -- WORK EXPERIENCE -------------------------------------------------------
\\section{Work Experience}
${entries.join("\n")}`;
}

function generateEducation(careerMemory: CareerMemory): string {
  if (careerMemory.education.length === 0 && careerMemory.certifications.length === 0) {
    return "";
  }

  const parts: string[] = [];

  // Education entries using tabular alignment per CLAUDE.md §9
  if (careerMemory.education.length > 0) {
    parts.push("\\vspace{2pt}");
    for (const edu of careerMemory.education) {
      const gradDate = edu.inProgress
        ? `Expected ${formatDate(edu.expectedDate ?? edu.graduationDate)}`
        : formatDate(edu.graduationDate);
      const gpaStr = edu.gpa ? ` --- GPA: ${esc(edu.gpa)}` : "";

      parts.push(`  \\begin{tabular*}{0.98\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{\\small ${esc(edu.degree)},} \\textit{\\small ${esc(edu.institution)}}${gpaStr} &
    {\\small ${esc(gradDate)}} \\\\[2pt]
  \\end{tabular*}`);
    }
  }

  // Certifications inline per CLAUDE.md §9 format
  if (careerMemory.certifications.length > 0) {
    parts.push("\\vspace{3pt}");
    const certParts = careerMemory.certifications.slice(0, 6).map(c => {
      const year = c.issueDate ? ` (${formatDate(c.issueDate)})` : "";
      return `\\textbf{${esc(c.name)}}${year}`;
    });
    parts.push(`  {\\small ${certParts.join(" $|$ ")}}`);
  }

  return `%% -- EDUCATION AND CERTIFICATIONS ------------------------------------------
\\section{Education and Certifications}
${parts.join("\n")}`;
}

function generateProjects(careerMemory: CareerMemory): string {
  if (!careerMemory.projects || careerMemory.projects.length === 0) return "";

  const entries = careerMemory.projects.map((proj) => {
    const techStr = proj.technologies && proj.technologies.length > 0
      ? ` \\textnormal{|} ${proj.technologies.map(t => esc(t)).join(", ")}`
      : "";
    const desc = proj.description ? `\n  \\itemListStart\n    \\resumeItem{${esc(proj.description)}}\n  \\itemListEnd` : "";

    return `  \\begin{tabular*}{0.98\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{\\small ${esc(proj.name)}}${techStr} & {} \\\\
  \\end{tabular*}${desc}`;
  });

  return `%% -- PROJECTS --------------------------------------------------------------
\\section{Projects}
${entries.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Section router — assembles sections in strategy-defined order
// ---------------------------------------------------------------------------

function assembleSections(
  careerMemory: CareerMemory,
  strategy: ResumeStrategy,
  summaryText: string
): string {
  const parts: string[] = [];

  for (const decision of strategy.sectionOrder) {
    if (!decision.include) continue;

    switch (decision.section) {
      case "summary": {
        const s = generateSummary(summaryText);
        if (s) parts.push(s);
        break;
      }
      case "technical_skills":
      case "core_skills": {
        const sk = generateSkills(careerMemory);
        if (sk) parts.push(sk);
        break;
      }
      case "experience": {
        const ex = generateExperience(careerMemory, strategy);
        if (ex) parts.push(ex);
        break;
      }
      case "education":
      case "certifications": {
        // CLAUDE.md §9 combines education and certifications into one section.
        // Only emit once — skip if already emitted.
        const marker = "__edu_certs_emitted__";
        if (!(parts as unknown as Record<string, boolean>)[marker]) {
          const ed = generateEducation(careerMemory);
          if (ed) parts.push(ed);
          (parts as unknown as Record<string, boolean>)[marker] = true;
        }
        break;
      }
      case "projects": {
        const proj = generateProjects(careerMemory);
        if (proj) parts.push(proj);
        break;
      }
      case "publications":
      case "achievements":
        // Future enhancement — skip gracefully
        break;
    }
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Adaptive layout engine — docs/latex-layout-baseline.md
//
// The baseline values are the starting point. The engine estimates content
// density and adjusts margins/spacing ONLY within the spec's allowed ranges
// to target 90-100% page utilization (preferred 95-99%).
// ---------------------------------------------------------------------------

interface LayoutProfile {
  name: "light" | "standard" | "content-heavy";
  margins: { top: string; bottom: string; left: string; right: string };
  enlargePage: number;        // \enlargethispage{N\baselineskip}: 0-8
  sectionTopSpacing: string;  // 3pt-7pt
  ruleSpacingAfter: string;   // 1pt-4pt
  jobEntrySpace: string;      // 1pt-4pt
  itemLeftMargin: string;     // 0.16in-0.22in
  itemSep: string;            // 0pt-1pt
  itemTopSep: string;         // 0pt-2pt
  listEndSpace: string;       // 1pt-3pt
  headerBottomSpace: string;  // 0pt-4pt
  nameSize: "\\Large" | "\\large" | "\\LARGE";
}

const LAYOUT_PROFILES: Record<LayoutProfile["name"], LayoutProfile> = {
  // Too empty: light-content margins, more breathing room, bigger name
  light: {
    name: "light",
    margins: { top: "0.60in", bottom: "0.60in", left: "0.60in", right: "0.60in" },
    enlargePage: 0,
    sectionTopSpacing: "7pt",
    ruleSpacingAfter: "4pt",
    jobEntrySpace: "4pt",
    itemLeftMargin: "0.22in",
    itemSep: "1pt",
    itemTopSep: "2pt",
    listEndSpace: "3pt",
    headerBottomSpace: "4pt",
    nameSize: "\\LARGE",
  },
  // Baseline — exact values from the layout spec
  standard: {
    name: "standard",
    margins: { top: "0.45in", bottom: "0.45in", left: "0.55in", right: "0.55in" },
    enlargePage: 3,
    sectionTopSpacing: "5pt",
    ruleSpacingAfter: "3pt",
    jobEntrySpace: "3pt",
    itemLeftMargin: "0.2in",
    itemSep: "0.5pt",
    itemTopSep: "1pt",
    listEndSpace: "2pt",
    headerBottomSpace: "2pt",
    nameSize: "\\Large",
  },
  // Too full: content-heavy margins, tightest allowed spacing
  "content-heavy": {
    name: "content-heavy",
    margins: { top: "0.35in", bottom: "0.35in", left: "0.50in", right: "0.50in" },
    enlargePage: 8,
    sectionTopSpacing: "3pt",
    ruleSpacingAfter: "1pt",
    jobEntrySpace: "1pt",
    itemLeftMargin: "0.16in",
    itemSep: "0pt",
    itemTopSep: "0pt",
    listEndSpace: "1pt",
    headerBottomSpace: "0pt",
    nameSize: "\\large",
  },
};

/** Approximate characters that fit on one rendered line at \small/10pt. */
const CHARS_PER_LINE = 100;
/** Estimated usable text lines on one page with standard margins. */
const LIGHT_THRESHOLD_LINES = 32;
const HEAVY_THRESHOLD_LINES = 42;

function _textLines(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
}

/**
 * Estimate how many rendered lines the resume content occupies, then pick
 * the margin/spacing profile that pushes page utilization toward 90-100%.
 */
function selectLayoutProfile(
  careerMemory: CareerMemory,
  strategy: ResumeStrategy,
  summaryText: string
): LayoutProfile {
  let lines = 4; // header block (name + contact + breathing room)

  lines += _textLines(summaryText) + 2; // summary + its section header

  const includedIds = new Set(
    strategy.workHistoryInScope.filter((w) => w.include).map((w) => w.workHistoryId)
  );
  const jobs = careerMemory.jobs.filter((j) => includedIds.has(j.id));
  lines += 2; // experience section header
  for (const job of jobs) {
    lines += 2.5; // job entry rows + surrounding space
    const generated = job.bullets.filter((b) => b.contentType === "GENERATED");
    const source = generated.length > 0 ? generated : job.bullets;
    const target =
      strategy.workHistoryInScope.find((w) => w.workHistoryId === job.id)
        ?.bulletCountTarget ?? 4;
    for (const b of source.slice(0, target)) {
      lines += _textLines(b.content);
    }
  }

  if (careerMemory.skills.length > 0) {
    const categories = new Set(careerMemory.skills.map((s) => s.category ?? "Other"));
    lines += 2 + categories.size;
  }
  if (careerMemory.education.length > 0 || careerMemory.certifications.length > 0) {
    lines += 2 + careerMemory.education.length * 1.5;
    if (careerMemory.certifications.length > 0) lines += 1.5;
  }
  if (careerMemory.projects && careerMemory.projects.length > 0) {
    lines += 2 + careerMemory.projects.length * 2;
  }

  if (lines < LIGHT_THRESHOLD_LINES) return LAYOUT_PROFILES.light;
  if (lines > HEAVY_THRESHOLD_LINES) return LAYOUT_PROFILES["content-heavy"];
  return LAYOUT_PROFILES.standard;
}

// ---------------------------------------------------------------------------
// Document wrapper — baseline from docs/latex-layout-baseline.md with the
// selected adaptive profile applied
// ---------------------------------------------------------------------------

function wrapDocument(body: string, header: string, profile: LayoutProfile): string {
  return `\\documentclass[letterpaper,10pt]{article}
%% Adaptive layout profile: ${profile.name} (docs/latex-layout-baseline.md)

%% Packages — layout baseline
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{cmap}
\\usepackage{latexsym}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{palatino}
\\usepackage{microtype}

%% Margins — ${profile.name} profile
\\usepackage[
  top=${profile.margins.top}, bottom=${profile.margins.bottom},
  left=${profile.margins.left}, right=${profile.margins.right}
]{geometry}

%% Page setup — layout baseline
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\setlength{\\parindent}{0pt}

%% Section headers — adaptive within 3pt-7pt top / 1pt-4pt rule spacing
\\titleformat{\\section}
  {\\scshape\\normalsize\\bfseries}
  {}{0em}{}
  [\\vspace{1pt}\\titlerule\\vspace{${profile.ruleSpacingAfter}}]
\\titlespacing*{\\section}{0pt}{${profile.sectionTopSpacing}}{0pt}

%% Custom commands — adaptive within spec ranges
\\newcommand{\\resumeItem}[1]{
  \\item{\\small #1}
}

\\newcommand{\\jobEntry}[4]{
  \\vspace{${profile.jobEntrySpace}}
  \\begin{tabular*}{0.98\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{\\small #1} & {\\small #2} \\\\[1pt]
    \\textit{\\small #3} & {\\small #4} \\\\
  \\end{tabular*}
  \\vspace{1pt}
}

\\newcommand{\\itemListStart}{
  \\begin{itemize}[leftmargin=${profile.itemLeftMargin}, itemsep=${profile.itemSep}, topsep=${profile.itemTopSep}, parsep=0pt]
}
\\newcommand{\\itemListEnd}{\\end{itemize}\\vspace{${profile.listEndSpace}}}

%% Tight list spacing fallback for non-job lists
\\setlist[itemize]{leftmargin=${profile.itemLeftMargin}, itemsep=${profile.itemSep}, topsep=${profile.itemTopSep}, parsep=0pt}

\\begin{document}
\\enlargethispage{${profile.enlargePage}\\baselineskip}

${header}

${body}

\\end{document}
`;
}

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

export interface LatexGeneratorInput {
  careerMemory: CareerMemory;
  strategy:     ResumeStrategy;
  summaryText:  string;         // from Summary Writer agent
  resumeHeader?: ResumeHeader | null;
}

export interface ResumeHeader {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  location?: string | null;
}

/**
 * Generate a complete XeLaTeX source document from structured resume data.
 *
 * This is template-based — no LLM calls. Fast and deterministic.
 * The output is passed to the LaTeX worker for compilation.
 *
 * Placeholder tokens in the header ([Full Name], [email], etc.)
 * are replaced by the workspace editor (A8) when the user reviews.
 * This is intentional — the system never stores or embeds PII in generated
 * source files outside the user's session.
 *
 * @param input   Structured resume data
 * @returns       Complete XeLaTeX source string
 */
export function generateLatexSource(input: LatexGeneratorInput): string {
  const { careerMemory, strategy, summaryText, resumeHeader } = input;

  // Pick the adaptive layout profile from estimated content density
  // (docs/latex-layout-baseline.md — target 90-100% page utilization)
  const profile = selectLayoutProfile(careerMemory, strategy, summaryText);

  const header = generateHeader(careerMemory, profile.nameSize, profile.headerBottomSpace, resumeHeader);
  const body   = assembleSections(careerMemory, strategy, summaryText);

  return wrapDocument(body, header, profile);
}
