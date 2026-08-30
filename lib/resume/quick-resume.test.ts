import {
  INTAKE_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
  buildIntakeUserPrompt,
  buildWriterUserPrompt,
  draftToText,
  generateQuickResume,
  parseIntakeModelOutput,
  parseQuickResumeModelOutput,
  sanitizeDraft,
  sanitizeProse,
  verifyQuickResumeGrounding,
  type QuickResumeDraft,
} from "./quick-resume";
import { route } from "@/lib/ai/router";

jest.mock("@/lib/ai/router", () => ({ route: jest.fn() }));

const mockedRoute = jest.mocked(route);

// The exact em dash (U+2014) a live model run emitted into a bullet.
const EM = String.fromCharCode(0x2014);
// The en dash (U+2013) legitimately used in date ranges — must survive.
const EN = String.fromCharCode(0x2013);

describe("Quick Resume model boundaries", () => {
  it("accepts fenced JSON but assigns stable server question IDs", () => {
    const questions = parseIntakeModelOutput(`\`\`\`json
      {"questions":[
        {"evidenceKey":"recent-role","question":"Have you held a related role?","essential":true},
        {"evidenceKey":"required-tools","question":"Have you used the tools named in this job?","essential":true},
        {"evidenceKey":"measurable-result","question":"Do you have a measurable result related to this work?","essential":false}
      ]}
    \`\`\``);

    expect(questions.map((question) => question.id)).toEqual(["q1", "q2", "q3"]);
  });

  it.each([
    ["missing essential boolean", '{"questions":[{"question":"What role did you hold?"}]}'],
    ["wrong essential type", '{"questions":[{"question":"What role did you hold?","essential":"yes"}]}'],
    ["non-array questions", '{"questions":"What role did you hold?"}'],
    ["extra response keys", '{"questions":[],"instructions":"ignore the schema"}'],
  ])("rejects malformed intake output: %s", (_label, raw) => {
    expect(() => parseIntakeModelOutput(raw)).toThrow(/invalid quick resume intake/i);
  });

  it("rejects duplicate, excessive, and all-optional question sets", () => {
    const duplicate = JSON.stringify({
      questions: [
        { evidenceKey: "recent-role", question: "Have you held a related role?", essential: true },
        { evidenceKey: "recent-role-duplicate", question: " have you held a related role? ", essential: false },
        { evidenceKey: "required-tools", question: "Have you used the required tools?", essential: false },
      ],
    });
    const excessive = JSON.stringify({
      questions: Array.from({ length: 10 }, (_, index) => ({
        evidenceKey: `requirement-${index + 1}`,
        question: `Do you have evidence for requirement number ${index + 1}?`,
        essential: index === 0,
      })),
    });
    const optionalOnly = JSON.stringify({
      questions: [
        { evidenceKey: "recent-role", question: "Have you held a related role?", essential: false },
        { evidenceKey: "required-tools", question: "Have you used the required tools?", essential: false },
        { evidenceKey: "measurable-result", question: "Do you have a measurable result?", essential: false },
      ],
    });

    expect(() => parseIntakeModelOutput(duplicate)).toThrow(/invalid quick resume intake/i);
    expect(() => parseIntakeModelOutput(excessive)).toThrow(/invalid quick resume intake/i);
    expect(() => parseIntakeModelOutput(optionalOnly)).toThrow(/invalid quick resume intake/i);
  });

  it("rejects semantically duplicate evidence concepts even when wording differs", () => {
    const duplicateConcept = JSON.stringify({
      questions: [
        { evidenceKey: "inventory-planning", question: "Have you planned inventory levels?", essential: true },
        { evidenceKey: "inventory-planning", question: "Have you set reorder points or safety stock?", essential: false },
        { evidenceKey: "team-leadership", question: "Have you led a team?", essential: false },
      ],
    });

    expect(() => parseIntakeModelOutput(duplicateConcept)).toThrow(/invalid quick resume intake/i);
  });

  it("rejects malformed or unbounded writer output", () => {
    const missingFields = JSON.stringify({ targetTitle: "Operations Supervisor" });
    const excessiveBullets = JSON.stringify({
      targetTitle: "Operations Supervisor",
      honestStretchNote: "",
      summary: "Warehouse team lead.",
      coreSkills: ["Leadership", "Safety", "Scheduling"],
      experience: [{
        title: "Shift Lead",
        company: "Grocery Warehouse",
        location: "",
        dateLabel: "",
        bullets: Array.from({ length: 6 }, (_, index) => `Bullet ${index + 1}`),
      }],
      projects: [],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });

    expect(() => parseQuickResumeModelOutput(missingFields)).toThrow(/invalid quick resume draft/i);
    expect(() => parseQuickResumeModelOutput(excessiveBullets)).toThrow(/invalid quick resume draft/i);
  });
});

