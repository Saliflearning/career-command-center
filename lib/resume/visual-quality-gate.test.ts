jest.mock("@/lib/export/structured-resume-input", () => ({
  loadStructuredResumeSource: jest.fn(),
}));
jest.mock("@/lib/export/structured-resume-pdf", () => ({
  buildStructuredResumePdf: jest.fn(),
}));
jest.mock("@/agents/visual-qa", () => ({
  runVisualQA: jest.fn(),
}));
jest.mock("@/lib/storage/adapter", () => ({
  storage: { upload: jest.fn() },
}));
jest.mock("@/lib/db/client", () => ({
  db: {
    resumeSection: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    resume: { update: jest.fn() },
  },
}));

import { runResumeVisualQualityGate } from "./visual-quality-gate";
import { loadStructuredResumeSource } from "@/lib/export/structured-resume-input";
import { buildStructuredResumePdf } from "@/lib/export/structured-resume-pdf";
import { runVisualQA } from "@/agents/visual-qa";
import { storage } from "@/lib/storage/adapter";
import { db } from "@/lib/db/client";

const asMock = (fn: unknown) => fn as jest.Mock;

const SOURCE = {
  id: "resume-1",
  userId: "user-1",
  state: "QA_REVIEWED",
  latexSource: null,
  input: {
    roleType: "DATA",
    targetRole: "Data Analyst",
    targetCompany: null,
    headline: null,
    candidate: {
      name: "Jordan Blake",
      email: "jordan@example.com",
      phone: null,
      linkedin: null,
      location: null,
      website: null,
    },
    summary: "Data analyst with grounded operational experience.",
    presentation: {},
    jobs: [{
      id: "job-1",
      title: "Data Analyst",
      company: "Midwest Retail Group",
      location: null,
      startDate: "",
      endDate: null,
      current: false,
      sortOrder: 0,
      bullets: ["Built Tableau dashboards across 45 stores."],
    }],
    projects: [],
    education: [],
    skills: [{ name: "SQL", category: "Core Skills" }],
    certifications: [],
  },
};

const RENDERED = {
  pdf: Buffer.from("%PDF-1.4 fake preview"),
  density: 0.2,
  omittedContent: [],
  pageCount: 1,
};

// Visual QA passes so we isolate the upload-failure behavior (not a QA failure).
const QA_PASS = {
  result: { passed: true, checks: {}, score: 90, screenshotUrl: null },
  screenshot: Buffer.alloc(0),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  asMock(loadStructuredResumeSource).mockResolvedValue(SOURCE);
  asMock(buildStructuredResumePdf).mockReturnValue(RENDERED);
  asMock(runVisualQA).mockResolvedValue(QA_PASS);
  asMock(db.resumeSection.findFirst).mockResolvedValue(null);
  asMock(db.resumeSection.create).mockResolvedValue({});
  asMock(db.resume.update).mockResolvedValue({});
});

describe("runResumeVisualQualityGate — preview PDF upload is non-fatal", () => {
  it("does NOT fail the gate when the preview PDF upload is rejected by storage", async () => {
    // Exactly the failure the live smoke test hit: storage endpoint refused.
    asMock(storage.upload).mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:55433"));

    const persisted = await runResumeVisualQualityGate("resume-1");

    // Resume content is complete: QA still ran against the in-memory buffer,
    // the result was still persisted, and nothing threw (so the pipeline will
    // not cascade the resume to FAILED).
    expect(runVisualQA).toHaveBeenCalled();
    expect(db.resumeSection.create).toHaveBeenCalled();
    // The cached preview path is null because the upload did not land.
    expect(persisted.pdfPath).toBeNull();
  });

  it("records the preview PDF path when the upload succeeds", async () => {
    asMock(storage.upload).mockResolvedValue("https://signed.example/final-preview.pdf");

    const persisted = await runResumeVisualQualityGate("resume-1");

    expect(persisted.pdfPath).toBe("user-1/resume-1/quality/final-preview.pdf");
  });
});
