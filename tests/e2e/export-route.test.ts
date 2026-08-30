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
jest.mock("@/agents/visual-qa", () => ({ runVisualQA: jest.fn() }));
jest.mock("@/lib/resume/visual-quality-gate", () => ({ expectedSectionsFor: jest.fn(() => []) }));
jest.mock("@/lib/storage/adapter", () => ({
  storage: { upload: jest.fn() },
}));
jest.mock("@/lib/db/client", () => ({
  db: { resume: { update: jest.fn() } },
}));
jest.mock("@/lib/state/machine", () => ({
  ResumeState: { EXPORTED: "EXPORTED" },
  transition: jest.fn(),
}));
jest.mock("@/lib/resume/state-capabilities", () => ({
  isResumeExportableState: jest.fn(() => true),
}));

import { getServerSession } from "next-auth";
import { loadStructuredResumeSource } from "@/lib/export/structured-resume-input";
import {
  buildStructuredResumePdf,
  StructuredResumeContentError,
  StructuredResumeOverflowError,
} from "@/lib/export/structured-resume-pdf";
import { runVisualQA } from "@/agents/visual-qa";
import { storage } from "@/lib/storage/adapter";
import { db } from "@/lib/db/client";
import { transition } from "@/lib/state/machine";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";
import { POST } from "@/app/api/export/[id]/route";

const USER_ID = "user-export-test";
const RESUME_ID = "resume-export-test";
const params = { params: Promise.resolve({ id: RESUME_ID }) };

describe("POST /api/export/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (loadStructuredResumeSource as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "USER_EDITING",
      input: {
        roleType: "OPERATIONS",
        candidate: { name: "Example Candidate" },
      },
    });
    (buildStructuredResumePdf as jest.Mock).mockReturnValue({
      pdf: Buffer.from("pdf"),
      pageCount: 1,
      density: "standard",
    });
    (runVisualQA as jest.Mock).mockResolvedValue({
      screenshot: Buffer.from("png"),
      result: { passed: true, checks: {} },
    });
    (storage.upload as jest.Mock)
      .mockResolvedValueOnce("https://signed.example/export.pdf")
      .mockRejectedValueOnce(new Error("415 invalid_mime_type"));
    (db.resume.update as jest.Mock).mockResolvedValue({ id: RESUME_ID });
    (transition as jest.Mock).mockResolvedValue(undefined);
    (isResumeExportableState as unknown as jest.Mock).mockReturnValue(true);
  });

  it("rejects unauthenticated export before loading or rendering", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(response.status).toBe(401);
    expect(loadStructuredResumeSource).not.toHaveBeenCalled();
    expect(buildStructuredResumePdf).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects missing and non-exportable resumes before rendering", async () => {
    (loadStructuredResumeSource as jest.Mock).mockResolvedValueOnce(null);
    const missing = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );
    expect(missing.status).toBe(404);

    (loadStructuredResumeSource as jest.Mock).mockResolvedValueOnce({
      userId: USER_ID,
      state: "GENERATING",
      input: { roleType: "OPERATIONS", candidate: { name: "Example Candidate" } },
    });
    (isResumeExportableState as unknown as jest.Mock).mockReturnValue(false);
    const processing = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(processing.status).toBe(409);
    expect(buildStructuredResumePdf).not.toHaveBeenCalled();
    expect(runVisualQA).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("completes the export when the optional PNG diagnostic upload is rejected", async () => {
    const response = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pdfUrl: "https://signed.example/export.pdf",
      pageCount: 1,
      visualQa: "passed",
    });
    expect(db.resume.update).toHaveBeenCalledWith({
      where: { id: RESUME_ID },
      data: expect.objectContaining({
        pdfUrl: "https://signed.example/export.pdf",
        pageCount: 1,
        exportedAt: expect.any(Date),
      }),
    });
    expect(transition).toHaveBeenCalledWith(RESUME_ID, "EXPORTED");
    expect((runVisualQA as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (storage.upload as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it("does not publish a structured candidate that fails visual QA", async () => {
    (runVisualQA as jest.Mock).mockResolvedValue({
      screenshot: Buffer.alloc(0),
      result: {
        passed: false,
        checks: { pageCount: { status: "failed" } },
      },
    });

    const response = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(response.status).toBe(422);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns a recoverable 422 when complete canonical content cannot fit one page", async () => {
    (buildStructuredResumePdf as jest.Mock).mockImplementation(() => {
      throw new StructuredResumeOverflowError("one-page overflow");
    });

    const response = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error:
        "This resume contains more content than can fit on one page without removing information. Shorten it in the editor and try again.",
      code: "RESUME_ONE_PAGE_OVERFLOW",
    });
    expect(runVisualQA).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns a recoverable 422 when canonical content cannot be represented safely", async () => {
    (buildStructuredResumePdf as jest.Mock).mockImplementation(() => {
      throw new StructuredResumeContentError();
    });

    const response = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error:
        "This resume contains text that cannot be exported without changing it. Review that text in the editor and try again.",
      code: "RESUME_UNSUPPORTED_CONTENT",
    });
    expect(runVisualQA).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("does not publish or claim visual QA when the gate cannot complete", async () => {
    (runVisualQA as jest.Mock).mockRejectedValue(new Error("renderer unavailable"));

    const response = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "The final visual integrity check could not be completed. Please try again.",
      code: "VISUAL_QA_UNAVAILABLE",
    });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("returns a bounded error when the final PDF cannot be stored", async () => {
    (storage.upload as jest.Mock).mockReset().mockRejectedValue(
      new Error("private bucket diagnostic")
    );

    const response = await POST(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}`, { method: "POST" }),
      params
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The exported PDF could not be stored. Please try again.",
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(db.resume.update).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });
});
