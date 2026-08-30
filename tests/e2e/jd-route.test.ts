import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@vercel/functions", () => ({
  waitUntil: jest.fn(),
}));

jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));

jest.mock("@/lib/db/client", () => ({
  db: {
    resume: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/agents/orchestrator", () => ({
  runPipeline: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db/client";
import { runPipeline } from "@/agents/orchestrator";
import { POST } from "@/app/api/resume/[id]/jd/route";

const RESUME_ID = "resume-claim-test";
const USER_ID = "user-claim-test";
const params = { params: Promise.resolve({ id: RESUME_ID }) };
const JD_TEXT = "Example Analytics needs a Finance Data Analyst to build accurate KPI reporting and forecasting workflows.";

const validBody = {
  jdText: JD_TEXT,
  targetRole: "Finance Data Analyst",
  targetCompany: "Example Analytics",
};

function request(body: unknown = validBody) {
  return new NextRequest("http://localhost/api/resume/" + RESUME_ID + "/jd", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string) {
  return new NextRequest("http://localhost/api/resume/" + RESUME_ID + "/jd", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function resume(overrides: Record<string, unknown> = {}) {
  return {
    id: RESUME_ID,
    userId: USER_ID,
    state: "UPLOADED",
    pipelineStartedAt: null,
    pipelineFinishedAt: null,
    ...overrides,
  };
}

describe("POST /api/resume/[id]/jd pipeline claim", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue(resume());
    (db.resume.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (runPipeline as jest.Mock).mockResolvedValue(undefined);
  });

  it("rejects a second request while a recent pipeline claim is active", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(resume({
      pipelineStartedAt: new Date(),
    }));

    const response = await POST(request(), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Generation is already queued. Refresh to view its progress.",
    });
    expect(db.resume.updateMany).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before claiming or scheduling generation", async () => {
    const response = await POST(rawRequest("{not-json"), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(db.resume.updateMany).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each([null, [], "job description", 42, true])(
    "rejects a non-object JSON root before claiming generation: %p",
    async (body) => {
      const response = await POST(request(body), params);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Request body must be a JSON object.",
      });
      expect(db.resume.updateMany).not.toHaveBeenCalled();
      expect(runPipeline).not.toHaveBeenCalled();
      expect(waitUntil).not.toHaveBeenCalled();
    }
  );

  it.each([
    [{ ...validBody, targetRole: 42 }, "targetRole must be a string."],
    [{ ...validBody, jdText: { text: JD_TEXT } }, "jdText must be a string."],
    [
      { ...validBody, targetCompany: ["Example Analytics"] },
      "targetCompany must be a string when provided.",
    ],
  ])("rejects wrongly typed fields before claiming generation", async (body, error) => {
    const response = await POST(request(body), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(db.resume.updateMany).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validBody, tone: 42 }, "tone must be a string when provided."],
    [{ ...validBody, tone: null }, "tone must be a string when provided."],
    [{ ...validBody, structure: ["Compact"] }, "structure must be a string when provided."],
    [{ ...validBody, structure: { name: "Compact" } }, "structure must be a string when provided."],
  ])("rejects wrongly typed optional controls before claiming generation", async (body, error) => {
    const response = await POST(request(body), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(db.resume.updateMany).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each([
    [
      { ...validBody, tone: "Friendly" },
      "tone must be one of: Executive, Technical, Leadership-first, Startup.",
    ],
    [
      { ...validBody, structure: "Two Column" },
      "structure must be one of: Hybrid Executive, Chronological, Functional, Compact.",
    ],
  ])("rejects unsupported optional controls before claiming generation", async (body, error) => {
    const response = await POST(request(body), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(db.resume.updateMany).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each(["Executive", "Technical", "Leadership-first", "Startup"])(
    "persists supported tone %s for the successful claimant",
    async (tone) => {
      const response = await POST(request({ ...validBody, tone }), params);

      expect(response.status).toBe(200);
      expect(db.resume.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tone }) })
      );
      expect(waitUntil).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["Hybrid Executive", "Chronological", "Functional", "Compact"])(
    "persists supported structure %s for the successful claimant",
    async (structure) => {
      const response = await POST(request({ ...validBody, structure }), params);

      expect(response.status).toBe(200);
      expect(db.resume.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ structure }) })
      );
      expect(waitUntil).toHaveBeenCalledTimes(1);
    }
  );

  it("retains the required-role validation for a missing role", async () => {
    const response = await POST(request({ jdText: JD_TEXT }), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "targetRole is required" });
    expect(db.resume.updateMany).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("does not schedule work when another request wins the optimistic claim", async () => {
    (db.resume.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const response = await POST(request(), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Generation was already started in another request. Refresh to view its progress.",
    });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("persists the request and schedules only the successful claimant", async () => {
    const response = await POST(request(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, resumeId: RESUME_ID });
    expect(db.resume.updateMany).toHaveBeenCalledWith({
      where: {
        id: RESUME_ID,
        userId: USER_ID,
        state: "UPLOADED",
        pipelineStartedAt: null,
        pipelineFinishedAt: null,
      },
      data: {
        jdText: JD_TEXT,
        targetRole: "Finance Data Analyst",
        targetCompany: "Example Analytics",
        pipelineStartedAt: expect.any(Date),
        pipelineFinishedAt: null,
      },
    });
    expect(runPipeline).toHaveBeenCalledWith(RESUME_ID);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