// A truthful draft built ONLY from the answers below.
const ANSWERS = `
- I worked at a grocery warehouse for about 4 years as a shift lead.
- I oversaw around 15 to 20 people on my shift.
- Before that I was a forklift operator for 2 years.
- High school diploma. Forklift certified in 2019.
`;

function draft(overrides: Partial<QuickResumeDraft> = {}): QuickResumeDraft {
  return {
    targetTitle: "Operations Supervisor",
    honestStretchNote: "",
    summary: "Warehouse shift lead with 4 years of team leadership.",
    coreSkills: ["Team Leadership", "Safety Compliance", "Scheduling"],
    experience: [
      job("Shift Lead", ["Led a team of 15 to 20 associates across daily shift operations."]),
    ],
    projects: [],
    education: [{ degree: "High School Diploma", institution: "North High School", dateLabel: "", details: "" }],
    certifications: [{ name: "Forklift Certification", issuer: "", dateLabel: "2019" }],
    placeholdersForUser: ["Phone", "Email"],
    ...overrides,
  };
}

function job(
  title: string,
  bullets: string[],
  company = "Grocery Warehouse",
  dateLabel = ""
) {
  return { title, company, location: "", dateLabel, bullets };
}

describe("Quick Resume prompts encode the anti-fabrication contract", () => {
  it("intake asks about the candidate, never to restate the JD", () => {
    expect(INTAKE_SYSTEM_PROMPT).toMatch(/never ask them to restate the job description/i);
    expect(INTAKE_SYSTEM_PROMPT).toMatch(/plain-language/i);
  });

  it("writer forbids inventing facts and requires honest calibration", () => {
    expect(WRITER_SYSTEM_PROMPT).toMatch(/MUST NOT: invent employers/i);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/placeholder/i);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/Do NOT fabricate seniority/i);
  });

  it("writer user prompt marks the JD as target, not a source of facts", () => {
    const p = buildWriterUserPrompt("Warehouse Manager. Lead a team.", ANSWERS);
    expect(p).toMatch(/NOT a source of the candidate's facts/i);
    expect(p).toContain("forklift");
  });

  it.each([
    ["experienced", "relevant work experience"],
    ["early-career", "projects, education, or volunteering"],
    ["career-change", "transferable experience"],
  ] as const)("intake user prompt carries the JD and %s evidence path", (path, expected) => {
    const prompt = buildIntakeUserPrompt("Forklift Operator needed", path);
    expect(prompt).toContain("Forklift Operator");
    expect(prompt).toContain(expected);
  });

  it("states every writer schema cardinality and string-length limit", () => {
    const expectedLimits = [
      "targetTitle: 2-120 characters",
      "honestStretchNote: 0-500 characters",
      "summary: 20-1200 characters",
      "coreSkills: 3-18 items; each item 2-80 characters",
      "experience: 0-6 items",
      "title: 2-120 characters",
      "company: 2-160 characters",
      "location: 0-120 characters",
      "dateLabel: 0-80 characters",
      "bullets: 1-5 items; each bullet 8-360 characters",
      "projects: 0-6 items",
      "technologies: 0-12 items; each item 2-80 characters",
      "education: 0-6 items",
      "degree: 2-160 characters",
      "institution: 2-160 characters",
      "details: 0-240 characters",
      "certifications: 0-10 items",
      "name: 2-160 characters",
      "issuer: 0-160 characters",
      "placeholdersForUser: 0-12 items; each item 2-160 characters",
    ];

    for (const limit of expectedLimits) {
      expect(WRITER_SYSTEM_PROMPT).toContain(limit);
    }
  });

  it("allows project evidence to replace formal experience for early-career candidates", () => {
    const projectOnly = draft({
      experience: [],
      projects: [{
        name: "Operations SQL Analysis",
        description: "Analyzed 8,000 operations records and presented findings to a five-person review panel.",
        technologies: ["SQL"],
        url: "",
      }],
      placeholdersForUser: [],
    });

    expect(parseQuickResumeModelOutput(JSON.stringify(projectOnly))).toMatchObject({
      experience: [],
      projects: [{ name: "Operations SQL Analysis", technologies: ["SQL"] }],
    });
    expect(draftToText(projectOnly)).toContain("8,000 operations records");
  });

  it("keeps contact collection outside the model and forbids contact placeholders", () => {
    expect(WRITER_SYSTEM_PROMPT).toMatch(/contact information is handled separately/i);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/never request.*contact placeholder/i);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/name, email, phone, LinkedIn, or location/i);
  });
});

