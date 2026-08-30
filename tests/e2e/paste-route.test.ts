import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: { resume: { findUnique: jest.fn(), update: jest.fn() } },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { POST } from "@/app/api/resume/[id]/paste/route";

const USER_ID = "user-paste-test";
const RESUME_ID = "resume-paste-test";
const params = { params: Promise.resolve({ id: RESUME_ID }) };
const VALID_TEXT = "A concise synthetic resume source sentence. ".repeat(6);

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/paste`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/paste`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/resume/[id]/paste", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      id: RESUME_ID,
      userId: USER_ID,
      state: "FAILED",
    });
    (db.resume.update as jest.Mock).mockResolvedValue({ id: RESUME_ID });
  });

  it("rejects malformed JSON before replacing the source resume", async () => {
    const response = await POST(rawRequest("{not-json"), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it.each([null, [], "resume text", 42, false])(
    "rejects a non-object JSON root before persistence: %p",
    async (body) => {
      const response = await POST(request(body), params);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Request body must be a JSON object.",
      });
      expect(db.resume.update).not.toHaveBeenCalled();
    }
  );

  it.each([null, 42, { text: VALID_TEXT }, [VALID_TEXT]])(
    "rejects a non-string resumeText before persistence: %p",
    async (resumeText) => {
      const response = await POST(request({ resumeText }), params);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "resumeText must be a string.",
      });
      expect(db.resume.update).not.toHaveBeenCalled();
    }
  );

  it("retains the missing-text validation", async () => {
    const response = await POST(request({}), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Paste more of your resume so the workspace has enough context.",
    });
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it.each([
    ["too short", "short", "Paste more of your resume so the workspace has enough context."],
    [
      "too long",
      "A".repeat(80_001),
      "Pasted resume is too long. Keep it under 80,000 characters.",
    ],
  ])("rejects %s text before persistence", async (_label, resumeText, error) => {
    const response = await POST(request({ resumeText }), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("trims valid text and resets only a failed resume to uploaded", async () => {
    const response = await POST(request({ resumeText: `  ${VALID_TEXT}  ` }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(db.resume.update).toHaveBeenCalledWith({
      where: { id: RESUME_ID },
      data: {
        state: "UPLOADED",
        sections: {
          deleteMany: { name: "source_resume" },
          create: {
            name: "source_resume",
            sortOrder: -1,
            visible: false,
            content: VALID_TEXT.trim(),
          },
        },
      },
    });
  });

  it("preserves a non-failed resume state while replacing pasted source text", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      id: RESUME_ID,
      userId: USER_ID,
      state: "USER_EDITING",
    });

    const response = await POST(request({ resumeText: VALID_TEXT }), params);

    expect(response.status).toBe(200);
    expect(db.resume.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "USER_EDITING" }),
      })
    );
  });
});
