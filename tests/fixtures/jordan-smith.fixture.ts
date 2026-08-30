/**
 * jordan-smith.fixture.ts — Canonical demo user fixture
 *
 * Jordan Smith is the reference persona for:
 *   - Orchestrator unit tests
 *   - Pipeline E2E acceptance tests
 *   - Recruiter Sim agent tests
 *   - Visual QA regression tests
 *   - Workspace demo mode (when no real user data exists)
 *   - Latency benchmarks
 *
 * Jordan is a Senior Product Manager (Stripe, Airbnb, Intuit) with a Stanford MS.
 * The fixture mirrors what the Normalizer agent would produce from the raw resume
 * in tests/fixtures/sample-resume.txt.
 *
 * Import everything from this file — don't import from expected-career-memory.json
 * in new tests (this typed version supersedes it).
 */

import type { CareerMemory } from "@lib/types/career-memory";
import type { JDAnalysis }   from "@lib/types/jd-analysis";
import type { ResumeStrategy } from "@lib/types/resume-strategy";

// ── Identity ─────────────────────────────────────────────────────────────────

export const JORDAN_USER_ID   = "user-jordan-smith";
export const JORDAN_RESUME_ID = "resume-jordan-smith-001";
export const JORDAN_CM_ID     = "cm-jordan-smith";

export const JORDAN_PROFILE = {
  name:     "Jordan Smith",
  email:    "jordan.smith@example.com",
  phone:    "(415) 555-0192",
  linkedin: "linkedin.com/in/jordansmith",
  location: "San Francisco, CA",
} as const;

// ── Work History IDs ─────────────────────────────────────────────────────────

export const WH_STRIPE  = "wh-jordan-stripe";
export const WH_AIRBNB  = "wh-jordan-airbnb";
export const WH_INTUIT  = "wh-jordan-intuit";

// ── Bullet IDs ───────────────────────────────────────────────────────────────

export const BULLETS = {
  stripe: {
    b1: "bullet-stripe-onboarding",
    b2: "bullet-stripe-crossfunc",
    b3: "bullet-stripe-okr",
    b4: "bullet-stripe-tax",
    b5: "bullet-stripe-churn",
  },
  airbnb: {
    b1: "bullet-airbnb-hosttools",
    b2: "bullet-airbnb-pricing",
    b3: "bullet-airbnb-abtest",
    b4: "bullet-airbnb-healthscore",
    b5: "bullet-airbnb-prd",
  },
  intuit: {
    b1: "bullet-intuit-apm",
    b2: "bullet-intuit-quickbooks",
    b3: "bullet-intuit-mint",
    b4: "bullet-intuit-sprint",
  },
} as const;

// ── Canonical CareerMemory ───────────────────────────────────────────────────

