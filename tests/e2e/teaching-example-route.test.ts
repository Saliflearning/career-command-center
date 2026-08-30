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
jest.mock("@/lib/db/resume-source-profile", () => ({ fetchResumeSourceProfile: jest.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { fetchResumeSourceProfile } from "@/lib/db/resume-source-profile";
import { DELETE, GET, POST } from "@/app/api/resume/[id]/teaching-example/route";

const USER_ID = "user-1";
const RESUME_ID = "resume-1";
const params = { params: Promise.resolve({ id: RESUME_ID }) };
const request = new NextRequest(`http://localhost/api/resume/${RESUME_ID}/teaching-example`);

function readyResume(overrides: Record<string, unknown> = {}) {
  return {
    id: RESUME_ID,
    userId: USER_ID,
    version: 3,
    state: "USER_EDITING",
    targetRole: "Operations Manager",
    targetCompany: "Example Co",
    jdText: "Manage warehouse throughput and safety.",
    jdKeywords: ["warehouse", "throughput", "safety"],
    summaryText: "Operations leader focused on safe, reliable execution.",
    sections: [],
    bullets: [{
      bullet: {
        content: "Improved a verified operating process.",
        workHistory: { id: "job-1", title: "Operations Lead", company: "Source Co", sortOrder: 0 },
      },
    }],
    ...overrides,
  };
}

const sourceProfile = {
  id: "memory-1",
  userId: USER_ID,
  version: 1,
  jobs: [],
  education: [{ degree: "B.S. Operations", institution: "State University" }],
  skills: [{ name: "Warehouse Operations", category: "Operations" }],
  certifications: [{ name: "Safety Certificate" }],
  projects: [],
  achievements: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("teaching example route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue(readyResume());
    (db.resumeSection.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.resumeSection.create as jest.Mock).mockResolvedValue({ id: "section-1" });
    (db.$transaction as jest.Mock).mockResolvedValue([]);
    (fetchResumeSourceProfile as jest.Mock).mockResolvedValue(sourceProfile);
  });

  it("never exposes another user's approval state", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(readyResume({ userId: "other-user" }));
    const response = await GET(request, params);
    expect(response.status).toBe(403);
  });

  it("stores an immutable approved source and final-resume snapshot", async () => {
    const response = await POST(request, params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ approved: true });
    expect(db.resumeSection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resumeId: RESUME_ID,
        name: "teaching_example_v1",
        visible: false,
        content: expect.any(String),
      }),
    });
    const call = (db.resumeSection.create as jest.Mock).mock.calls[0][0];
    const payload = JSON.parse(call.data.content);
    expect(payload).toMatchObject({
      userId: USER_ID,
      targetRole: "Operations Manager",
      sourceSnapshot: expect.objectContaining({ userId: USER_ID }),
      finalResume: expect.objectContaining({
        summary: "Operations leader focused on safe, reliable execution.",
      }),
    });
  });

  it("revokes the example immediately", async () => {
    const response = await DELETE(request, params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: false });
    expect(db.resumeSection.deleteMany).toHaveBeenCalledWith({
      where: { resumeId: RESUME_ID, name: "teaching_example_v1" },
    });
  });
});
