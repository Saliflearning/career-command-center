import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

jest.mock("@/agents/intake", () => ({ extractResumeText: jest.fn() }));
jest.mock("@/lib/resume/scan-analysis", () => ({
  analyzeResumeAgainstJob: jest.fn(),
}));
jest.mock("botid/server", () => ({ checkBotId: jest.fn() }));

import { extractResumeText } from "@/agents/intake";
import { analyzeResumeAgainstJob } from "@/lib/resume/scan-analysis";
import { checkBotId } from "botid/server";
import { POST } from "@/app/api/public/resume-scan/route";

const RESUME_TEXT =
  "Candidate Name\nemail@example.com\nExperience\nLed distribution planning and inventory reporting across multiple teams, improving service levels by 18 percent.";
const JOB_DESCRIPTION =
  "Production Planning Supervisor at Example Distribution LLC\nCoordinate production schedules, inventory, capacity planning, Excel reporting, and cross-functional teams.";
const ANALYSIS = {
  score: 72,
  atsScore: 88,
  keywordScore: 70,
  evidenceScore: 64,
  signalScore: 66,
  fitLabel: "Moderate alignment",
  summary: "Moderate alignment. The largest truthful opportunities are capacity planning and Excel.",
  matchedCount: 7,
  missingCount: 3,
  totalKeywords: 10,
  matchedKeywords: ["production schedules", "inventory"],
  requirementDetails: [
    {
      term: "production schedules",
      category: "Job requirement",
      why: "The job description treats this as a unit of required experience.",
      importance: "important",
      status: "matched",
      evidence: "Led distribution planning and inventory reporting across multiple teams, improving service levels by 18 percent.",
      source: "Coordinate production schedules, inventory, capacity planning, Excel reporting, and cross-functional teams.",
      weight: 3,
      kind: "phrase",
    },
  ],
  missingKeywordDetails: [
    { term: "capacity planning", category: "Job requirement", why: "The job emphasizes this requirement." },
  ],
  missingTermDetailsAll: [
    { term: "capacity planning", category: "Job requirement", why: "Internal uncapped diagnostic." },
  ],
  quickWins: ["Add truthful capacity-planning evidence if you have it."],
};

function jsonRequest(body: unknown, ip = "203.0.113.10") {
  return new NextRequest("http://localhost/api/public/resume-scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function rawJsonRequest(body: string) {
  return new NextRequest("http://localhost/api/public/resume-scan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.11" },
    body,
  });
}

function fileRequest(file: File, jobDescription: string = JOB_DESCRIPTION) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("jobDescription", jobDescription);
  return new NextRequest("http://localhost/api/public/resume-scan", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.12" },
    body: formData,
  });
}