export const JORDAN_CAREER_MEMORY: CareerMemory = {
  id:      JORDAN_CM_ID,
  userId:  JORDAN_USER_ID,
  version: 1,

  jobs: [
    {
      id:             WH_STRIPE,
      company:        "Stripe",
      title:          "Senior Product Manager",
      startDate:      "2021-03-01T00:00:00.000Z",
      endDate:        null,
      current:        true,
      location:       "San Francisco, CA",
      employmentType: "Full-Time",
      sourceType:     "UPLOADED",
      verified:       true,
      locked:         false,
      sortOrder:      0,
      bullets: [
        {
          id:                "bullet-stripe-1",
          content:           "Led the redesign of the Stripe Dashboard onboarding flow, reducing time-to-first-charge from 4.2 days to 1.8 days for new merchants",
          contentType:       "VERIFIED",
          metrics:           ["4.2 days", "1.8 days"],
          keywords:          ["onboarding", "product redesign", "merchant"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-stripe-2",
          content:           "Managed a cross-functional team of 8 engineers, 2 designers, and 1 data analyst across three time zones",
          contentType:       "VERIFIED",
          metrics:           ["8 engineers", "2 designers", "1 data analyst"],
          keywords:          ["cross-functional", "team management"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-stripe-3",
          content:           "Defined and owned the OKR framework for the Merchant Growth squad, tracking 12 KPIs across 3 product lines",
          contentType:       "VERIFIED",
          metrics:           ["12 KPIs", "3 product lines"],
          keywords:          ["OKR", "KPI", "growth"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-stripe-4",
          content:           "Launched Stripe Tax in 4 new markets (Canada, Australia, Germany, France), generating $2M in incremental ARR within 6 months",
          contentType:       "VERIFIED",
          metrics:           ["4 markets", "$2M ARR", "6 months"],
          keywords:          ["launch", "international expansion", "ARR", "fintech"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-stripe-5",
          content:           "Collaborated with Sales and Customer Success to reduce merchant churn by 18% through proactive feature adoption campaigns",
          contentType:       "VERIFIED",
          metrics:           ["18%"],
          keywords:          ["churn reduction", "retention", "cross-functional"],
          locked:            false,
          usedInResumeCount: 0,
        },
      ],
    },
    {
      id:             WH_AIRBNB,
      company:        "Airbnb",
      title:          "Product Manager",
      startDate:      "2018-07-01T00:00:00.000Z",
      endDate:        "2021-02-28T00:00:00.000Z",
      current:        false,
      location:       "San Francisco, CA",
      employmentType: "Full-Time",
      sourceType:     "UPLOADED",
      verified:       true,
      locked:         false,
      sortOrder:      1,
      bullets: [
        {
          id:                "bullet-airbnb-1",
          content:           "Owned the Host Tools product area, serving 4 million active hosts globally",
          contentType:       "VERIFIED",
          metrics:           ["4 million active hosts"],
          keywords:          ["product ownership", "scale", "global"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-airbnb-2",
          content:           "Shipped the Smart Pricing 2.0 feature, which increased host revenue by an average of 12% per booking",
          contentType:       "VERIFIED",
          metrics:           ["12%"],
          keywords:          ["pricing", "revenue growth", "feature launch"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-airbnb-3",
          content:           "Ran 40+ A/B experiments per quarter using internal experimentation platform; maintained a 34% win rate",
          contentType:       "VERIFIED",
          metrics:           ["40+", "34% win rate"],
          keywords:          ["A/B testing", "experimentation", "data-driven"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-airbnb-4",
          content:           "Partnered with Data Science to build a host health score model that identified at-risk hosts 30 days earlier than previous heuristics",
          contentType:       "VERIFIED",
          metrics:           ["30 days"],
          keywords:          ["data science", "predictive modeling", "retention"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-airbnb-5",
          content:           "Wrote PRDs, launch plans, and stakeholder readouts for executive review; presented quarterly to VP and CPO",
          contentType:       "VERIFIED",
          metrics:           [],
          keywords:          ["PRD", "executive communication", "stakeholder management"],
          locked:            false,
          usedInResumeCount: 0,
        },
      ],
    },
    {
      id:             WH_INTUIT,
      company:        "Intuit",
      title:          "Associate Product Manager",
      startDate:      "2016-08-01T00:00:00.000Z",
      endDate:        "2018-06-30T00:00:00.000Z",
      current:        false,
      location:       "Mountain View, CA",
      employmentType: "Full-Time",
      sourceType:     "UPLOADED",
      verified:       true,
      locked:         false,
      sortOrder:      2,
      bullets: [
        {
          id:                "bullet-intuit-1",
          content:           "Rotated across QuickBooks Online, TurboTax, and Mint over 24 months in the APM Program",
          contentType:       "VERIFIED",
          metrics:           ["24 months"],
          keywords:          ["rotational program", "APM"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-intuit-2",
          content:           "Reduced QuickBooks invoice creation time by 22% through a simplified UX flow (basic SQL used for analysis)",
          contentType:       "VERIFIED",
          metrics:           ["22%"],
          keywords:          ["UX", "product improvement", "QuickBooks", "SQL"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-intuit-3",
          content:           "Built the business case for Mint's bill negotiation feature, which reached 250K users in first 6 months",
          contentType:       "VERIFIED",
          metrics:           ["250K users", "6 months"],
          keywords:          ["business case", "feature adoption"],
          locked:            false,
          usedInResumeCount: 0,
        },
        {
          id:                "bullet-intuit-4",
          content:           "Facilitated weekly sprint ceremonies and maintained the product backlog for a 6-person engineering squad",
          contentType:       "VERIFIED",
          metrics:           ["6-person engineering squad"],
          keywords:          ["agile", "sprint", "backlog management"],
          locked:            false,
          usedInResumeCount: 0,
        },
      ],
    },
  ],

  education: [
    {
      id:             "edu-stanford",
      degree:         "Master of Science, Management Science and Engineering",
      institution:    "Stanford University",
      graduationDate: "2016-06-01T00:00:00.000Z",
      expectedDate:   null,
      inProgress:     false,
      gpa:            null,
      location:       "Stanford, CA",
      verified:       true,
    },
    {
      id:             "edu-michigan",
      degree:         "Bachelor of Science, Computer Science",
      institution:    "University of Michigan",
      graduationDate: "2014-05-01T00:00:00.000Z",
      expectedDate:   null,
      inProgress:     false,
      gpa:            "3.7 / 4.0",
      location:       "Ann Arbor, MI",
      verified:       true,
    },
  ],

  skills: [
    { id: "skill-sql",       name: "SQL",             category: "Data Analysis",      proficiencyLabel: "basic",            verified: false },
    { id: "skill-amplitude", name: "Amplitude",        category: "Analytics",          proficiencyLabel: "some experience",  verified: false },
    { id: "skill-mixpanel",  name: "Mixpanel",         category: "Analytics",          proficiencyLabel: null,               verified: false },
    { id: "skill-tableau",   name: "Tableau",           category: "Data Visualization", proficiencyLabel: null,               verified: false },
    { id: "skill-figma",     name: "Figma",             category: "Design Tools",       proficiencyLabel: null,               verified: false },
    { id: "skill-abtesting", name: "A/B testing",       category: "Experimentation",    proficiencyLabel: null,               verified: false },
    { id: "skill-jira",      name: "Jira",              category: "Project Management", proficiencyLabel: null,               verified: false },
    { id: "skill-okr",       name: "OKR frameworks",    category: "Strategy",           proficiencyLabel: null,               verified: false },
    { id: "skill-roadmap",   name: "Product roadmapping", category: "Strategy",         proficiencyLabel: null,               verified: false },
    { id: "skill-python",    name: "Python",             category: "Engineering",        proficiencyLabel: "familiar",         verified: false },
  ],

  certifications: [
    {
      id:            "cert-cspo",
      name:          "Certified Scrum Product Owner (CSPO)",
      issuingBody:   "Scrum Alliance",
      issueDate:     "2019-01-01T00:00:00.000Z",
      expiryDate:    null,
      credentialId:  null,
      verified:      false,
    },
    {
      id:            "cert-aws",
      name:          "AWS Certified Cloud Practitioner",
      issuingBody:   "Amazon Web Services",
      issueDate:     "2022-01-01T00:00:00.000Z",
      expiryDate:    null,
      credentialId:  null,
      verified:      false,
    },
  ],

  projects: [],
  achievements: [],

  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z",
};

// ── Target JD — Notion Director of Product ───────────────────────────────────

export const NOTION_JD_TEXT = `
Director of Product Management — Productivity & Collaboration
Notion Labs, Inc. | San Francisco, CA (Hybrid)

About the Role
Notion is looking for a Director of Product Management to lead our Productivity & Collaboration product surface. This is a senior individual contributor role that will define the strategic direction for how millions of knowledge workers collaborate across teams.

You will work closely with engineering, design, data science, and executive leadership to ship features that set the bar for modern productivity tooling.

Responsibilities
- Define and own the product strategy for Notion's Productivity & Collaboration surface
- Lead a team of 3–5 PMs, providing mentorship, direction, and performance feedback
- Partner with Data Science and Analytics to drive a data-driven product culture
- Own the product roadmap and OKR framework for your surface area
- Establish experimentation culture through rigorous A/B testing and experiment design
- Collaborate with Sales, Customer Success, and Marketing for go-to-market alignment
- Present vision, strategy, and results to executive leadership (CEO, CPO) quarterly
- Drive international expansion opportunities for the collaboration surface

Requirements
- 7+ years of product management experience at high-growth B2C or SaaS companies
- Proven track record launching products used by millions of users
- Experience leading and mentoring other PMs (required, not preferred)
- Strong analytical foundation: SQL, Amplitude/Mixpanel, A/B testing frameworks
- Experience with OKR framework ownership and KPI definition
- Excellent executive communication and stakeholder management skills
- History of shipping features that measurably improved core product metrics (retention, engagement, ARR)
- Experience with international market launches is a plus
- BS/MS in Computer Science, Engineering, or related field preferred

Preferred Qualifications
- Experience at a PLG (product-led growth) company
- Familiarity with enterprise productivity tools (Notion, Confluence, Linear, etc.)
- Track record of cross-functional leadership across Engineering, Design, and Data
`.trim();

export const NOTION_JD_HASH = "sha256-notion-director-pm-jd-v1-fixture";

/** Pre-built JDAnalysis for the Notion JD — used in tests that skip the LLM call. */
export const NOTION_JD_ANALYSIS: JDAnalysis = {
  resumeId:       JORDAN_RESUME_ID,
  jdHash:         NOTION_JD_HASH,
  analyzedAt:     "2026-05-20T12:00:00.000Z",
  agentVersion:   "jd-analyst@1.0.0",
  provider:       "anthropic",

  rawJdText:      NOTION_JD_TEXT,
  targetCompany:  "Notion",
  targetRole:     "Director of Product Management",

  tone:           "startup",
  topKeywords: [
    { term: "product strategy",          frequency: 3, required: true,  category: "domain" },
    { term: "OKR",                        frequency: 2, required: true,  category: "domain" },
    { term: "A/B testing",               frequency: 2, required: true,  category: "technical" },
    { term: "SQL",                        frequency: 1, required: true,  category: "technical" },
    { term: "Amplitude",                 frequency: 1, required: false, category: "technical" },
    { term: "Mixpanel",                  frequency: 1, required: false, category: "technical" },
    { term: "cross-functional",          frequency: 3, required: true,  category: "soft" },
    { term: "executive communication",   frequency: 2, required: true,  category: "soft" },
    { term: "stakeholder management",    frequency: 1, required: true,  category: "soft" },
    { term: "international expansion",   frequency: 1, required: false, category: "domain" },
    { term: "product-led growth",        frequency: 1, required: false, category: "domain" },
    { term: "data-driven",               frequency: 2, required: true,  category: "soft" },
    { term: "roadmap",                   frequency: 1, required: true,  category: "domain" },
    { term: "retention",                 frequency: 2, required: false, category: "domain" },
    { term: "ARR",                       frequency: 1, required: false, category: "domain" },
    { term: "mentorship",                frequency: 2, required: true,  category: "soft" },
    { term: "launch",                    frequency: 2, required: false, category: "domain" },
    { term: "experimentation",           frequency: 2, required: true,  category: "domain" },
    { term: "B2B SaaS",                  frequency: 1, required: false, category: "domain" },
    { term: "collaboration",             frequency: 3, required: false, category: "domain" },
  ],

  requirements: [
    { text: "7+ years of product management experience",                       type: "hard", matchedInProfile: true,  matchedSkillIds: [] },
    { text: "Proven track record launching products used by millions of users", type: "hard", matchedInProfile: true,  matchedSkillIds: [] },
    { text: "Experience leading and mentoring other PMs",                       type: "hard", matchedInProfile: true,  matchedSkillIds: [] },
    { text: "SQL proficiency",                                                  type: "hard", matchedInProfile: true,  matchedSkillIds: ["skill-sql"] },
    { text: "Amplitude or Mixpanel experience",                                 type: "hard", matchedInProfile: true,  matchedSkillIds: ["skill-amplitude", "skill-mixpanel"] },
    { text: "A/B testing framework experience",                                 type: "hard", matchedInProfile: true,  matchedSkillIds: ["skill-abtesting"] },
    { text: "OKR framework ownership",                                          type: "hard", matchedInProfile: true,  matchedSkillIds: ["skill-okr"] },
    { text: "Executive communication skills",                                   type: "hard", matchedInProfile: true,  matchedSkillIds: [] },
    { text: "International market launch experience",                           type: "soft", matchedInProfile: true,  matchedSkillIds: [] },
    { text: "PLG company experience",                                           type: "soft", matchedInProfile: false, matchedSkillIds: [] },
    { text: "BS/MS in Computer Science or Engineering",                         type: "soft", matchedInProfile: true,  matchedSkillIds: [] },
  ],

  sections: [
    { name: "About the Role",         content: "Director of PM for Productivity & Collaboration surface. Senior IC role." },
    { name: "Responsibilities",       content: "Define strategy, lead PMs, own OKRs, drive experimentation, partner cross-functionally." },
    { name: "Requirements",           content: "7+ years PM, millions of users, PM leadership, SQL, Amplitude/Mixpanel, A/B testing, OKRs." },
    { name: "Preferred Qualifications", content: "PLG experience, enterprise productivity tools, cross-functional track record." },
  ],

  seniorityLevel:  "senior",
  remotePolicy:    "hybrid",
  teamSize:        "3–5 PMs",
  industryDomain:  "SaaS / productivity tools",

  summaryForUser: "This is a senior PM leadership role at Notion focused on the Productivity & Collaboration surface. The hiring team wants someone who has launched products at scale (millions of users), run OKR programs, driven rigorous A/B experimentation, and can present product vision to a C-suite audience.",
  keyGapsInProfile: ["PLG company experience not directly referenced in resume"],
};

/** Pre-built ResumeStrategy for Jordan → Notion — used in tests that skip strategy generation. */
export const NOTION_RESUME_STRATEGY: ResumeStrategy = {
  resumeId:            JORDAN_RESUME_ID,
  userId:              JORDAN_USER_ID,
  strategyVersion:     1,
  generatedAt:         "2026-05-20T12:01:00.000Z",
  agentVersion:        "strategy@1.0.0",
  provider:            "anthropic",

  careerMemoryVersion: 1,
  jdHash:              NOTION_JD_HASH,

  roleType: "BUSINESS",

  sectionOrder: [
    { section: "summary",         include: true,  position: 1, rationale: "Lead with a strong PM leadership narrative", emphasize: false },
    { section: "experience",      include: true,  position: 2, rationale: "Core section — all three roles are directly relevant", emphasize: true },
    { section: "core_skills",     include: true,  position: 3, rationale: "Highlight analytics stack (Amplitude, Mixpanel, SQL)", emphasize: false },
    { section: "education",       include: true,  position: 4, rationale: "Stanford MS satisfies BS/MS CS requirement", emphasize: false },
    { section: "certifications",  include: true,  position: 5, rationale: "CSPO and AWS add credibility", emphasize: false },
  ],

  workHistoryInScope: [
    {
      workHistoryId:     WH_STRIPE,
      company:           "Stripe",
      title:             "Senior Product Manager",
      include:           true,
      bulletCountTarget: 5,
      emphasisKeywords:  ["OKR", "international expansion", "cross-functional", "ARR", "retention"],
      rationale:         "Most recent, highest-signal role with direct metric match to Notion JD requirements",
    },
    {
      workHistoryId:     WH_AIRBNB,
      company:           "Airbnb",
      title:             "Product Manager",
      include:           true,
      bulletCountTarget: 4,
      emphasisKeywords:  ["A/B testing", "experimentation", "data-driven", "product ownership", "scale"],
      rationale:         "Strong experimentation culture + millions-of-users scale exactly matches Notion's requirements",
    },
    {
      workHistoryId:     WH_INTUIT,
      company:           "Intuit",
      title:             "Associate Product Manager",
      include:           true,
      bulletCountTarget: 3,
      emphasisKeywords:  ["product improvement", "business case", "agile"],
      rationale:         "Earlier career context; 3 tight bullets to show progression without over-weighting",
    },
  ],

  keywordStrategy: [
    { keyword: "OKR",               targetSection: "experience",   targetWorkHistoryId: WH_STRIPE  },
    { keyword: "A/B testing",       targetSection: "experience",   targetWorkHistoryId: WH_AIRBNB  },
    { keyword: "SQL",               targetSection: "core_skills",  targetWorkHistoryId: null        },
    { keyword: "Amplitude",         targetSection: "core_skills",  targetWorkHistoryId: null        },
    { keyword: "Mixpanel",          targetSection: "core_skills",  targetWorkHistoryId: null        },
    { keyword: "cross-functional",  targetSection: "experience",   targetWorkHistoryId: WH_STRIPE  },
    { keyword: "product strategy",  targetSection: "summary",      targetWorkHistoryId: null        },
    { keyword: "mentorship",        targetSection: "experience",   targetWorkHistoryId: WH_STRIPE  },
  ],

  summaryGuidance: "Write a 2–3 sentence executive summary positioning Jordan as a data-driven PM leader with a track record of launching products at scale (millions of users), owning OKR programs, and driving measurable business outcomes (ARR, churn, retention). Mention Stanford MS and readiness for Director-level scope.",

  topEmphases: [
    "Stripe Tax: $2M ARR in 6 months across 4 international markets",
    "Airbnb: 4M active hosts, 40+ A/B experiments/quarter, 34% win rate",
    "Intuit APM: Reduced invoice creation time by 22% through data-driven UX redesign",
  ],
  keywordsMatched: ["OKR", "A/B testing", "SQL", "Amplitude", "Mixpanel", "cross-functional", "ARR", "retention", "international expansion", "product roadmap"],
  keywordsUnmatched: ["PLG", "product-led growth"],
  matchScore: 88,
};

// ── Helper factories ─────────────────────────────────────────────────────────

/** Returns a minimal Resume DB row for Jordan Smith at a given state. */
export function makeJordanResume(
  state: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id:           JORDAN_RESUME_ID,
    userId:       JORDAN_USER_ID,
    targetRole:   "Director of Product Management",
    targetCompany: "Notion",
    jdText:       NOTION_JD_TEXT,
    state,
    pdfUrl:       "https://storage.example.com/signed/jordan-original.pdf",
    jdAnalysisJson: null,
    strategyJson:   null,
    summaryText:    null,
    pipelineStartedAt: null,
    pipelineFinishedAt: null,
    latexSource:    null,
    atsScore:       null,
    keywordScore:   null,
    visualScore:    null,
    pageCount:      null,
    createdAt:      new Date("2026-05-20T12:00:00.000Z"),
    updatedAt:      new Date("2026-05-20T12:00:00.000Z"),
    ...overrides,
  };
}
