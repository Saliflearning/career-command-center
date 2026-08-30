import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: {
    resume: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    resumeBullet: { findFirst: jest.fn(), update: jest.fn() },
    bullet: { create: jest.fn(), update: jest.fn() },
    resumeSection: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { PATCH } from "@/app/api/resume/[id]/content/route";

const USER_ID = "user-editor";
const RESUME_ID = "resume-editor";
const params = { params: Promise.resolve({ id: RESUME_ID }) };

function request(content = "Rewritten with truthful evidence.", bulletId = "bullet-source", expectedRevision = 1) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/content`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "bullet", bulletId, content, expectedRevision }),
  });
}

function summaryRequest(content = "A stronger, truthful summary.", expectedRevision = 1) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/content`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "summary", content, expectedRevision }),
  });
}

function presentationRequest(expectedRevision = 1) {
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/content`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "presentation",
      expectedRevision,
      presentation: {
        font: "modern",
        scale: "normal",
        spacing: "balanced",
        bold: false,
        italic: false,
      },
    }),
  });
}

function linkedBullet(overrides: Record<string, unknown> = {}) {
  return {
    id: "resume-bullet-link",
    resumeId: RESUME_ID,
    bulletId: "bullet-source",
    bullet: {
      id: "bullet-source",
      workHistoryId: "work-1",
      content: "Original source evidence.",
      contentType: "VERIFIED",
      metrics: [],
      keywords: ["evidence"],
      usedInResumes: [{ resumeId: RESUME_ID }, { resumeId: "another-resume" }],
    },
    ...overrides,
  };
}

describe("PATCH /api/resume/[id]/content bullet persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "QA_REVIEWED",
      version: 1,
      strategyJson: null,
    });
    (db.resumeBullet.findFirst as jest.Mock).mockResolvedValue(linkedBullet());
    (db.bullet.create as jest.Mock).mockResolvedValue({
      id: "bullet-edited",
      content: "Rewritten with truthful evidence.",
      contentType: "USER_EDITED",
    });
    (db.bullet.update as jest.Mock).mockResolvedValue({
      id: "bullet-source",
      content: "Rewritten with truthful evidence.",
      contentType: "USER_EDITED",
    });
    (db.resumeBullet.update as jest.Mock).mockResolvedValue({});
    (db.resume.update as jest.Mock).mockResolvedValue({});
    (db.resume.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.resumeSection.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue(null);
    (db.resumeSection.update as jest.Mock).mockResolvedValue({});
    (db.resumeSection.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.$transaction as jest.Mock).mockImplementation(async (operation) => {
      if (typeof operation === "function") return operation(db);
      return Promise.all(operation);
    });
  });

  it("clones shared source evidence and repoints only this resume", async () => {
    const response = await PATCH(request(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "bullet",
      previousBulletId: "bullet-source",
      bulletId: "bullet-edited",
      content: "Rewritten with truthful evidence.",
      contentType: "USER_EDITED",
      documentRevision: 2,
      teachingExampleRevoked: true,
    });
    expect(db.bullet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workHistoryId: "work-1",
        content: "Rewritten with truthful evidence.",
        contentType: "USER_EDITED",
        locked: true,
      }),
    });
    expect(db.resumeBullet.update).toHaveBeenCalledWith({
      where: { id: "resume-bullet-link" },
      data: { bulletId: "bullet-edited" },
    });
    expect(db.resume.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: RESUME_ID, version: 1 }),
      data: expect.objectContaining({
        state: "USER_EDITING",
        pdfUrl: null,
        latexSource: null,
        exportedAt: null,
        pageCount: null,
        visualScore: null,
        atsScore: null,
        keywordScore: null,
      }),
    }));
    expect(db.resumeSection.deleteMany).toHaveBeenCalled();
  });

  it("updates an already resume-scoped user edit in place", async () => {
    (db.resumeBullet.findFirst as jest.Mock).mockResolvedValue(linkedBullet({
      bullet: {
        ...linkedBullet().bullet,
        contentType: "USER_EDITED",
        usedInResumes: [{ resumeId: RESUME_ID }],
      },
    }));

    const response = await PATCH(request(), params);

    expect(response.status).toBe(200);
    expect(db.bullet.update).toHaveBeenCalledWith({
      where: { id: "bullet-source" },
      data: expect.objectContaining({ content: "Rewritten with truthful evidence." }),
    });
    expect(db.bullet.create).not.toHaveBeenCalled();
    expect(db.resumeBullet.update).not.toHaveBeenCalled();
  });

  it("invalidates stale export and score data after a summary edit", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "EXPORTED",
      version: 1,
      strategyJson: null,
    });

    const response = await PATCH(summaryRequest(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      type: "summary",
      documentRevision: 2,
      teachingExampleRevoked: true,
    });
    expect(db.resume.updateMany).toHaveBeenCalledWith({
      where: { id: RESUME_ID, version: 1 },
      data: expect.objectContaining({
        state: "USER_EDITING",
        version: { increment: 1 },
        summaryText: "A stronger, truthful summary.",
        pdfUrl: null,
        latexSource: null,
        exportedAt: null,
        pageCount: null,
        visualScore: null,
        atsScore: null,
        keywordScore: null,
      }),
    });
    expect(db.resumeSection.deleteMany).toHaveBeenCalledWith({
      where: {
        resumeId: RESUME_ID,
        name: { in: expect.arrayContaining(["visual_qa", "diagnostic"]) },
      },
    });
  });

  it("invalidates stale export and score data after a document-style edit", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "EXPORTED",
      version: 1,
      strategyJson: null,
    });

    const response = await PATCH(presentationRequest(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      type: "presentation",
      documentRevision: 2,
    });
    expect(db.resume.updateMany).toHaveBeenCalledWith({
      where: { id: RESUME_ID, version: 1 },
      data: expect.objectContaining({
        state: "USER_EDITING",
        version: { increment: 1 },
        pdfUrl: null,
        latexSource: null,
        exportedAt: null,
        pageCount: null,
        visualScore: null,
        atsScore: null,
        keywordScore: null,
      }),
    });
    expect(db.resumeSection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resumeId: RESUME_ID,
        name: "resume_presentation",
      }),
    });
  });

  it("rejects edits to another user's resume before looking up its bullet", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: "another-user",
      state: "QA_REVIEWED",
    });

    const response = await PATCH(request(), params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(db.resumeBullet.findFirst).not.toHaveBeenCalled();
  });

  it("edits a Quick Resume bullet inside its document-scoped artifact", async () => {
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue({
      id: "quick-section",
      content: JSON.stringify({
        version: 2,
        revision: 1,
        targetTitle: "Operations Supervisor",
        honestStretchNote: "",
        coreSkills: ["Scheduling", "Safety Compliance", "Team Leadership"],
        jobs: [{
          id: "quick-job",
          title: "Shift Lead",
          company: "Grocery Warehouse",
          location: "",
          dateLabel: "2019 - 2023",
          bullets: [{ id: "quick-bullet", content: "Original generated bullet.", contentType: "GENERATED" }],
        }],
        education: [],
        certifications: [],
      }),
    });

    const response = await PATCH(
      request("Edited truthful bullet.", "quick-bullet"),
      params
    );

    expect(response.status).toBe(200);
    expect(db.resumeSection.updateMany).toHaveBeenCalledWith({
      where: {
        id: "quick-section",
        content: expect.stringContaining('"revision":1'),
      },
      data: { content: expect.stringContaining("Edited truthful bullet.") },
    });
    expect(db.resumeBullet.findFirst).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      type: "bullet",
      previousBulletId: "quick-bullet",
      bulletId: "quick-bullet",
      content: "Edited truthful bullet.",
      contentType: "USER_EDITED",
      documentRevision: 2,
    });
  });

  it("rejects a stale Quick Resume revision without writing", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "USER_EDITING",
      version: 2,
      strategyJson: { engine: "quick_resume_v1", artifactVersion: 2 },
    });

    const response = await PATCH(request("Stale edit.", "quick-bullet", 1), params);

    expect(response.status).toBe(409);
    expect(db.resumeSection.updateMany).not.toHaveBeenCalled();
    expect(db.resume.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a concurrent Quick Resume write when compare-and-swap loses", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "USER_EDITING",
      version: 1,
      strategyJson: { engine: "quick_resume_v1", artifactVersion: 2 },
    });
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue({
      id: "quick-section",
      content: JSON.stringify({
        version: 2,
        revision: 1,
        targetTitle: "Operations Supervisor",
        honestStretchNote: "",
        coreSkills: ["Scheduling", "Safety Compliance", "Team Leadership"],
        jobs: [{
          id: "quick-job",
          title: "Shift Lead",
          company: "Grocery Warehouse",
          location: "",
          dateLabel: "2019 - 2023",
          bullets: [{ id: "quick-bullet", content: "Original generated bullet.", contentType: "GENERATED" }],
        }],
        education: [],
        certifications: [],
      }),
    });
    (db.resumeSection.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const response = await PATCH(request("Concurrent edit.", "quick-bullet", 1), params);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Resume changed elsewhere. Reload before saving.",
      code: "EDIT_CONFLICT",
    });
  });

  it("rejects edits when a marked Quick Resume artifact is missing", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      state: "USER_EDITING",
      version: 1,
      strategyJson: { engine: "quick_resume_v1", artifactVersion: 2 },
    });
    (db.resumeSection.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await PATCH(request(), params);

    expect(response.status).toBe(422);
    expect(db.resume.updateMany).not.toHaveBeenCalled();
  });
});