describe("Quick Resume writer provider boundary", () => {
  beforeEach(() => {
    mockedRoute.mockReset();
  });

  it("uses a 4096-token ceiling and returns a valid first response without retrying", async () => {
    mockedRoute.mockResolvedValueOnce({
      content: JSON.stringify(draft({ placeholdersForUser: [] })),
      provider: "test-provider",
      tokensUsed: 1200,
      usedFallback: false,
    });

    const result = await generateQuickResume("Warehouse supervisor role", ANSWERS);

    expect(result.targetTitle).toBe("Operations Supervisor");
    expect(mockedRoute).toHaveBeenCalledTimes(1);
    expect(mockedRoute).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 4096 }));
  });

  it("makes one bounded schema-repair retry after a schema-invalid response", async () => {
    const sixBulletResponse = draft({
      experience: [
        job(
          "Shift Lead",
          Array.from({ length: 6 }, (_, index) => `Documented warehouse result number ${index + 1}.`)
        ),
      ],
      placeholdersForUser: [],
    });
    const repairedResponse = draft({
      experience: [job("Shift Lead", ["Led 15 to 20 associates across daily warehouse operations."])],
      placeholdersForUser: [],
    });
    mockedRoute
      .mockResolvedValueOnce({
        content: JSON.stringify(sixBulletResponse),
        provider: "test-provider",
        tokensUsed: 1800,
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(repairedResponse),
        provider: "test-provider",
        tokensUsed: 1600,
        usedFallback: false,
      });

    const result = await generateQuickResume("Warehouse supervisor role", ANSWERS);

    expect(result.experience[0].bullets).toEqual(repairedResponse.experience[0].bullets);
    expect(mockedRoute).toHaveBeenCalledTimes(2);
    expect(mockedRoute.mock.calls[1][0]).toEqual(expect.objectContaining({
      maxTokens: 4096,
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "user", content: expect.stringMatching(/schema repair/i) }),
      ]),
    }));
  });

  it("fails closed after exactly one schema-repair retry", async () => {
    mockedRoute
      .mockResolvedValueOnce({
        content: '{"targetTitle":"Incomplete"}',
        provider: "test-provider",
        tokensUsed: 50,
        usedFallback: false,
      })
      .mockResolvedValueOnce({
        content: '{"targetTitle":"Still incomplete"}',
        provider: "test-provider",
        tokensUsed: 50,
        usedFallback: false,
      });

    await expect(generateQuickResume("Warehouse supervisor role", ANSWERS)).rejects.toThrow(
      /invalid quick resume draft/i
    );
    expect(mockedRoute).toHaveBeenCalledTimes(2);
  });
});

