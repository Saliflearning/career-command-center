import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));

jest.mock("@/lib/db/client", () => ({
  db: {
    resume: {
      findUnique: jest.fn(),
    },
    resumeSection: {
      findFirst: jest.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { GET } from "@/app/api/resume/[id]/status/route";

const RESUME_ID = "resume-status-test";
const USER_ID = "user-status-test";
const params = { params: Promise.resolve({ id: RESUME_ID }) };

function request() {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/status`);
}

function resume(overrides: Record<string, unknown> = {}) {
  return {
    id: RESUME_ID,
    userId: USER_ID,
    state: "FAILED",
    updatedAt: new Date("2026-07-20T16:00:00.000Z"),
    pipelineStartedAt: new Date("2026-07-20T15:59:00.000Z"),
    pipelineFinishedAt: new Date("2026-07-20T15:59:30.000Z"),
    ...overrides,
  };
}

describe("GET /api/resume/[id]/status error boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue(resume());
  });

  it("does not expose a stored Prisma exception", async () => {
    const raw = "[NORMALIZED] Invalid `prisma.education.findFirst()` invocation: Argument `equals` must not be null. careerMemoryId=private-record";
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue({ content: raw });

    const response = await GET(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errorMessage).toBe(
      "Generation stopped before the draft was ready. Try again."
    );
    expect(JSON.stringify(body)).not.toContain("prisma");
    expect(JSON.stringify(body)).not.toContain("private-record");
  });

  it("maps unreadable source failures to safe recovery guidance", async () => {
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue({
      content: "[UPLOADED] Orchestrator: resume.pdfUrl is null - cannot fetch file",
    });

    const response = await GET(request(), params);

    expect((await response.json()).errorMessage).toBe(
      "We could not read enough resume evidence. Try another file or paste the resume text."
    );
  });

  it("maps missing job context to safe recovery guidance", async () => {
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue({
      content: "[VERIFIED] Pipeline fault: jdText is null at preflight",
    });

    const response = await GET(request(), params);

    expect((await response.json()).errorMessage).toBe(
      "We could not read the job description. Return to New Resume and paste it again."
    );
  });

  it("does not load a pipeline error for a non-failed resume", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      resume({ state: "GENERATING", pipelineFinishedAt: null })
    );

    const response = await GET(request(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errorMessage).toBeNull();
    expect(db.resumeSection.findFirst).not.toHaveBeenCalled();
  });

  it("preserves ownership rejection without loading internal errors", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      resume({ userId: "another-user" })
    );

    const response = await GET(request(), params);

    expect(response.status).toBe(403);
    expect(db.resumeSection.findFirst).not.toHaveBeenCalled();
  });

  it("preserves unauthenticated rejection without querying resume state", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(request(), params);

    expect(response.status).toBe(401);
    expect(db.resume.findUnique).not.toHaveBeenCalled();
    expect(db.resumeSection.findFirst).not.toHaveBeenCalled();
  });

  it("preserves missing-resume handling without loading internal errors", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await GET(request(), params);

    expect(response.status).toBe(404);
    expect(db.resumeSection.findFirst).not.toHaveBeenCalled();
  });

  it("returns no recovery message when a failed resume has no stored diagnostic", async () => {
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(request(), params);

    expect(response.status).toBe(200);
    expect((await response.json()).errorMessage).toBeNull();
  });
});