describe("POST /api/public/resume-scan", () => {
  const originalVercel = process.env.VERCEL;

  beforeEach(() => {
    process.env.VERCEL = "1";
    jest.clearAllMocks();
    (checkBotId as jest.Mock).mockResolvedValue({ isBot: false });
    (extractResumeText as jest.Mock).mockResolvedValue(RESUME_TEXT);
    (analyzeResumeAgainstJob as jest.Mock).mockReturnValue(ANALYSIS);
  });

  afterAll(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it("remains usable outside Vercel when BotId request context is unavailable", async () => {
    delete process.env.VERCEL;

    const response = await POST(
      jsonRequest({ resumeText: RESUME_TEXT, jobDescription: JOB_DESCRIPTION })
    );

    expect(response.status).toBe(200);
    expect(checkBotId).not.toHaveBeenCalled();
  });

  it("rejects automated requests before reading or parsing user documents", async () => {
    (checkBotId as jest.Mock).mockResolvedValue({ isBot: true });

    const response = await POST(
      jsonRequest({ resumeText: RESUME_TEXT, jobDescription: JOB_DESCRIPTION })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Automated scan requests are not allowed." });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(extractResumeText).not.toHaveBeenCalled();
    expect(analyzeResumeAgainstJob).not.toHaveBeenCalled();
  });

  it("scans pasted text and returns only the public deterministic result", async () => {
    const response = await POST(jsonRequest({ resumeText: RESUME_TEXT, jobDescription: JOB_DESCRIPTION }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(analyzeResumeAgainstJob).toHaveBeenCalledWith(RESUME_TEXT, JOB_DESCRIPTION);
    const body = await response.json();
    expect(body).toEqual({
      target: { role: "Production Planning Supervisor", company: "Example Distribution LLC" },
      analysis: {
        score: 72,
        atsScore: 88,
        keywordScore: 70,
        evidenceScore: 64,
        signalScore: 66,
        fitLabel: "Moderate alignment",
        summary: ANALYSIS.summary,
        matchedCount: 7,
        missingCount: 3,
        totalKeywords: 10,
        matchedKeywords: ["production schedules", "inventory"],
        requirementDetails: ANALYSIS.requirementDetails,
        missingKeywordDetails: ANALYSIS.missingKeywordDetails,
        quickWins: ANALYSIS.quickWins,
      },
    });
    expect(JSON.stringify(body)).not.toContain("missingTermDetailsAll");
    expect(extractResumeText).not.toHaveBeenCalled();
  });

  it("accepts a genuine PDF signature and extracts it in memory", async () => {
    const file = new File([Buffer.from("%PDF-1.7\nsynthetic")], "candidate.PDF", {
      type: "application/octet-stream",
    });

    const response = await POST(fileRequest(file));

    expect(response.status).toBe(200);
    expect(extractResumeText).toHaveBeenCalledWith(expect.any(Buffer), "application/pdf");
    expect(analyzeResumeAgainstJob).toHaveBeenCalledWith(RESUME_TEXT, JOB_DESCRIPTION);
  });

  it("accepts a genuine DOCX zip signature and extracts it in memory", async () => {
    const file = new File([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])], "candidate.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const response = await POST(fileRequest(file));

    expect(response.status).toBe(200);
    expect(extractResumeText).toHaveBeenCalledWith(
      expect.any(Buffer),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it.each([
    [new File([], "candidate.pdf", { type: "application/pdf" }), "Resume file is empty."],
    [new File(["plain text"], "candidate.txt", { type: "text/plain" }), "Use a PDF or DOCX resume."],
    [new File(["not a pdf"], "candidate.pdf", { type: "application/pdf" }), "This file does not appear to be a valid PDF."],
    [new File([Buffer.from("%PDF-1.7")], "candidate.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "This file does not appear to be a valid DOCX."],
  ])("rejects an invalid upload before parsing", async (file, error) => {
    const response = await POST(fileRequest(file));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(extractResumeText).not.toHaveBeenCalled();
  });

  it("rejects uploads larger than the public 5 MB limit", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    bytes.set(Buffer.from("%PDF-"));

    const response = await POST(fileRequest(new File([bytes], "large.pdf", { type: "application/pdf" })));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Resume files must be 5 MB or smaller." });
    expect(extractResumeText).not.toHaveBeenCalled();
  });

  it.each([
    ["{bad-json", "Invalid JSON body"],
    [JSON.stringify([]), "Request body must be a JSON object."],
  ])("returns bounded validation errors with no-store headers", async (raw, error) => {
    const response = await POST(rawJsonRequest(raw));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(analyzeResumeAgainstJob).not.toHaveBeenCalled();
  });

  it.each([
    [{ resumeText: "short", jobDescription: JOB_DESCRIPTION }, "Paste at least 80 characters of resume text."],
    [{ resumeText: RESUME_TEXT, jobDescription: "too short" }, "Paste at least 50 characters of the job description."],
    [{ resumeText: "x".repeat(30_001), jobDescription: JOB_DESCRIPTION }, "Resume text must be 30,000 characters or fewer."],
    [{ resumeText: RESUME_TEXT, jobDescription: "x".repeat(40_001) }, "Job descriptions must be 40,000 characters or fewer."],
  ])("rejects invalid public text without running analysis", async (body, error) => {
    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(analyzeResumeAgainstJob).not.toHaveBeenCalled();
  });

  it("keeps parser diagnostics out of the response", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (extractResumeText as jest.Mock).mockRejectedValue(new Error("worker path and provider internals"));
    const file = new File([Buffer.from("%PDF-1.7\nsynthetic")], "candidate.pdf", {
      type: "application/pdf",
    });

    const response = await POST(fileRequest(file));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toEqual({
      error: "We could not read this file. Try paste mode or another document.",
    });
    expect(JSON.stringify(body)).not.toContain("worker path");
    expect(errorSpy).toHaveBeenCalledWith("public_resume_scan_parse_failed");
  });

  it("contains no authentication, persistence, storage, analytics, or LLM dependency", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "app/api/public/resume-scan/route.ts"),
      "utf8"
    );

    expect(routeSource).not.toMatch(/getServerSession|authOptions|@\/lib\/db|prisma|supabase|storage|posthog|analytics|applySemanticMatching|ai\/router|anthropic|openai/i);
    expect(routeSource).not.toMatch(/console\.log/);
    expect(routeSource).not.toMatch(/@\/lib\/rate-limit|clientIp\(|\bhit\(/);
    expect(routeSource).toMatch(/checkBotId/);
    expect(routeSource).toMatch(/no-store/);
  });
});
