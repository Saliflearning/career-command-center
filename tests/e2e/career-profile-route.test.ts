import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: {
    careerMemory: { upsert: jest.fn(), findUnique: jest.fn() },
    workHistory: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    education: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    skill: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    certification: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    resumeBullet: { count: jest.fn() },
    bullet: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { POST } from "@/app/api/career-profile/route";

const USER_ID = "user-career-profile";
const MEMORY_ID = "memory-career-profile";
const ENTRY_ID = "experience-career-profile";

const transactionClient = {
  workHistory: { update: jest.fn() },
  bullet: { deleteMany: jest.fn(), createMany: jest.fn() },
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/career-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string) {
  return new NextRequest("http://localhost/api/career-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function experienceData(overrides: Record<string, unknown> = {}) {
  return {
    title: "Operations Supervisor",
    company: "Example Distribution",
    startDate: "2022-01-01",
    endDate: "2025-01-01",
    current: false,
    location: "Indianapolis, IN",
    bullets: "Led a team of 24 across daily operations.\nReduced processing delays by 18%.",
    ...overrides,
  };
}

describe("POST /api/career-profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.careerMemory.upsert as jest.Mock).mockResolvedValue({ id: MEMORY_ID });
    (db.workHistory.findFirst as jest.Mock).mockResolvedValue({ id: ENTRY_ID });
    (db.workHistory.create as jest.Mock).mockResolvedValue({ id: ENTRY_ID });
    (transactionClient.workHistory.update as jest.Mock).mockResolvedValue({ id: ENTRY_ID });
    (transactionClient.bullet.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (transactionClient.bullet.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    (db.$transaction as jest.Mock).mockImplementation(async (operation) =>
      operation(transactionClient)
    );
  });

  it("rejects unauthenticated mutations before parsing or persistence", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(rawRequest("{not-json"));

    expect(response.status).toBe(401);
    expect(db.careerMemory.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before creating Career Memory", async () => {
    const response = await POST(rawRequest("{not-json"));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Invalid profile update" });
    expect(db.careerMemory.upsert).not.toHaveBeenCalled();
  });

  it.each([
    experienceData({ title: "" }),
    experienceData({ company: "" }),
    experienceData({ startDate: "not-a-date" }),
    experienceData({ startDate: "1" }),
    experienceData({ startDate: "2025-02-30" }),
    experienceData({ current: "false" }),
  ])("rejects an invalid experience before creating Career Memory", async (data) => {
    const response = await POST(
      request({ action: "create", category: "experience", data })
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Invalid profile entry" });
    expect(db.careerMemory.upsert).not.toHaveBeenCalled();
    expect(db.workHistory.create).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date without persisting", async () => {
    const response = await POST(
      request({
        action: "create",
        category: "experience",
        data: experienceData({ startDate: "2025-01-01", endDate: "2024-12-31" }),
      })
    );

    expect(response.status).toBe(422);
    expect(db.careerMemory.upsert).not.toHaveBeenCalled();
    expect(db.workHistory.create).not.toHaveBeenCalled();
  });

  it("rejects a blank skill instead of creating empty reusable evidence", async () => {
    const response = await POST(
      request({ action: "create", category: "skills", data: { title: "   " } })
    );

    expect(response.status).toBe(422);
    expect(db.careerMemory.upsert).not.toHaveBeenCalled();
    expect(db.skill.create).not.toHaveBeenCalled();
  });

  it("drops an end date for a current role rather than storing contradictory dates", async () => {
    const response = await POST(
      request({
        action: "create",
        category: "experience",
        data: experienceData({ current: true, endDate: "2025-01-01" }),
      })
    );

    expect(response.status).toBe(200);
    expect(db.workHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startDate: new Date("2022-01-01"),
          endDate: null,
          current: true,
        }),
      })
    );
  });

  it("updates experience fields and unlinked manual bullets in one transaction", async () => {
    const response = await POST(
      request({
        action: "update",
        category: "experience",
        id: ENTRY_ID,
        data: experienceData(),
      })
    );

    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.workHistory.update).not.toHaveBeenCalled();
    expect(db.bullet.deleteMany).not.toHaveBeenCalled();
    expect(transactionClient.workHistory.update).toHaveBeenCalledTimes(1);
    expect(transactionClient.bullet.deleteMany).toHaveBeenCalledWith({
      where: {
        workHistoryId: ENTRY_ID,
        contentType: "USER_EDITED",
        usedInResumes: { none: {} },
      },
    });
    expect(transactionClient.bullet.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          workHistoryId: ENTRY_ID,
          content: "Led a team of 24 across daily operations.",
          contentType: "USER_EDITED",
          locked: true,
        }),
      ]),
    });
  });

  it("rejects cross-user updates before any transaction", async () => {
    (db.workHistory.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      request({
        action: "update",
        category: "experience",
        id: ENTRY_ID,
        data: experienceData(),
      })
    );

    expect(response.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(transactionClient.workHistory.update).not.toHaveBeenCalled();
  });
});
