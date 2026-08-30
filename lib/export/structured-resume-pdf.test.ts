import {
  buildStructuredResumePdf,
  StructuredResumeContentError,
  StructuredResumeOverflowError,
  type StructuredResumeExportInput,
} from "./structured-resume-pdf";
import { parseResumeHeader } from "./structured-resume-input";

describe("structured resume header parsing", () => {
  it("rejects a one-character candidate name", () => {
    expect(parseResumeHeader(JSON.stringify({ name: "S", email: "candidate@example.com" })))
      .toMatchObject({ name: null, email: "candidate@example.com" });
  });
});

function makeInput(): StructuredResumeExportInput {
  return {
    targetRole: "Customer Solutions Manager",
    targetCompany: "Amazon Web Services",
    roleType: "BUSINESS",
    headline: null,
    candidate: {
      name: "Jordan Smith",
      email: "jordan@example.com",
      phone: "(415) 555-0192",
      linkedin: "linkedin.com/in/jordan-smith",
      location: "Columbus, OH",
      website: null,
    },
    summary:
      "Customer-focused operations leader with experience guiding teams through complex changes and translating technical concepts into practical operating plans.",
    jobs: [
      {
        id: "northstar",
        title: "Operations Leadership Experience",
        company: "Northstar Logistics",
        location: "Columbus, OH",
        startDate: new Date("2018-01-01T00:00:00.000Z"),
        endDate: new Date("2023-12-31T00:00:00.000Z"),
        current: true,
        sortOrder: 0,
        bullets: Array.from({ length: 3 }, (_, index) =>
          `Led a cross-functional operational improvement initiative ${index + 1} with documented customer, quality, and workflow outcomes across a high-volume environment.`
        ),
      },
      {
        id: "blue-ridge",
        title: "Associate Cloud Engineer",
        company: "Blue Ridge Technology",
        location: "Columbus, OH",
        startDate: new Date("2024-05-01T00:00:00.000Z"),
        endDate: new Date("2025-04-30T00:00:00.000Z"),
        current: false,
        sortOrder: 1,
        bullets: Array.from({ length: 2 }, (_, index) =>
          `Coordinated cloud documentation, stakeholder communication, and implementation support workstream ${index + 1} across technical teams.`
        ),
      },
    ],
    skills: Array.from({ length: 6 }, (_, index) => ({
      name: `Skill ${index + 1}`,
      category: `Category ${(index % 2) + 1}`,
    })),
    education: [
      {
        degree: "Master of Science, Information Systems",
        institution: "Lakeside State University",
        graduationDate: "2025-06-01T00:00:00.000Z",
        inProgress: false,
      },
      {
        degree: "Bachelor of Science, Business Analytics",
        institution: "Lakeside State University",
        graduationDate: "2020-12-01T00:00:00.000Z",
        inProgress: false,
      },
    ],
    certifications: Array.from({ length: 2 }, (_, index) => ({
      name: `Certification ${index + 1}`,
      issuingBody: "Issuer",
      issueDate: `${2020 + (index % 6)}-01-01T00:00:00.000Z`,
    })),
  };
}

function makeOversizedInput(): StructuredResumeExportInput {
  const input = makeInput();
  input.summary = Array.from(
    { length: 18 },
    (_, index) => `Summary sentence ${index + 1} preserves a distinct canonical statement.`
  ).join(" ");
  input.jobs = Array.from({ length: 6 }, (_, jobIndex) => ({
    ...input.jobs[0],
    id: `job-${jobIndex + 1}`,
    title: `Canonical Role ${jobIndex + 1}`,
    company: `Canonical Employer ${jobIndex + 1}`,
    sortOrder: jobIndex,
    bullets: Array.from(
      { length: 8 },
      (_, bulletIndex) =>
        `Preserved canonical accomplishment ${jobIndex + 1}.${bulletIndex + 1} with complete source-backed context and impact.`
    ),
  }));
  input.skills = Array.from({ length: 40 }, (_, index) => ({
    name: `Canonical Skill ${index + 1}`,
    category: `Canonical Category ${(index % 8) + 1}`,
  }));
  input.certifications = Array.from({ length: 12 }, (_, index) => ({
    name: `Canonical Certification ${index + 1}`,
    issuingBody: `Canonical Issuer ${index + 1}`,
    issueDate: `${2020 + (index % 6)}-01-01T00:00:00.000Z`,
  }));
  return input;
}

