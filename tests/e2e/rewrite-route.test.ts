import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: { resume: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock("@/lib/ai/router", () => ({ route: jest.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { route } from "@/lib/ai/router";
import { POST } from "@/app/api/resume/[id]/rewrite/route";

const USER_ID = "user-rewrite-test";
const RESUME_ID = "resume-rewrite-test";
const params = { params: Promise.resolve({ id: RESUME_ID }) };
const VALID_BULLET =
  "Reduced synthetic processing time by 20% after validating the source measurement.";
const VALID_INSTRUCTION = "Make this more concise while preserving every fact.";

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/rewrite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/rewrite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function validRequest(overrides: Record<string, unknown> = {}) {
  return request({
    bulletText: VALID_BULLET,
    instruction: VALID_INSTRUCTION,
    bulletId: "bullet-synthetic-1",
    ...overrides,
  });
}

describe("POST /api/resume/[id]/rewrite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "QA_REVIEWED",
      targetRole: "Synthetic Operations Lead",
      targetCompany: "Example Company",
      jdKeywords: ["operations", "quality"],
    });
    (db.resume.update as jest.Mock).mockResolvedValue({ id: RESUME_ID });
    (route as jest.Mock).mockResolvedValue({
      content: JSON.stringify({
        rewritten:
          "Reduced synthetic processing time 20% after validating the source measurement.",
        explanation: "Made the sentence concise while preserving the verified metric.",
      }),
      provider: "internal-provider",
      model: "internal-model",
      tokensUsed: 80,
      latencyMs: 20,
    });
  });

  it("rejects an unauthenticated request before parsing or looking up the resume", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(rawRequest("{not-json"), params);

    expect(response.status).toBe(401);
    expect(db.resume.findUnique).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before looking up the resume", async () => {
    const response = await POST(rawRequest("{not-json"), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid rewrite request." });
    expect(db.resume.findUnique).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  });

  it.each([null, [], "rewrite", 42, false])(
    "rejects a non-object request root before resume lookup: %p",
    async (body) => {
      const response = await POST(request(body), params);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid rewrite request." });
      expect(db.resume.findUnique).not.toHaveBeenCalled();
      expect(route).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["object bullet", { bulletText: { text: VALID_BULLET } }],
    ["array bullet", { bulletText: [VALID_BULLET] }],
    ["numeric instruction", { instruction: 42 }],
    ["numeric bullet id", { bulletId: 42 }],
    ["unknown field", { extra: "not accepted" }],
    ["overlong bullet", { bulletText: "b".repeat(2_001) }],
    ["overlong instruction", { instruction: "i".repeat(501) }],
    ["overlong bullet id", { bulletId: "id".repeat(101) }],
  ])("rejects %s before resume lookup", async (_label, overrides) => {
    const response = await POST(validRequest(overrides), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid rewrite request." });
    expect(db.resume.findUnique).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  });

  it.each([
    ["missing bullet", { bulletText: undefined }],
    ["blank bullet", { bulletText: "   " }],
    ["missing instruction", { instruction: undefined }],
    ["blank instruction", { instruction: "   " }],
  ])("rejects a %s before resume lookup", async (_label, overrides) => {
    const body = {
      bulletText: VALID_BULLET,
      instruction: VALID_INSTRUCTION,
      ...overrides,
    };
    const response = await POST(request(body), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid rewrite request." });
    expect(db.resume.findUnique).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing resume without invoking AI", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(validRequest(), params);

    expect(response.status).toBe(404);
    expect(route).not.toHaveBeenCalled();
  });

  it("returns 403 for a cross-user resume without invoking AI", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: "another-user",
      state: "QA_REVIEWED",
      targetRole: null,
      targetCompany: null,
      jdKeywords: [],
    });

    const response = await POST(validRequest(), params);

    expect(response.status).toBe(403);
    expect(route).not.toHaveBeenCalled();
  });

  it("returns 409 for a non-editable resume without invoking AI", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "GENERATING",
      targetRole: null,
      targetCompany: null,
      jdKeywords: [],
    });

    const response = await POST(validRequest(), params);

    expect(response.status).toBe(409);
    expect(route).not.toHaveBeenCalled();
  });

  it("returns a bounded suggestion without exposing provider details or changing state", async () => {
    const response = await POST(
      request({
        bulletText: `  ${VALID_BULLET}  `,
        instruction: `  ${VALID_INSTRUCTION}  `,
        bulletId: "  bullet-synthetic-1  ",
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      original: VALID_BULLET,
      rewritten:
        "Reduced synthetic processing time 20% after validating the source measurement.",
      explanation: "Made the sentence concise while preserving the verified metric.",
      instruction: VALID_INSTRUCTION,
      bulletId: "bullet-synthetic-1",
    });
    expect(db.resume.update).not.toHaveBeenCalled();
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "bullet-rewrite",
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(`"${VALID_BULLET}"`),
          }),
        ],
      })
    );
  });

  it("accepts an omitted bullet id and returns null", async () => {
    const response = await POST(
      request({ bulletText: VALID_BULLET, instruction: VALID_INSTRUCTION }),
      params
    );

    expect(response.status).toBe(200);
    expect((await response.json()).bulletId).toBeNull();
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("accepts accidental JSON markdown fences but returns only validated fields", async () => {
    (route as jest.Mock).mockResolvedValue({
      content:
        "```json\n{\"rewritten\":\"Validated synthetic rewrite.\",\"explanation\":\"Preserved the source facts.\",\"ignored\":\"internal\"}\n```",
      provider: "internal-provider",
    });

    const response = await POST(validRequest(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      original: VALID_BULLET,
      rewritten: "Validated synthetic rewrite.",
      explanation: "Preserved the source facts.",
      instruction: VALID_INSTRUCTION,
      bulletId: "bullet-synthetic-1",
    });
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{not-json"],
    ["null root", "null"],
    ["array root", "[]"],
    ["missing explanation", JSON.stringify({ rewritten: "Valid rewrite." })],
    [
      "blank rewrite",
      JSON.stringify({ rewritten: "   ", explanation: "A valid explanation." }),
    ],
    [
      "non-string rewrite",
      JSON.stringify({ rewritten: { text: "unsafe" }, explanation: "Explanation." }),
    ],
    [
      "blank explanation",
      JSON.stringify({ rewritten: "Valid rewrite.", explanation: "   " }),
    ],
    [
      "overlong rewrite",
      JSON.stringify({ rewritten: "r".repeat(2_001), explanation: "Explanation." }),
    ],
    [
      "overlong explanation",
      JSON.stringify({ rewritten: "Valid rewrite.", explanation: "e".repeat(501) }),
    ],
  ])("rejects %s model output without mutating the resume", async (_label, content) => {
    (route as jest.Mock).mockResolvedValue({
      content,
      provider: "internal-provider",
    });

    const response = await POST(validRequest(), params);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "AI returned an invalid rewrite. Please try again.",
    });
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("keeps router failures bounded without mutating the resume", async () => {
    (route as jest.Mock).mockRejectedValue(new Error("synthetic provider failure"));

    const response = await POST(validRequest(), params);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "AI rewrite failed. Please try again.",
    });
    expect(db.resume.update).not.toHaveBeenCalled();
  });
});
