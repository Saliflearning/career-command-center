jest.mock("@/lib/db/client", () => ({
  db: { resume: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/db/mappers/career-memory.mapper", () => ({
  fetchCareerMemoryFromDB: jest.fn(),
}));
jest.mock("@/lib/db/resume-source-profile", () => ({
  fetchResumeSourceProfile: jest.fn(),
}));

import { db } from "@/lib/db/client";
import { fetchCareerMemoryFromDB } from "@/lib/db/mappers/career-memory.mapper";
import { fetchResumeSourceProfile } from "@/lib/db/resume-source-profile";
import {
  InvalidQuickResumeArtifactError,
  loadStructuredResumeSource,
} from "./structured-resume-input";
import { buildStructuredResumePdf } from "./structured-resume-pdf";

function pdfVisibleText(buffer: Buffer) {
  const encoded = buffer.toString("latin1");
  return Array.from(
    encoded.matchAll(/\(((?:\\.|[^\\)])*)\)\s+Tj/g),
    (match) => new TextDecoder("windows-1252")
      .decode(Buffer.from(match[1], "latin1"))
      .replace(/\\([\\()])/g, "$1")
  ).join(" ");
}

describe("loadStructuredResumeSource Quick Resume projection", () => {
  it("uses the saved document artifact without merging unrelated Career Profile data", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      id: "quick-resume-1",
      userId: "user-1",
      state: "QA_REVIEWED",
      strategyJson: { engine: "quick_resume_v1", artifactVersion: 3 },
      latexSource: null,
      roleType: null,
      targetRole: "Warehouse Supervisor",
      targetCompany: null,
      jdText: "Warehouse supervisor job description.",
      jdKeywords: [],
      summaryText: "Warehouse shift lead with grounded operational experience.",
      user: {
        name: "Candidate Name",
        email: "candidate@example.com",
        location: null,
        linkedinUrl: null,
      },
      sections: [
        {
          name: "resume_header",
          content: JSON.stringify({
            name: "Candidate Name",
            email: "candidate@example.com",
            phone: "555-0100",
            linkedin: "",
            location: "Indianapolis, IN",
          }),
        },
        {
          name: "quick_resume_draft_v1",
          content: JSON.stringify({
            version: 3,
            revision: 1,
            targetTitle: "Warehouse Supervisor",
            honestStretchNote: "",
            coreSkills: ["Scheduling", "Safety", "Team Leadership"],
            jobs: [{
              id: "job-1",
              title: "Shift Lead",
              company: "Grocery Warehouse",
              location: "Indianapolis, IN",
              dateLabel: "About four years",
              bullets: [{ id: "bullet-1", content: "Led daily shift operations.", contentType: "GENERATED" }],
            }],
            projects: [{
              id: "project-1",
              name: "Inventory Analysis",
              description: "Analyzed inventory trends using SQL.",
              technologies: ["SQL"],
              url: "",
            }],
            education: [{
              id: "education-1",
              degree: "High School Diploma",
              institution: "North High School",
              dateLabel: "Completed 2018",
              details: "Student council treasurer",
            }],
            certifications: [{
              id: "certification-1",
              name: "Forklift Certification",
              issuer: "Warehouse Safety Council",
              dateLabel: "Earned 2019",
            }],
          }),
        },
      ],
      bullets: [],
    });

    const source = await loadStructuredResumeSource("quick-resume-1", "user-1");

    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
    expect(fetchCareerMemoryFromDB).not.toHaveBeenCalled();
    expect(source?.input.jobs).toEqual([expect.objectContaining({
      id: "job-1",
      title: "Shift Lead",
      company: "Grocery Warehouse",
      dateLabel: "About four years",
      bullets: ["Led daily shift operations."],
    })]);
    expect(source?.input.education).toEqual([expect.objectContaining({
      degree: "High School Diploma",
      dateLabel: "Completed 2018",
      details: "Student council treasurer",
    })]);
    expect(source?.input.certifications).toEqual([expect.objectContaining({
      name: "Forklift Certification",
      issuingBody: "Warehouse Safety Council",
      dateLabel: "Earned 2019",
    })]);
    expect(source?.input.skills).toEqual([
      { name: "Scheduling", category: "Core Skills" },
      { name: "Safety", category: "Core Skills" },
      { name: "Team Leadership", category: "Core Skills" },
    ]);
    expect(source?.input.projects).toEqual([{
      id: "project-1",
      name: "Inventory Analysis",
      description: "Analyzed inventory trends using SQL.",
      technologies: ["SQL"],
      url: null,
      startDate: null,
      endDate: null,
    }]);
  });

  it("rejects a damaged Quick Resume instead of exporting Career Profile data", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      id: "quick-resume-1",
      userId: "user-1",
      state: "QA_REVIEWED",
      strategyJson: { engine: "quick_resume_v1", artifactVersion: 2 },
      latexSource: null,
      roleType: null,
      targetRole: "Warehouse Supervisor",
      targetCompany: null,
      jdText: "Warehouse supervisor job description.",
      jdKeywords: [],
      summaryText: "A grounded summary.",
      user: {
        name: "Candidate Name",
        email: "candidate@example.com",
        location: null,
        linkedinUrl: null,
      },
      sections: [{ name: "quick_resume_draft_v1", content: "{not-valid-json" }],
      bullets: [],
    });

    await expect(loadStructuredResumeSource("quick-resume-1", "user-1")).rejects.toBeInstanceOf(
      InvalidQuickResumeArtifactError
    );
    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
    expect(fetchCareerMemoryFromDB).not.toHaveBeenCalled();
  });

  it("rejects a marked Quick Resume whose artifact is missing", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      id: "quick-resume-1",
      userId: "user-1",
      state: "USER_EDITING",
      strategyJson: { engine: "quick_resume_v1", artifactVersion: 2 },
      latexSource: null,
      roleType: null,
      targetRole: "Warehouse Supervisor",
      targetCompany: null,
      jdText: "Warehouse supervisor job description.",
      jdKeywords: [],
      summaryText: "A grounded summary.",
      user: { name: "Candidate", email: "candidate@example.com", location: null, linkedinUrl: null },
      sections: [],
      bullets: [],
    });

    await expect(loadStructuredResumeSource("quick-resume-1", "user-1"))
      .rejects.toBeInstanceOf(InvalidQuickResumeArtifactError);
    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
    expect(fetchCareerMemoryFromDB).not.toHaveBeenCalled();
  });

  it("renders a beta-style saved artifact completely without product guidance or a fake employer", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      id: "quick-resume-beta",
      userId: "beta-user",
      state: "QA_REVIEWED",
      strategyJson: { engine: "quick_resume_v1", artifactVersion: 3 },
      latexSource: null,
      roleType: "OPERATIONS",
      targetRole: "Junior Sales Associate",
      targetCompany: null,
      jdText: "Junior sales associate supporting customers and learning sales processes.",
      jdKeywords: ["customer communication", "sales"],
      summaryText:
        "Customer-focused professional with inbound phone support experience seeking to launch a sales career.",
      user: {
        name: "Djelika Doumbia",
        email: "candidate@example.com",
        location: null,
        linkedinUrl: null,
      },
      sections: [
        {
          name: "resume_header",
          content: JSON.stringify({
            name: "Djelika Doumbia",
            email: "candidate@example.com",
            phone: "",
            linkedin: "",
            location: "",
          }),
        },
        {
          name: "quick_resume_draft_v1",
          content: JSON.stringify({
            version: 3,
            revision: 1,
            targetTitle: "Junior Sales Associate",
            honestStretchNote:
              "Candidate has not confirmed relationship-building or outreach experience.",
            coreSkills: [
              "Verbal Communication",
              "Inbound Customer Support",
              "Active Listening",
              "Phone Etiquette",
              "Customer Interaction",
              "Willingness to Learn",
            ],
            jobs: [{
              id: "job-1",
              title: "Customer Service Representative",
              company: "Previous Employer",
              location: "",
              dateLabel: "",
              bullets: [
                {
                  id: "bullet-1",
                  content:
                    "Handled inbound customer phone calls and addressed inquiries in a clear, professional manner.",
                  contentType: "GENERATED",
                },
                {
                  id: "bullet-2",
                  content:
                    "Communicated with members of the public while maintaining a courteous and composed phone presence.",
                  contentType: "GENERATED",
                },
              ],
            }],
            projects: [],
            education: [],
            certifications: [],
          }),
        },
      ],
      bullets: [],
    });

    const source = await loadStructuredResumeSource("quick-resume-beta", "beta-user");
    expect(source).not.toBeNull();
    expect(source?.input.jobs[0].company).toBe("");

    const rendered = buildStructuredResumePdf(source!.input);
    const text = pdfVisibleText(rendered.pdf);

    expect(rendered.pageCount).toBe(1);
    expect(rendered.omittedContent).toEqual([]);
    expect(text).toContain("Djelika Doumbia");
    expect(text).toContain("Junior Sales Associate");
    expect(text).toContain("Customer Service Representative");
    expect(text).toContain("Handled inbound customer phone calls");
    expect(text).toContain("Communicated with members of the public");
    expect(text).toContain("Verbal Communication");
    expect(text).not.toContain("Previous Employer");
    expect(text).not.toContain("Candidate has not confirmed");
    expect(text).not.toContain("Honest note");
  });
});