function pdfText(buffer: Buffer) {
  return buffer.toString("latin1");
}

function pdfVisibleText(buffer: Buffer) {
  return Array.from(
    pdfText(buffer).matchAll(/\(((?:\\.|[^\\)])*)\)\s+Tj/g),
    (match) => new TextDecoder("windows-1252")
      .decode(Buffer.from(match[1], "latin1"))
      .replace(/\\([\\()])/g, "$1")
  ).join(" ");
}

describe("buildStructuredResumePdf", () => {
  it("fails explicitly instead of omitting canonical content that cannot fit one page", () => {
    expect(() => buildStructuredResumePdf(makeOversizedInput())).toThrow(
      StructuredResumeOverflowError
    );
    expect(() => buildStructuredResumePdf(makeOversizedInput())).toThrow(
      "cannot fit one page without removing or truncating content"
    );
  });

  it("fails explicitly when an unbreakable canonical token exceeds the page width", () => {
    const input = makeInput();
    input.candidate.website = `https://example.com/${"a".repeat(300)}`;

    expect(() => buildStructuredResumePdf(input)).toThrow(
      StructuredResumeOverflowError
    );
  });

  it("fails explicitly when a right-aligned canonical date label exceeds the page width", () => {
    const input = makeInput();
    input.jobs[0].dateLabel = "x".repeat(300);

    expect(() => buildStructuredResumePdf(input)).toThrow(
      StructuredResumeOverflowError
    );
  });

  it("fails explicitly when a canonical skill category cannot fit before its value", () => {
    const input = makeInput();
    input.skills = [{ name: "Excel", category: "x".repeat(300) }];

    expect(() => buildStructuredResumePdf(input)).toThrow(
      StructuredResumeOverflowError
    );
  });

  it("preserves every canonical string in a fit-size document", () => {
    const input = makeInput();
    input.headline = "Production Planning Supervisor";
    input.projects = [{
      id: "planning-project",
      name: "Shift Planning Console",
      description: "Built a scheduling view that preserved plan versus actual decisions.",
      technologies: ["Excel", "Python"],
      url: "portfolio.example.com/shift-planning",
      startDate: null,
      endDate: null,
    }];
    input.roleType = "TECHNICAL";
    input.education[0].details = "Completed a capstone on human-centered planning systems.";

    const result = buildStructuredResumePdf(input);
    const text = pdfVisibleText(result.pdf);
    const canonicalStrings = [
      input.candidate.name,
      input.candidate.email,
      input.candidate.phone,
      input.candidate.linkedin,
      input.candidate.location,
      input.headline,
      input.summary,
      ...input.skills.flatMap((skill) => [skill.category, skill.name]),
      ...input.jobs.flatMap((job) => [
        job.title,
        job.company,
        job.location,
        ...job.bullets,
      ]),
      ...input.projects.flatMap((project) => [
        project.name,
        project.description,
        ...project.technologies,
        project.url,
      ]),
      ...input.education.flatMap((education) => [
        education.degree,
        education.institution,
        education.details,
      ]),
      ...input.certifications.flatMap((certification) => [
        certification.name,
        certification.issuingBody,
      ]),
    ].filter((value): value is string => Boolean(value));

    expect(result.omittedContent).toEqual([]);
    canonicalStrings.forEach((value) => expect(text).toContain(value));
  });

  it("preserves common resume punctuation and accented names as searchable text", () => {
    const input = makeInput();
    input.candidate.name = "José Alvarez";
    input.summary =
      "Improved plan-versus-actual reporting by 18% — without changing customer commitments.";
    input.jobs = [{
      ...input.jobs[0],
      title: "Operations Manager – Planning & Execution",
      bullets: ["Coordinated S&OP reviews across René's team and a €2.5M portfolio."],
    }];
    input.skills = [{ name: "S&OP", category: "Planning & Forecasting" }];
    input.education = [];
    input.certifications = [];

    const text = pdfVisibleText(buildStructuredResumePdf(input).pdf);

    expect(text).toContain("José Alvarez");
    expect(text).toContain("18%");
    expect(text).toContain("Operations Manager – Planning & Execution");
    expect(text).toContain("S&OP");
    expect(text).toContain("René's team");
    expect(text).toContain("€2.5M portfolio");
  });

  it("fails explicitly instead of deleting unsupported canonical characters", () => {
    const input = makeInput();
    input.summary = "Led global operations across English and Japanese markets in 東京.";
    input.skills = [{ name: "Japanese language", category: "Languages" }];
    input.jobs = [{
      ...input.jobs[0],
      bullets: ["Coordinated a launch for the 東京 operations team."],
    }];

    expect(() => buildStructuredResumePdf(input)).toThrow(StructuredResumeContentError);
    expect(() => buildStructuredResumePdf(input)).toThrow(
      "cannot be represented by the structured PDF renderer"
    );
  });

  it.each([
    {
      label: "missing candidate name",
      mutate: (input: StructuredResumeExportInput) => {
        input.candidate.name = null;
      },
    },
    {
      label: "skill category without a skill name",
      mutate: (input: StructuredResumeExportInput) => {
        input.skills = [{ name: "", category: "Planning" }];
      },
    },
    {
      label: "certification metadata without a certification name",
      mutate: (input: StructuredResumeExportInput) => {
        input.certifications = [{
          name: "",
          issuingBody: "Issuer",
          issueDate: "2024-01-01T00:00:00.000Z",
        }];
      },
    },
    {
      label: "project metadata without a project name",
      mutate: (input: StructuredResumeExportInput) => {
        input.projects = [{
          id: "project-invalid",
          name: "",
          description: "Canonical project description.",
          technologies: ["Excel"],
          url: null,
          startDate: "2024-01-01T00:00:00.000Z",
          endDate: null,
        }];
      },
    },
    {
      label: "education metadata without a degree",
      mutate: (input: StructuredResumeExportInput) => {
        input.education = [{
          degree: "",
          institution: "Indiana University",
          graduationDate: "2024-05-01T00:00:00.000Z",
          inProgress: false,
        }];
      },
    },
  ])("fails explicitly for $label", ({ mutate }) => {
    const input = makeInput();
    mutate(input);

    expect(() => buildStructuredResumePdf(input)).toThrow(StructuredResumeContentError);
  });

  it("uses an explicit end date instead of rendering Present from a stale current flag", () => {
    const result = buildStructuredResumePdf(makeInput());
    const text = pdfText(result.pdf);

    expect(text).toContain("Jan 2018 - Dec 2023");
    expect(text).not.toContain("Jan 2018 - Present");
  });

  it("renders structured content without leaking LaTeX commands", () => {
    const result = buildStructuredResumePdf(makeInput());
    const text = pdfText(result.pdf);

    expect(text).toContain("Jordan Smith");
    expect(text).not.toContain("\\documentclass");
    expect(text).not.toContain("\\jobEntry");
    expect(text).not.toContain("\\itemListStart");
  });

  it("applies the saved document font to the exported PDF", () => {
    const input = makeInput();
    input.presentation = { font: "serif", scale: "normal", density: "balanced" };

    const result = buildStructuredResumePdf(input);
    const text = pdfText(result.pdf);

    expect(text).toContain("/BaseFont /Times-Roman");
    expect(text).toContain("/BaseFont /Times-Bold");
    expect(text).not.toContain("/BaseFont /Helvetica-Bold");
  });

  it("applies the saved document scale to the exported PDF", () => {
    const compactInput = makeInput();
    compactInput.summary = "Operations leader improving customer and workflow outcomes.";
    compactInput.jobs = [{ ...compactInput.jobs[0], bullets: [compactInput.jobs[0].bullets[0]] }];
    compactInput.skills = [{ name: "Process Improvement", category: "Core Skills" }];
    compactInput.education = [];
    compactInput.certifications = [];
    compactInput.presentation = { font: "sans", scale: "compact", density: "balanced" };

    const largeInput = {
      ...compactInput,
      presentation: { font: "sans", scale: "large", density: "balanced" } as const,
    };
    const compactText = pdfText(buildStructuredResumePdf(compactInput).pdf);
    const largeText = pdfText(buildStructuredResumePdf(largeInput).pdf);

    expect(compactText).toContain("/F1 9.0 Tf");
    expect(largeText).toContain("/F1 10.4 Tf");
    expect(compactText).not.toBe(largeText);
  });

  it("uses the approved ATS section order and keeps the target out of the header", () => {
    const result = buildStructuredResumePdf(makeInput());
    const text = pdfText(result.pdf);

    expect(text.indexOf("CORE SKILLS")).toBeLessThan(text.indexOf("PROFESSIONAL EXPERIENCE"));
    expect(text.indexOf("PROFESSIONAL EXPERIENCE")).toBeLessThan(text.indexOf("EDUCATION"));
    expect(text.indexOf("EDUCATION")).toBeLessThan(text.indexOf("CERTIFICATIONS"));
    expect(text).not.toContain("CUSTOMER SOLUTIONS MANAGER | AMAZON WEB SERVICES");
  });

  it("keeps source education and certification date precision in the PDF", () => {
    const input = makeInput();
    input.summary = "Operations leader improving customer and workflow outcomes.";
    input.jobs = [{ ...input.jobs[0], bullets: [input.jobs[0].bullets[0]] }];
    input.skills = [{ name: "Process Improvement", category: "Core Skills" }];
    input.education = [
      {
        degree: "Master of Science, Information Systems",
        institution: "Lakeside State University",
        graduationDate: "2025-06-01T00:00:00.000Z",
        inProgress: false,
      },
      {
        degree: "Bachelor of Science, Business Analytics",
        institution: "Lakeside State University",
        graduationDate: "2020-01-01T00:00:00.000Z",
        inProgress: false,
      },
    ];
    input.certifications = [
      {
        name: "AWS Certified Solutions Architect - Associate",
        issuingBody: "Amazon Web Services",
        issueDate: "2025-01-01T00:00:00.000Z",
      },
      {
        name: "ITIL Foundation",
        issuingBody: null,
        issueDate: "2022-01-01T00:00:00.000Z",
      },
    ];

    const text = pdfText(buildStructuredResumePdf(input).pdf);

    expect(text).toContain("Jun 2025");
    expect(text).toContain("2020");
    expect(text).toContain(
      "AWS Certified Solutions Architect - Associate, Amazon Web Services \\(2025\\)"
    );
    expect(text).toContain("ITIL Foundation \\(2022\\)");
  });

  it("renders Quick Resume date labels without inventing calendar precision", () => {
    const input = makeInput();
    input.summary = "Warehouse shift lead improving safe, accurate daily operations.";
    input.jobs = [{
      ...input.jobs[0],
      startDate: "",
      endDate: null,
      current: false,
      dateLabel: "About four years",
      bullets: [input.jobs[0].bullets[0]],
    }];
    input.skills = [{ name: "Scheduling", category: "Core Skills" }];
    input.education = [{
      degree: "High School Diploma",
      institution: "North High School",
      graduationDate: null,
      inProgress: false,
      dateLabel: "Completed 2018",
      details: "Student council treasurer",
    }];
    input.certifications = [{
      name: "Forklift Certification",
      issuingBody: "Warehouse Safety Council",
      issueDate: null,
      dateLabel: "Earned 2019",
    }];

    const text = pdfText(buildStructuredResumePdf(input).pdf);

    expect(text).toContain("About four years");
    expect(text).toContain("Completed 2018");
    expect(text).toContain("Student council treasurer");
    expect(text).toContain("Forklift Certification, Warehouse Safety Council \\(Earned 2019\\)");
    expect(text).not.toContain("Present");
  });

  it("keeps long contact and target lines inside a one-page document", () => {
    const input = makeInput();
    input.candidate.linkedin =
      "linkedin.com/in/a-very-long-professional-profile-address-for-testing";
    input.candidate.website =
      "portfolio.example.com/customer-success/cloud-transformation/programs";
    input.targetRole =
      "Customer Solutions Manager, Small and Medium Business, Cloud Transformation and Adoption";

    const result = buildStructuredResumePdf(input);

    expect(result.pageCount).toBe(1);
    expect(pdfText(result.pdf)).toContain("/Count 1");
  });

  it("renders verified projected work in the approved technical section order", () => {
    const input = makeInput();
    input.roleType = "TECHNICAL";
    input.summary = "Cloud engineer building reliable automation and reporting systems.";
    input.jobs = [{ ...input.jobs[0], bullets: [input.jobs[0].bullets[0]] }];
    input.skills = [{ name: "AWS", category: "Cloud" }];
    input.certifications = [];
    input.projects = [
      {
        id: "project-1",
        name: "Cloud Reliability Lab",
        description: "Built an observable deployment workflow for repeatable releases.",
        technologies: ["AWS", "Terraform"],
        url: "portfolio.example.com/cloud-lab",
        startDate: null,
        endDate: null,
      },
    ];

    const text = pdfText(buildStructuredResumePdf(input).pdf);

    expect(text).toContain("PROJECTS");
    expect(text).toContain("Cloud Reliability Lab");
    expect(text.indexOf("PROFESSIONAL EXPERIENCE")).toBeLessThan(text.indexOf("PROJECTS"));
    expect(text.indexOf("PROJECTS")).toBeLessThan(text.indexOf("EDUCATION"));
  });

  it("does not silently discard a supplied project based on role-track heuristics", () => {
    const input = makeInput();
    input.roleType = "OPERATIONS";
    input.projects = [
      {
        id: "project-1",
        name: "Operations Planning Project",
        description: "Built a truthful planning artifact for shift execution.",
        technologies: ["Figma"],
        url: null,
        startDate: null,
        endDate: null,
      },
    ];

    const text = pdfText(buildStructuredResumePdf(input).pdf);

    expect(text).toContain("Operations Planning Project");
    expect(text).toContain("Built a truthful planning artifact for shift execution.");
  });

  it("renders supplied project dates instead of silently dropping them", () => {
    const input = makeInput();
    input.summary = "Cloud engineer building reliable automation and reporting systems.";
    input.jobs = [{ ...input.jobs[0], bullets: [input.jobs[0].bullets[0]] }];
    input.skills = [{ name: "AWS", category: "Cloud" }];
    input.certifications = [];
    input.projects = [{
      id: "project-dated",
      name: "Cloud Reliability Lab",
      description: "Built an observable deployment workflow for repeatable releases.",
      technologies: ["AWS"],
      url: null,
      startDate: "2024-01-01T00:00:00.000Z",
      endDate: "2024-05-01T00:00:00.000Z",
    }];

    const text = pdfText(buildStructuredResumePdf(input).pdf);

    expect(text).toContain("Jan 2024 - May 2024");
  });
});
