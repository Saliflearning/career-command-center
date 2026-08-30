const MIN_JD_CHARS = 50;
const MAX_ROLE_CHARS = 160;
const MAX_COMPANY_CHARS = 160;

const TITLE_WORDS = /\b(associate|assistant|senior|junior|lead|principal|manager|specialist|analyst|engineer|developer|designer|consultant|coordinator|director|architect|scientist|administrator|supervisor|officer|product|program|project|data|ai|cloud|software|security|operations|recruiter|marketing|sales|nurse|physician|therapist|teacher|educator|accountant|auditor|controller|counselor|attorney|paralegal|technician|mechanic|electrician|planner|buyer|writer|editor)\b/i;
const TITLE_FALSE_STARTS = /^(strong|excellent|exceptional|demonstrated|proven|preferred|required|minimum|ability|abilities|knowledge|experience|experienced|proficiency|skilled|effective|outstanding|solid|good|deep|advanced|responsible)\b/i;
const LEGAL_COMPANY_SUFFIX = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLC|Company|Co\.)$/i;
const COMPANY_IDENTITY_SUFFIX = /\b(?:Partners|Holdings|Group|Brands|Industries|Enterprises|Solutions|Services|Systems|Technologies|Consulting|Hospital|Healthcare|Health|Labs|Studios|Agency|Associates|University|College|Bank|Foundation|Network|County|Government|Department)$/i;
const GENERIC_LISTING_HEADING = /^(?:about(?: us| the (?:company|team|role))?|company overview|job overview|overview|position summary|role purpose|position purpose|job summary|education|skills|certifications|duties|requirements|qualifications|responsibilities|schedule|location|application questions?|language|shift availability|work location|who we are|what we do|our (?:company|mission|team|story|culture|values|purpose)|the opportunity)$/i;
const INTRODUCTORY_PROSE_START = /^(?:we\b|you\b|this (?:role|position|job|team|company)\b|the (?:role|position|job|candidate|successful candidate|supervisor|manager|employee|team)\b)/i;
const RESPONSIBILITY_PROSE_START = /^(?:administer|analyze|build|compile|conduct|coordinate|create|deliver|design|develop|document|evaluate|implement|lead|maintain|manage|monitor|own|perform|prepare|provide|research|review|support|track|uphold|write)\b/i;

export type DetectedJobDetails = {
  role: string;
  company: string;
};

