/**
 * Legacy LaTeX may be stale after editor changes. Export must therefore render
 * the canonical structured source even when a worker and old LaTeX exist.
 */
import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/export/structured-resume-input", () => ({
  loadStructuredResumeSource: jest.fn(),
}));
jest.mock("@/lib/export/structured-resume-pdf", () => ({
  buildStructuredResumePdf: jest.fn(),
  StructuredResumeContentError: class StructuredResumeContentError extends Error {
    code = "RESUME_UNSUPPORTED_CONTENT";
  },
  StructuredResumeOverflowError: class StructuredResumeOverflowError extends Error {
    code = "RESUME_ONE_PAGE_OVERFLOW";
  },
}));
jest.mock("@/lib/latex/renderer", () => ({ renderLatex: jest.fn() }));
jest.mock("@/agents/visual-qa", () => ({ runVisualQA: jest.fn() }));
jest.mock("@/lib/resume/visual-quality-gate", () => ({ expectedSectionsFor: jest.fn(() => []) }));
jest.mock("@/lib/storage/adapter", () => ({ storage: { upload: jest.fn() } }));
jest.mock("@/lib/db/client", () => ({ db: { resume: { update: jest.fn() } } }));
jest.mock("@/lib/state/machine", () => ({
  ResumeState: { EXPORTED: "EXPORTED" },
  transition: jest.fn(),
}));
jest.mock("@/lib/resume/state-capabilities", () => ({
  isResumeExportableState: jest.fn(() => true),
}));

import { getServerSession } from "next-auth";
import { loadStructuredResumeSource } from "@/lib/export/structured-resume-input";
import { buildStructuredResumePdf } from "@/lib/export/structured-resume-pdf";
import { renderLatex } from "@/lib/latex/renderer";
import { runVisualQA } from "@/agents/visual-qa";
import { storage } from "@/lib/storage/adapter";
import { db } from "@/lib/db/client";
import { POST } from "@/app/api/export/[id]/route";

const USER_ID = "user-latex-test";
const RESUME_ID = "resume-latex-test";
const STRUCTURED_PDF = Buffer.from("%PDF structured");

const passQA = { result: { passed: true, pageCountActual: 1, checks: {} }, screenshot: Buffer.alloc(0) };

function request() {
  return POST({} as NextRequest, { params: Promise.resolve({ id: RESUME_ID }) });
}

describe("canonical structured export selection", () => {
  const OLD_ENV = process.env.LATEX_WORKER_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (loadStructuredResumeSource as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "USER_EDITING",
      latexSource: "\\documentclass{article}\\begin{document}x\\end{document}",
      input: { roleType: "OPERATIONS", candidate: { name: "Example Candidate" } },
    });
    (buildStructuredResumePdf as jest.Mock).mockReturnValue({ pdf: STRUCTURED_PDF, pageCount: 1 });
    (renderLatex as jest.Mock).mockResolvedValue(Buffer.from("%PDF latex"));
    (runVisualQA as jest.Mock).mockResolvedValue(passQA);
    (storage.upload as jest.Mock).mockResolvedValue("https://signed.example/export.pdf");
  });

  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.LATEX_WORKER_URL;
    else process.env.LATEX_WORKER_URL = OLD_ENV;
  });

  it("ignores stale LaTeX even when a worker is configured", async () => {
    process.env.LATEX_WORKER_URL = "http://worker.test";

    const res = await request();

    expect(res.status).toBe(200);
    expect(renderLatex).not.toHaveBeenCalled();
    expect(buildStructuredResumePdf).toHaveBeenCalledTimes(1);
    expect((storage.upload as jest.Mock).mock.calls[0][1]).toBe(STRUCTURED_PDF);
    expect((db.resume.update as jest.Mock).mock.calls[0][0].data.pageCount).toBe(1);
    expect((runVisualQA as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (storage.upload as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it("does not invoke a failing LaTeX worker", async () => {
    process.env.LATEX_WORKER_URL = "http://worker.test";
    (renderLatex as jest.Mock).mockRejectedValue(new Error("worker down"));

    const res = await request();

    expect(res.status).toBe(200);
    expect(renderLatex).not.toHaveBeenCalled();
    expect(buildStructuredResumePdf).toHaveBeenCalledTimes(1);
    const uploads = (storage.upload as jest.Mock).mock.calls.filter(
      (c) => c[2] === "application/pdf"
    );
    expect(uploads[uploads.length - 1][1]).toBe(STRUCTURED_PDF);
  });

  it("runs visual QA once against the canonical structured PDF", async () => {
    process.env.LATEX_WORKER_URL = "http://worker.test";
    const res = await request();

    expect(res.status).toBe(200);
    expect(renderLatex).not.toHaveBeenCalled();
    expect(buildStructuredResumePdf).toHaveBeenCalledTimes(1);
    expect(runVisualQA).toHaveBeenCalledTimes(1);
    const pdfUploads = (storage.upload as jest.Mock).mock.calls.filter(
      (call) => call[2] === "application/pdf"
    );
    expect(pdfUploads).toHaveLength(1);
    expect(pdfUploads[0][1]).toBe(STRUCTURED_PDF);
  });

  it("never calls the LaTeX renderer when no worker is configured", async () => {
    delete process.env.LATEX_WORKER_URL;

    const res = await request();

    expect(res.status).toBe(200);
    expect(renderLatex).not.toHaveBeenCalled();
    expect(buildStructuredResumePdf).toHaveBeenCalledTimes(1);
  });

  it("never calls the LaTeX renderer when the resume has no LaTeX source", async () => {
    process.env.LATEX_WORKER_URL = "http://worker.test";
    (loadStructuredResumeSource as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "USER_EDITING",
      latexSource: null,
      input: { roleType: "OPERATIONS", candidate: { name: "Example Candidate" } },
    });

    const res = await request();

    expect(res.status).toBe(200);
    expect(renderLatex).not.toHaveBeenCalled();
    expect(buildStructuredResumePdf).toHaveBeenCalledTimes(1);
  });
});