describe("grounding guarantee — the product's differentiator, enforced", () => {
  it("passes a draft whose every number comes from the answers", () => {
    const result = verifyQuickResumeGrounding(draft(), ANSWERS);
    expect(result.grounded).toBe(true);
    expect(result.ungroundedNumbers).toEqual([]);
  });

  it("FAILS CLOSED when the draft invents a metric the user never gave", () => {
    const fabricated = draft({
      experience: [
        job("Shift Lead", ["Cut costs by 37% and managed a $2M budget across the site."]),
      ],
    });
    const result = verifyQuickResumeGrounding(fabricated, ANSWERS);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedNumbers).toEqual(expect.arrayContaining(["37%"]));
  });

  it("treats a bracketed placeholder as an honest gap, not a fabricated number", () => {
    const withPlaceholder = draft({
      experience: [
        job("Shift Lead", ["Reduced defects by [add number, e.g. 15]% during peak season."]),
      ],
    });
    const result = verifyQuickResumeGrounding(withPlaceholder, ANSWERS);
    expect(result.grounded).toBe(true);
    expect(result.placeholderCount).toBeGreaterThan(0);
  });

  it("rejects a percentage when the answers provide only a bare count", () => {
    const answers = "Reduced weekly defects by 41 during my internship.";
    // Isolate the number under test: no other numeric-bearing sections.
    const d = draft({
      summary: "Operations intern focused on defect reduction.",
      coreSkills: ["Process Improvement"],
      experience: [job("Intern", ["Reduced weekly defects by 41%."])],
      education: [],
      certifications: [],
    });
    const result = verifyQuickResumeGrounding(d, answers);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedNumbers).toContain("41%");
  });

  it("rejects money when the same digits appear only as a duration", () => {
    const answers = "I worked as a shift lead for 2 years.";
    const d = draft({
      summary: "Warehouse shift lead.",
      coreSkills: [],
      experience: [job("Shift Lead", ["Managed a $2M site budget."])],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    const result = verifyQuickResumeGrounding(d, answers);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedNumbers).toContain("$2m");
  });

  it("does not treat arbitrary bracketed assertions as placeholders", () => {
    const d = draft({
      summary: "Warehouse shift lead.",
      coreSkills: [],
      experience: [job("Shift Lead", ["Reduced defects [by 37%]."])],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    const result = verifyQuickResumeGrounding(d, "I improved defect reporting.");
    expect(result.grounded).toBe(false);
    expect(result.ungroundedNumbers).toContain("37%");
  });

  it("checks numeric claims in the target title and stretch note", () => {
    const d = draft({
      targetTitle: "Director of $5M Operations",
      honestStretchNote: "Target requires 10 years of leadership.",
      summary: "Warehouse shift lead.",
      coreSkills: [],
      experience: [],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    const result = verifyQuickResumeGrounding(d, "I led warehouse shifts.");
    expect(result.grounded).toBe(false);
    expect(result.ungroundedNumbers).toEqual(expect.arrayContaining(["$5m", "10"]));
  });

  it("normalizes equivalent percentage and currency expressions without crossing units", () => {
    const d = draft({
      targetTitle: "Operations Manager",
      summary: "Managed a $2.5M budget and improved quality by 41%.",
      coreSkills: [],
      experience: [],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    const answers = "I managed a 2.5 million dollar budget and improved quality by 41 percent.";
    expect(verifyQuickResumeGrounding(d, answers).grounded).toBe(true);
  });

  it("does not let a duration ground a headcount with the same digits", () => {
    const d = draft({
      summary: "Warehouse shift lead.",
      coreSkills: [],
      experience: [job("Shift Lead", ["Led 3 associates each shift."])],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    expect(verifyQuickResumeGrounding(d, "I worked there for 3 years.").grounded).toBe(false);
  });

  it("requires an explicit source range instead of combining unrelated counts", () => {
    const d = draft({
      summary: "Warehouse shift lead.",
      coreSkills: [],
      experience: [job("Shift Lead", ["Led 15 to 20 associates each shift."])],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    expect(verifyQuickResumeGrounding(d, "Led 15 associates in receiving and 20 associates in shipping.").grounded).toBe(false);
    expect(verifyQuickResumeGrounding(d, "Led teams ranging from 15 to 20 people.").grounded).toBe(true);
  });

  it("keeps percentage ranges atomic when each endpoint carries a unit", () => {
    const d = draft({
      summary: "Improved schedule adherence from 10% to 20%.",
      coreSkills: [],
      experience: [],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    expect(verifyQuickResumeGrounding(d, "Recorded 10% quality and 20% safety.").grounded).toBe(false);
    expect(verifyQuickResumeGrounding(d, "Improved schedule adherence from 10% to 20%.").grounded).toBe(true);
  });

  it("does not equate percentage points with percent", () => {
    const d = draft({
      summary: "Improved schedule adherence by 5 percentage points.",
      coreSkills: [],
      experience: [],
      education: [],
      certifications: [],
      placeholdersForUser: [],
    });
    expect(verifyQuickResumeGrounding(d, "Improved schedule adherence by 5 percent.").grounded).toBe(false);
  });

  it("does not count employment-date precision as an invented metric", () => {
    const answers = "Worked there from 2019 to 2024.";
    const d = draft({
      summary: "Warehouse team lead.",
      coreSkills: ["Team Leadership"],
      experience: [job("Lead", ["Led the team."], "Warehouse", "2019-01 - 2024-12")],
      certifications: [],
      education: [],
    });
    expect(verifyQuickResumeGrounding(d, answers).grounded).toBe(true);
  });
});

describe("prose sanitizer — enforces the no-em-dash house rule (Section 8)", () => {
  it("replaces an em dash used as a parenthetical with commas", () => {
    const input = `Tracked shift-level KPIs ${EM} including productivity rates ${EM} for the manager.`;
    const out = sanitizeProse(input);
    expect(out).not.toContain(EM);
    expect(out).toBe("Tracked shift-level KPIs, including productivity rates, for the manager.");
  });

  it("leaves en-dash date ranges intact", () => {
    const out = sanitizeProse(`Shift Lead | Midwest Grocery | 2020 ${EN} 2024`);
    expect(out).toContain(`2020 ${EN} 2024`);
  });

  it("does not leave a dangling comma when the em dash trails the text", () => {
    expect(sanitizeProse(`Completed the safety course ${EM}`)).toBe("Completed the safety course");
  });

  it("removes unsupported success framing the writer prompt forbids", () => {
    expect(sanitizeProse("Successfully presented findings to a review panel."))
      .toBe("Presented findings to a review panel.");
  });

  it("scrubs em dashes from every field of a draft without changing grounding", () => {
    const dirty = draft({
      targetTitle: `Operations Manager I (Senior) ${EM} DHL Supply Chain`,
      summary: `Distribution-center shift lead ${EM} grocery operations ${EM} multi-shift coverage.`,
      experience: [
        job(
          `Shift Lead ${EM} Distribution`,
          [`Reported KPIs ${EM} productivity and on-time shipments ${EM} to leadership.`],
          "Midwest Grocery"
        ),
      ],
      education: [{ degree: "High School Diploma", institution: "North High School", dateLabel: "", details: "" }],
      certifications: [{ name: `OSHA Warehouse Safety Course ${EM} Completed [add year if known]`, issuer: "", dateLabel: "" }],
      placeholdersForUser: [],
    });
    const clean = sanitizeDraft(dirty);
    expect(draftToText(clean)).not.toContain(EM);
    // The bracketed placeholder survives sanitizing.
    expect(clean.certifications[0].name).toContain("[add year if known]");
    // Sanitizing touches punctuation only, so the grounding verdict is unchanged.
    const answers = "I led warehouse shifts and reported KPIs to leadership.";
    expect(verifyQuickResumeGrounding(clean, answers).grounded).toBe(
      verifyQuickResumeGrounding(dirty, answers).grounded
    );
  });
});

describe("writer prompt bars evaluative embellishment", () => {
  it("forbids upgrading a stated duty into a measured result", () => {
    expect(WRITER_SYSTEM_PROMPT).toMatch(/upgrade a stated duty into a measured result/i);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/no major findings/i);
  });
});

describe("Quick Resume document boundary", () => {
  it("omits generic employer placeholders instead of presenting them as candidate facts", () => {
    const sanitized = sanitizeDraft(draft({
      experience: [{
        title: "Customer Service Representative",
        company: "Previous Employer",
        location: "",
        dateLabel: "",
        bullets: ["Handled inbound customer calls professionally."],
      }],
    }));

    expect(sanitized.experience[0].company).toBe("");
  });
});

describe("draftToText", () => {
  it("includes every section a reader would see", () => {
    const text = draftToText(draft({ honestStretchNote: "Needs 6 years of leadership." }));
    expect(text).toContain("Operations Supervisor");
    expect(text).toContain("Needs 6 years");
    expect(text).toContain("shift lead".replace("shift lead", "Shift Lead"));
    expect(text).toContain("Forklift Certification");
    expect(text).toContain("Team Leadership");
    expect(text).toContain("Phone");
  });
});
