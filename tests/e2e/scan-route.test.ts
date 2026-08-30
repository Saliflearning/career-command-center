import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/agents/intake", () => ({ extractResumeText: jest.fn() }));
jest.mock("@/lib/db/client", () => ({
  db: { resume: { findFirst: jest.fn() } },
}));
jest.mock("@/lib/resume/scan-analysis", () => ({
  analyzeResumeAgainstJob: jest.fn(),
}));
jest.mock("@/lib/resume/semantic-match", () => ({
  applySemanticMatching: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { extractResumeText } from "@/agents/intake";
import { db } from "@/lib/db/client";
import { analyzeResumeAgainstJob } from "@/lib/resume/scan-analysis";
import { applySemanticMatching } from "@/lib/resume/semantic-match";
import { POST } from "@/app/api/resume/scan/route";

const USER_ID = "user-scan-test";
const SOURCE_ID = "source-scan-test";
const JOB_DESCRIPTION =
  "Example Distribution needs an operations supervisor to coordinate schedules, " +
  "inventory, service levels, and cross-functional planning with measurable results.";
const RESUME_TEXT =
  "Synthetic candidate evidence with operations planning, reporting, inventory, " +
  "and cross-functional coordination across multiple teams.";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/resume/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawJsonRequest(body: string) {
  return new NextRequest("http://localhost/api/resume/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function fileRequest(file: File, jobDescription: FormDataEntryValue = JOB_DESCRIPTION) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("jobDescription", jobDescription);
  return new NextRequest("http://localhost/api/resume/scan", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/resume/scan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findFirst as jest.Mock).mockResolvedValue(null);
    (extractResumeText as jest.Mock).mockResolvedValue(RESUME_TEXT);
    (analyzeResumeAgainstJob as jest.Mock).mockReturnValue({ overallScore: 40 });
    (applySemanticMatching as jest.Mock).mockResolvedValue({ overallScore: 44 });
  });

  it("rejects malformed JSON before source lookup or analysis", async () => {
    const response = await POST(rawJsonRequest("{not-json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(db.resume.findFirst).not.toHaveBeenCalled();
    expect(analyzeResumeAgainstJob).not.toHaveBeenCalled();
  });

  it.each([null, [], "saved source", 42, false])(
    "rejects a non-object JSON root before source lookup: %p",
    async (body) => {
      const response = await POST(jsonRequest(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Request body must be a JSON object.",
      });
      expect(db.resume.findFirst).not.toHaveBeenCalled();
      expect(analyzeResumeAgainstJob).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      { sourceResumeId: 42, jobDescription: JOB_DESCRIPTION },
      "sourceResumeId must be a string.",
    ],
    [
      { sourceResumeId: SOURCE_ID, jobDescription: { text: JOB_DESCRIPTION } },
      "jobDescription must be a string.",
    ],
  ])("rejects wrongly typed saved-source fields before lookup", async (body, error) => {
    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(db.resume.findFirst).not.toHaveBeenCalled();
    expect(analyzeResumeAgainstJob).not.toHaveBeenCalled();
  });

  it("scopes saved-source lookup to the authenticated user", async () => {
    const response = await POST(
      jsonRequest({ sourceResumeId: SOURCE_ID, jobDescription: JOB_DESCRIPTION })
    );

    expect(response.status).toBe(404);
    expect(db.resume.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SOURCE_ID, userId: USER_ID } })
    );
    expect(analyzeResumeAgainstJob).not.toHaveBeenCalled();
  });

  it("rejects malformed multipart data before extraction", async () => {
    const request = {
      headers: new Headers({ "content-type": "multipart/form-data" }),
      formData: jest.fn().mockRejectedValue(new Error("multipart boundary internals")),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Scan body must be valid form data.",
    });
    expect(extractResumeText).not.toHaveBeenCalled();
  });

  it("rejects an empty resume file before extraction", async () => {
    const response = await POST(
      fileRequest(new File([], "candidate.pdf", { type: "application/pdf" }))
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Resume file is empty." });
    expect(extractResumeText).not.toHaveBeenCalled();
  });

  it("normalizes a DOCX extension case-insensitively before extraction", async () => {
    const response = await POST(
      fileRequest(
        new File(["docx bytes"], "Candidate.DOCX", {
          type: "application/octet-stream",
        })
      )
    );

    expect(response.status).toBe(200);
    expect(extractResumeText).toHaveBeenCalledWith(expect.any(Buffer), DOCX_MIME);
    expect(analyzeResumeAgainstJob).toHaveBeenCalledWith(RESUME_TEXT, JOB_DESCRIPTION);
    expect(applySemanticMatching).toHaveBeenCalledWith({ overallScore: 40 }, RESUME_TEXT);
  });

  it("rejects unsupported files before extraction", async () => {
    const response = await POST(
      fileRequest(new File(["plain text"], "candidate.txt", { type: "text/plain" }))
    );

    expect(response.status).toBe(400);
    expect(extractResumeText).not.toHaveBeenCalled();
  });

  it("rejects files larger than 10 MB before extraction", async () => {
    const response = await POST(
      fileRequest(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "candidate.pdf", {
          type: "application/pdf",
        })
      )
    );

    expect(response.status).toBe(400);
    expect(extractResumeText).not.toHaveBeenCalled();
  });

  it("keeps extraction diagnostics out of the response", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (extractResumeText as jest.Mock).mockRejectedValue(
      new Error("parser worker path and provider internals")
    );

    const response = await POST(
      fileRequest(new File(["%PDF"], "candidate.pdf", { type: "application/pdf" }))
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "We could not read this file. Try paste mode or another document.",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "resume_scan_failed",
      expect.objectContaining({ message: "parser worker path and provider internals" })
    );
    errorSpy.mockRestore();
  });
});
