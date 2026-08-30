// ---------------------------------------------------------------------------
// Intake Agent
//
// Parses an uploaded resume file (PDF, DOCX, plain text) into raw text,
// then splits the output into four canonical blocks:
//
//   HEADER BLOCK     — name, contact, links
//   EXPERIENCE BLOCK — work history entries
//   EDUCATION BLOCK  — degrees and certifications
//   SKILLS BLOCK     — skills, tools, technologies
//
// If native PDF text extraction produces garbage (< 100 chars per page),
// the agent re-tries with an OCR-style prompt.
//
// All LLM calls go through the central router.
// ---------------------------------------------------------------------------

import { route } from "@/lib/ai/router";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntakeBlocks {
  header: string;
  experience: string;
  education: string;
  skills: string;
}

type SectionKey = "summary" | "experience" | "education" | "skills" | "certifications";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a precise resume parser. Your job is to extract and organize text from a resume.
You will receive raw text from a resume file. Your output must be valid JSON with exactly four keys:
  "header"     – name, email, phone, LinkedIn, GitHub, location, and any other contact/identity information
  "experience" – all work history entries, including company names, titles, dates, and bullet points
  "education"  – all education entries: degrees, schools, graduation years, GPA if present
  "skills"     – all skill/tool/technology mentions