export function inferJobDetails(jd: string): DetectedJobDetails {
  if (jd.trim().length < MIN_JD_CHARS) return { role: "", company: "" };

  // Preserve listing rows. Splitting prose into sentence fragments makes qualification
  // phrases look like headers and was the source of false titles such as "Strong Operational".
  const lines = jd
    .split(/\r?\n/)
    .map(cleanJobLine)
    .filter(Boolean)
    .slice(0, 80);

  const lineHeadline = lines
    .map((line) => line.match(/^(.{4,120}?)\s+at\s+(.{2,80})$/i))
    .find((match): match is RegExpMatchArray => Boolean(
      match && looksLikeRoleTitle(match[1]) && looksLikeCompanyName(match[2])
    ));
  const inlineHeadlineMatch = jd.trim().match(
    /^(.{4,120}?)\s+at\s+(.{2,80}?)(?=[.!?](?:\s|$)|\r?\n|$)/i
  );
  const inlineHeadline = inlineHeadlineMatch
    && looksLikeRoleTitle(inlineHeadlineMatch[1])
    && looksLikeCompanyName(inlineHeadlineMatch[2])
      ? inlineHeadlineMatch
      : null;
  const headline = lineHeadline ?? inlineHeadline;
  const explicitRoleCandidate = matchFirst(jd, [
    /\b(?:job title|position|role|title)\s*[:\-]\s*([^\n\r|]+)/i,
    /^(.{4,120}?)\s*[-\u2013\u2014]\s*job\s+post\b/im,
    /^([A-Z][^\n\r.!?]{3,80})[.!?](?=\s|$)/,
  ]);
  // A job-board logo row can be the first punctuated sentence. Validate the
  // candidate before it participates in fallback selection so invalid header
  // text cannot mask a real role title on a later line.
  const explicitRole = looksLikeRoleTitle(cleanJobLine(explicitRoleCandidate))
    ? explicitRoleCandidate
    : "";
  const narrativeRole = matchFirst(jd, [
    /\bwe(?:'re| are)\s+(?:hiring|looking for|seeking)\s+(?:an?|the)?\s*([^\n\r.]+)/i,
  ]);
  const roleIndex = lines.findIndex((line) =>
    looksLikeRoleTitle(line) && !looksLikeStrongCompanyName(line)
  );
  const role = titleCaseRole(
    cleanJobLine(
      headline?.[1]
        || explicitRole
        || (roleIndex >= 0 ? lines[roleIndex] : "")
        || narrativeRole
        || inferRoleFromSignals(jd)
    )
  );

  const explicitCompany = matchFirst(jd, [
    /\b(?:company|employer|organization)\s*[:\-]\s*([^\n\r|]+)/i,
  ]);
  const legalCompany = lines.find((line) => LEGAL_COMPANY_SUFFIX.test(line) && looksLikeCompanyName(line));
  const strongCompany = inferStrongCompanyFromLines(lines, roleIndex);
  const company = cleanCompanyName(
    headline?.[2]
      || explicitCompany
      || legalCompany
      || strongCompany
      || inferCompanyFromLines(lines, roleIndex)
      || inferCompanyFromSignals(jd)
  );

  return { role, company };
}

function matchFirst(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function inferCompanyFromLines(lines: string[], roleIndex: number) {
  const nearRole = roleIndex >= 0
    ? [...lines.slice(roleIndex + 1, roleIndex + 5), ...lines.slice(Math.max(0, roleIndex - 2), roleIndex)]
    : [];
  return nearRole
    .filter((line) => !looksLikeRoleTitle(line) || looksLikeStrongCompanyName(line))
    .find(looksLikeCompanyName) ?? "";
}

function inferStrongCompanyFromLines(lines: string[], roleIndex: number) {
  const headerCandidates = roleIndex >= 0
    ? [
        ...lines.slice(Math.max(0, roleIndex - 2), roleIndex),
        ...lines.slice(roleIndex + 1, roleIndex + 4),
      ]
    : lines.slice(0, 3);
  return headerCandidates.find(looksLikeStrongCompanyName) ?? "";
}

function inferRoleFromSignals(jd: string) {
  const normalized = jd.toLowerCase();
  const signalRoles = [
    { role: "Customer Engagement Manager", signals: ["customer engagement", "customer adoption", "c-suite", "cloud computing", "project delivery"] },
    { role: "Customer Success Manager", signals: ["customer success", "customer adoption", "renewal", "account health"] },
    { role: "Cloud Solutions Architect", signals: ["cloud architecture", "solution architecture", "aws", "azure", "technical architecture"] },
    { role: "Technical Account Manager", signals: ["technical account", "enterprise customer", "customer outcomes", "cloud operations"] },
  ];
  return signalRoles.find((candidate) =>
    candidate.signals.filter((signal) => normalized.includes(signal)).length >= 2
  )?.role ?? "";
}

function inferCompanyFromSignals(jd: string) {
  const normalized = jd.toLowerCase();
  if (/\bamazon web services\b|\baws\b/.test(normalized)) return "Amazon Web Services";
  if (/\bmicrosoft azure\b|\bazure\b/.test(normalized)) return "Microsoft";
  if (/\bgoogle cloud\b|\bgcp\b/.test(normalized)) return "Google Cloud";
  return "";
}

function cleanJobLine(line: string) {
  const normalized = line
    .replace(/^company\s+logo\s+for\s*,?\s*/i, "")
    .replace(/^logo\s+for\s*,?\s*/i, "")
    .replace(/\blogo\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const withoutSentencePunctuation = /\b(?:Inc|Corp|Ltd|Co)\.$/i.test(normalized)
    ? normalized
    : normalized.replace(/[.!?]+$/g, "");
  return withoutSentencePunctuation
    .replace(/^[\-:|]+|[\-:|]+$/g, "")
    .trim();
}

function cleanCompanyName(value: string) {
  const cleaned = cleanJobLine(value)
    .replace(/\b(is hiring|careers|jobs)\b.*$/i, "")
    .trim();
  return looksLikeCompanyName(cleaned) ? cleaned.slice(0, MAX_COMPANY_CHARS) : "";
}

function looksLikeCompanyName(value: string) {
  if (!value || value.length > 80 || value.trim().split(/\s+/).length > 9) return false;
  if (/^(confidential)$/i.test(value)) return true;
  if (/^(saved|share|apply|posted|job details|benefits|pay|job type|full job description|reviews?|hybrid|remote|full[ -]?time|part[ -]?time)$/i.test(value)) return false;
  if (/^(?:responses? managed|people clicked apply|job match|tailor my resume|help me stand out|create cover letter)\b/i.test(value)) return false;
  if (/^\d+(?:\.\d+)?\s+out of\s+\d+\s+stars?$/i.test(value) || /^\d+\s+reviews?$/i.test(value)) return false;
  if (/\$|\b(?:a year|an hour|full-time|part-time|remote|hybrid|onsite)\b/i.test(value)) return false;
  if (/^[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(value)) return false;
  if (/\b(responsibilities|requirements|qualifications|candidate|salary|benefits|job details|description)\b/i.test(value)) return false;
  if (GENERIC_LISTING_HEADING.test(value)) return false;
  if (TITLE_FALSE_STARTS.test(value)) return false;
  if (RESPONSIBILITY_PROSE_START.test(value)) return false;
  if (LEGAL_COMPANY_SUFFIX.test(value)) return true;
  if (INTRODUCTORY_PROSE_START.test(value)) return false;
  return /^[A-Z][A-Za-z0-9&.,' -]{1,60}$/.test(value)
    || hasStylizedCompanyCapitalization(value);
}

function looksLikeStrongCompanyName(value: string) {
  if (!looksLikeCompanyName(value)) return false;
  return /^(?:confidential)$/i.test(value)
    || LEGAL_COMPANY_SUFFIX.test(value)
    || COMPANY_IDENTITY_SUFFIX.test(value)
    || hasStylizedCompanyCapitalization(value);
}

function hasStylizedCompanyCapitalization(value: string) {
  const words = value.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length < 2) return false;
  const emphaticWords = words.filter((word) => {
    const letters = word.replace(/[^A-Za-z]/g, "");
    if (letters.length < 2) return false;
    const uppercase = (letters.match(/[A-Z]/g) ?? []).length;
    return uppercase / letters.length >= 0.65;
  });
  const lowercaseLeadingBrand = /^[a-z][A-Z]{2,}/.test(words[0]);
  return emphaticWords.length >= 2 || (lowercaseLeadingBrand && emphaticWords.length >= 1);
}

function looksLikeRoleTitle(value: string) {
  if (!value || value.length > 120 || TITLE_FALSE_STARTS.test(value)) return false;
  if (/\b(?:skills?|experience|required|preferred|qualifications?|responsibilities|benefits|salary|reviews?|stars?)\b/i.test(value)) return false;
  if (/\$|\d{5}/.test(value)) return false;
  const withoutJobPost = value.replace(/\s*[-\u2013\u2014]\s*job\s+post\b.*$/i, "").trim();
  const wordCount = withoutJobPost.split(/\s+/).length;
  return wordCount >= 2 && wordCount <= 14 && TITLE_WORDS.test(withoutJobPost);
}

function titleCaseRole(value: string) {
  if (!value) return "";
  const titleOnly = value
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s*[-|]\s*job\s+post\b.*$/i, "")
    .replace(/\s+(?:to|who|that|with|will)\s+.*$/i, "")
    .trim();
  if (!looksLikeRoleTitle(titleOnly)) return "";
  return titleOnly
    .split(" ")
    .map((word) => word.replace(/[A-Za-z]+/g, (part) =>
      /^(AI|ML|LLM|UX|UI|IT|HR|QA|SQL|AWS|API|CSM)$/i.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ))
    .join(" ")
    .slice(0, MAX_ROLE_CHARS)
    .trim();
}
