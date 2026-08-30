import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: {
    resume: { findUnique: jest.fn() },
    resumeSection: { deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { POST } from "@/app/api/resume/[id]/evidence/route";

const USER_ID = "user-evidence";
const RESUME_ID = "resume-evidence";
const params = { params: Promise.resolve({ id: RESUME_ID }) };

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/resume/[id]/evidence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue({ userId: USER_ID });
    (db.resumeSection.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.resumeSection.create as jest.Mock).mockResolvedValue({ id: "evidence-section" });
    (db.$transaction as jest.Mock).mockImplementation(async (operation) => {
      if (typeof operation === "function") return operation(db);
      return Promise.all(operation);
    });
  });

  it("rejects an unauthenticated request before reading the resume", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(request({ evidence: [] }), params);

    expect(response.status).toBe(401);
    expect(db.resume.findUnique).not.toHaveBeenCalled();
  });

  it("rejects cross-user evidence writes before persistence", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({ userId: "another-user" });

    const response = await POST(request({ evidence: [] }), params);

    expect(response.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.resumeSection.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing resume without starting a transaction", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(request({ evidence: [] }), params);

    expect(response.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.resumeSection.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-array evidence payload", async () => {
    const response = await POST(request({ evidence: { term: "Python" } }), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Evidence must be an array." });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.resumeSection.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON without clearing prior evidence", async () => {
    const response = await POST(rawRequest("{not-json"), params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON." });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.resumeSection.deleteMany).not.toHaveBeenCalled();
  });

  it("atomically replaces evidence after applying length and count bounds", async () => {
    const evidence = Array.from({ length: 14 }, (_, index) => ({
      term: `  Term ${index} ${"x".repeat(140)}  `,
      category: `  Category ${"y".repeat(100)}  `,
      source: `  Employer ${index} - Role ${"z".repeat(260)}  `,
      details: `  Truthful result ${index} ${"d".repeat(700)}  `,
    }));

    const response = await POST(request({ evidence }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 12 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.resumeSection.deleteMany).toHaveBeenCalledWith({
      where: { resumeId: RESUME_ID, name: "user_evidence" },
    });
    expect(db.resumeSection.create).toHaveBeenCalledTimes(1);

    const createCall = (db.resumeSection.create as jest.Mock).mock.calls[0][0];
    const saved = JSON.parse(createCall.data.content) as Array<Record<string, string>>;
    expect(saved).toHaveLength(12);
    expect(saved[0].term).toHaveLength(120);
    expect(saved[0].category).toHaveLength(80);
    expect(saved[0].source).toHaveLength(240);
    expect(saved[0].details).toHaveLength(600);
  });

  it("atomically clears prior evidence when every answer is Not yet", async () => {
    const response = await POST(request({ evidence: [] }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 0 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.resumeSection.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.resumeSection.create).not.toHaveBeenCalled();
  });
});