Rules:
- Preserve the original wording exactly — do not rephrase or summarize
- If a section is absent in the resume, return an empty string for that key
- Output only the JSON object, no markdown fences or commentary
- Deduplicate content that appears in multiple sections`;

const OCR_FALLBACK_PROMPT = `The resume text you received may be garbled or incomplete due to PDF extraction issues.
Apply OCR-style reconstruction: fix obvious character transpositions, re-join hyphenated line breaks,
and normalize whitespace. Then extract and return the same JSON structure as instructed.`;

// ---------------------------------------------------------------------------
// runIntake
// ---------------------------------------------------------------------------

/**
 * Parse an uploaded resume file into structured raw-text blocks.
 *
 * @param resumeId   - Resume record ID (used for logging)
 * @param fileBuffer - Raw file bytes
 * @param mimeType   - MIME type of the file (e.g. "application/pdf")
 * @returns Combined raw text string (all blocks concatenated for storage)
 */
export async function runIntake(
  resumeId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  // Step 1: Extract raw text from the buffer
  const extractedText = await extractText(fileBuffer, mimeType);
  const rawText = prepareExtractedResumeText(extractedText);

  console.log(
    JSON.stringify({
      event: "intake_extracted",
      resumeId,
      mimeType,
      fileBytes: fileBuffer.length,
      extractedChars: rawText.length,
      preview: rawText.slice(0, 200),
      timestamp: new Date().toISOString(),
    })
  );

  // Fail loudly when extraction produced nothing — a scanned/image-only
  // PDF can't go further without real OCR.
  if (rawText.trim().length < 50) {
    throw new Error(
      "Could not extract text from the uploaded file. " +
      "If this is a scanned or image-based PDF, paste the resume text instead."
    );
  }

  // Step 2: OCR-style cleanup prompt only for genuinely garbled text.
  // (Char-per-KB density is NOT a reliable signal — image-heavy PDFs with a
  // perfect text layer have low density and were wrongly sent down this path.)
  const printableRatio =
    (rawText.match(/[\x20-\x7E\n\r\t]/g)?.length ?? 0) / rawText.length;
  const needsOcr = printableRatio < 0.7;

  if (!needsOcr) {
    const deterministicBlocks = buildDeterministicIntakeBlocks(rawText);
    if (deterministicBlocks) {
      console.log(
        JSON.stringify({
          event: "intake_deterministic_sectionizer",
          resumeId,
          blockLengths: {
            header: deterministicBlocks.header.length,
            experience: deterministicBlocks.experience.length,
            education: deterministicBlocks.education.length,
            skills: deterministicBlocks.skills.length,
          },
          timestamp: new Date().toISOString(),
        })
      );
      return formatBlocks(deterministicBlocks);
    }
  }

  const userContent = needsOcr
    ? `${OCR_FALLBACK_PROMPT}\n\nRaw text:\n${rawText}`
    : `Parse the following resume text:\n\n${rawText}`;

  // Step 3: Route through the AI router (tier1 for intake)
  const result = await route({
    tier: "tier1",
    agent: "intake",
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 4096,
  });

  // Step 4: Parse the JSON response
  let blocks: IntakeBlocks;
  try {
    blocks = parseIntakeResponse(result.content);
  } catch {
    // If JSON parsing fails, treat entire response as experience block
    console.log(
      JSON.stringify({
        event: "intake_parse_error",
        resumeId,
        provider: result.provider,
        contentLength: result.content.length,
        responsePreview: result.content.slice(0, 300),
        timestamp: new Date().toISOString(),
      })
    );
    blocks = {
      header: "",
      experience: result.content,
      education: "",
      skills: "",
    };
  }

  // If the model claims the resume is empty but we clearly extracted text,
  // fall back to passing the raw text through as the experience block so
  // the normalizer gets a chance instead of the pipeline dying downstream.
  const totalBlockChars =
    blocks.header.length + blocks.experience.length +
    blocks.education.length + blocks.skills.length;
  if (totalBlockChars < 50 && rawText.trim().length >= 50) {
    console.log(
      JSON.stringify({
        event: "intake_empty_blocks_fallback",
        resumeId,
        provider: result.provider,
        rawTextChars: rawText.length,
        responsePreview: result.content.slice(0, 300),
        timestamp: new Date().toISOString(),
      })
    );
    blocks = { header: "", experience: rawText, education: "", skills: "" };
  }

  // Step 5: Produce a labelled combined string for DB storage
  const combinedText = formatBlocks(blocks);

  console.log(
    JSON.stringify({
      event: "intake_complete",
      resumeId,
      provider: result.provider,
      usedFallback: result.usedFallback,
      usedOcr: needsOcr,
      tokensUsed: result.tokensUsed,
      blockLengths: {
        header: blocks.header.length,
        experience: blocks.experience.length,
        education: blocks.education.length,
        skills: blocks.skills.length,
      },
      timestamp: new Date().toISOString(),
    })
  );

  return combinedText;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Cap extracted text so a long document cannot blow the LLM context window. */
const MAX_EXTRACTED_CHARS = 30_000;

const SECTION_HEADING_PATTERNS: Array<{ key: SectionKey; pattern: RegExp }> = [
  { key: "summary", pattern: /^(?:professional\s+summary|summary|profile|career\s+summary)$/i },
  { key: "skills", pattern: /^(?:core\s+skills|skills|technical\s+skills|key\s+skills|competencies)$/i },
  { key: "experience", pattern: /^(?:professional\s+experience|work\s+experience|experience|employment\s+history|career\s+history)$/i },
  { key: "education", pattern: /^(?:education|academic\s+background)$/i },
  { key: "certifications", pattern: /^(?:certifications|certification|licenses|licenses\s+and\s+certifications)$/i },
];

const SECTION_HEADING_INSERTIONS = [
  "PROFESSIONAL SUMMARY",
  "SUMMARY",
  "PROFILE",
  "CORE SKILLS",
  "TECHNICAL SKILLS",
  "SKILLS",
  "PROFESSIONAL EXPERIENCE",
  "WORK EXPERIENCE",
  "EXPERIENCE",
  "EDUCATION",
  "CERTIFICATIONS",
  "LICENSES AND CERTIFICATIONS",
];

/**
 * PDF text layers often arrive as one dense line. Restore enough structure
 * before the LLM sees it so dates, bullets, and section boundaries survive.
 */
export function prepareExtractedResumeText(text: string): string {
  let normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/ï‚·/g, "\n- ")
    .replace(/[•●▪◦]/g, "\n- ")
    .replace(/\s+/g, " ")
    .trim();

  for (const heading of SECTION_HEADING_INSERTIONS) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(
      new RegExp(`\\s+(${escaped})\\s+`, "g"),
      "\n$1\n"
    );
  }

  normalized = normalized
    .replace(/\s+(?=[A-Z][A-Za-z&.,' -]+\s+\|\s+[A-Za-z .]+,\s+[A-Z]{2}\s+\|\s+(?:\d{4}|[A-Za-z]{3,9}\s+\d{4}))/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.slice(0, MAX_EXTRACTED_CHARS);
}

/**
 * For conventional resumes, deterministic sectioning is more faithful and
 * faster than asking an LLM to rediscover obvious headings from raw text.
 * If headings are weak or missing, return null and fall back to the LLM intake.
 */
export function buildDeterministicIntakeBlocks(text: string): IntakeBlocks | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headings = lines
    .map((line, index) => ({ index, key: classifySectionHeading(line) }))
    .filter((entry): entry is { index: number; key: SectionKey } => entry.key !== null);

  const firstExperience = headings.find((entry) => entry.key === "experience");
  if (!firstExperience) return null;

  const firstHeadingIndex = headings[0]?.index ?? firstExperience.index;
  const header = lines.slice(0, firstHeadingIndex).join("\n").trim();
  const sections = new Map<SectionKey, string[]>();

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    const next = headings[i + 1];
    const body = lines.slice(current.index + 1, next?.index ?? lines.length);
    const existing = sections.get(current.key) ?? [];
    sections.set(current.key, [...existing, ...body]);
  }

  const experience = (sections.get("experience") ?? []).join("\n").trim();
  const education = [
    ...(sections.get("education") ?? []),
    ...(sections.get("certifications") ?? []),
  ].join("\n").trim();
  const skills = (sections.get("skills") ?? []).join("\n").trim();

  if (experience.length < 80) return null;
  if (header.length < 10 && education.length < 20 && skills.length < 20) return null;

  return { header, experience, education, skills };
}

function classifySectionHeading(line: string): SectionKey | null {
  const normalized = line
    .replace(/[:\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length > 40) return null;
  for (const { key, pattern } of SECTION_HEADING_PATTERNS) {
    if (pattern.test(normalized)) return key;
  }
  return null;
}

/**
 * Extract plain text from the file buffer based on MIME type.
 * PDF uses pdf-parse (pdfjs text layer); DOCX uses mammoth. Scanned PDFs
 * with no text layer produce short output, which triggers the OCR-style
 * fallback prompt in the caller.
 */
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const mime = mimeType.toLowerCase();

  if (mime === "text/plain") {
    return buffer.toString("utf-8").slice(0, MAX_EXTRACTED_CHARS);
  }

  if (mime === "application/pdf") {
    // unpdf ships a serverless-ready pdf.js build — no DOM globals
    // (DOMMatrix etc.) required, unlike pdf-parse v2.
    const { extractText: extractPdfText } = await import("unpdf");
    const { text } = await extractPdfText(new Uint8Array(buffer), {
      mergePages: true,
    });
    return text.trim().slice(0, MAX_EXTRACTED_CHARS);
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim().slice(0, MAX_EXTRACTED_CHARS);
  }

  // Unknown type: try UTF-8 decode; if it is binary, OCR fallback will handle it
  return buffer.toString("utf-8").slice(0, MAX_EXTRACTED_CHARS);
}

export async function extractResumeText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  return prepareExtractedResumeText(await extractText(buffer, mimeType));
}

function parseIntakeResponse(raw: string): IntakeBlocks {
  // Strip potential markdown code fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  return {
    header: typeof parsed.header === "string" ? parsed.header : "",
    experience: typeof parsed.experience === "string" ? parsed.experience : "",
    education: typeof parsed.education === "string" ? parsed.education : "",
    skills: typeof parsed.skills === "string" ? parsed.skills : "",
  };
}

function formatBlocks(blocks: IntakeBlocks): string {
  return [
    "=== HEADER BLOCK ===",
    blocks.header,
    "",
    "=== EXPERIENCE BLOCK ===",
    blocks.experience,
    "",
    "=== EDUCATION BLOCK ===",
    blocks.education,
    "",
    "=== SKILLS BLOCK ===",
    blocks.skills,
  ].join("\n");
}
