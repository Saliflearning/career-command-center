import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: {
    resume: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    application: { count: jest.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { GET as getResumeLibrary, POST as createResume } from "@/app/api/resume/route";
import { GET as getSavedSources } from "@/app/api/resume/sources/route";

const USER_ID = "user-resume-library";
const SOURCE_ID = "resume-source";
const NEW_RESUME_ID = "resume-new";

function rawRequest(body?: string) {
  return new NextRequest("http://localhost/api/resume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
}

function jsonRequest(body: unknown) {
  return rawRequest(JSON.stringify(body));
}

function validProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "memory-source",
    userId: USER_ID,
    version: 1,
    jobs: [
      {
        id: "job-source",
        company: "Example Distribution",
        title: "Operations Supervisor",
        startDate: "2022-01-01",
        endDate: null,
        current: true,
        location: "Columbus, OH",
        employmentType: "Full-Time",
        bullets: [
          {
            id: "bullet-source",
            content: "Led a team of 24 across daily distribution operations.",
            contentType: "VERIFIED",
            metrics: ["24"],
            keywords: ["team leadership"],
            locked: true,
            usedInResumeCount: 1,
          },
        ],
        sourceType: "UPLOADED",
        verified: true,
        locked: true,
        sortOrder: 0,
      },
    ],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    achievements: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function sourceRecord(profile = validProfile(), id = SOURCE_ID) {
  return {
    id,
    targetRole: "Operations Manager",
    targetCompany: "Example Distribution",
    updatedAt: new Date("2026-07-20T12:00:00.000Z"),
    sections: [
      { name: "source_profile", content: JSON.stringify(profile) },
      {
        name: "resume_header",
        content: JSON.stringify({ name: "Avery Example", location: "Columbus, OH" }),
      },
      {
        name: "source_resume",
        content: "Avery Example\nColumbus, OH\nPROFESSIONAL EXPERIENCE",
      },
    ],
  };
}

describe("resume library and saved-source routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findMany as jest.Mock).mockResolvedValue([]);
    (db.resume.aggregate as jest.Mock).mockResolvedValue({
      _avg: { atsScore: null, keywordScore: null },
      _count: { atsScore: 0, keywordScore: 0 },
    });
    (db.resume.count as jest.Mock).mockResolvedValue(0);
    (db.application.count as jest.Mock).mockResolvedValue(0);
    (db.resume.create as jest.Mock).mockResolvedValue({ id: NEW_RESUME_ID });
  });

  it("rejects unauthenticated create requests before parsing or persistence", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await createResume(rawRequest("{not-json"));

    expect(response.status).toBe(401);
    expect(db.resume.findFirst).not.toHaveBeenCalled();
    expect(db.resume.create).not.toHaveBeenCalled();
  });

  it("allows a genuinely empty create body and uses the honest unset target", async () => {
    const response = await createResume(rawRequest());

    expect(response.status).toBe(201);
    expect(db.resume.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        targetRole: "Not yet specified",
        state: "UPLOADED",
        sections: undefined,
      },
      select: { id: true },
    });
  });

  it.each([
    "{not-json",
    "null",
    "[]",
    '"resume"',
    "42",
    "true",
  ])("rejects malformed or non-object create input before persistence", async (body) => {
    const response = await createResume(rawRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid resume request." });
    expect(db.resume.findFirst).not.toHaveBeenCalled();
    expect(db.resume.create).not.toHaveBeenCalled();
  });

  it.each([
    { targetRole: { value: "Operations Manager" } },
    { sourceResumeId: 42 },
    { targetRole: "R".repeat(181) },
    { sourceResumeId: "s".repeat(101) },
  ])("rejects wrongly typed or overlong create fields", async (body) => {
    const response = await createResume(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(db.resume.findFirst).not.toHaveBeenCalled();
    expect(db.resume.create).not.toHaveBeenCalled();
  });

  it("does not allow a user to clone another user's source", async () => {
    (db.resume.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await createResume(
      jsonRequest({ targetRole: "Operations Manager", sourceResumeId: SOURCE_ID })
    );

    expect(response.status).toBe(404);
    expect(db.resume.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SOURCE_ID, userId: USER_ID } })
    );
    expect(db.resume.create).not.toHaveBeenCalled();
  });

  it("returns a bounded error for a malformed owned source instead of throwing", async () => {
    const malformed = validProfile({
      jobs: [{ ...validProfile().jobs[0], bullets: null }],
    });
    (db.resume.findFirst as jest.Mock).mockResolvedValue(sourceRecord(malformed));

    const response = await createResume(
      jsonRequest({ targetRole: "Operations Manager", sourceResumeId: SOURCE_ID })
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "This saved resume has no reusable source snapshot.",
    });
    expect(db.resume.create).not.toHaveBeenCalled();
  });

  it("clones one valid owned source into canonical hidden sections", async () => {
    const source = sourceRecord();
    (db.resume.findFirst as jest.Mock).mockResolvedValue(source);

    const response = await createResume(
      jsonRequest({ targetRole: " Operations Manager ", sourceResumeId: ` ${SOURCE_ID} ` })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ resumeId: NEW_RESUME_ID });
    expect(db.resume.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        targetRole: "Operations Manager",
        state: "UPLOADED",
        sections: {
          create: expect.arrayContaining([
            expect.objectContaining({ name: "source_profile", content: source.sections[0].content }),
            expect.objectContaining({ name: "source_resume" }),
            expect.objectContaining({ name: "source_origin", content: SOURCE_ID }),
            expect.objectContaining({ name: "resume_header", content: source.sections[1].content }),
          ]),
        },
      },
      select: { id: true },
    });
  });

  it("repairs a corrupt saved name from the original source before reuse", async () => {
    const source = sourceRecord();
    source.sections[1].content = JSON.stringify({
      name: "S",
      email: "avery.morgan@example.com",
      location: "Columbus, OH",
    });
    source.sections[2].content = [
      "AVERY MORGAN",
      "Columbus, OH | avery.morgan@example.com",
      "PROFESSIONAL EXPERIENCE",
    ].join("\n");
    (db.resume.findFirst as jest.Mock).mockResolvedValue(source);

    const response = await createResume(
      jsonRequest({ targetRole: "Operations Manager", sourceResumeId: SOURCE_ID })
    );

    expect(response.status).toBe(201);
    const create = (db.resume.create as jest.Mock).mock.calls[0][0].data.sections.create;
    const header = create.find((section: { name: string }) => section.name === "resume_header");
    expect(JSON.parse(header.content)).toMatchObject({
      name: "AVERY MORGAN",
      email: "avery.morgan@example.com",
    });
    const sourceResume = create.find(
      (section: { name: string }) => section.name === "source_resume"
    );
    expect(sourceResume.content).toContain("AVERY MORGAN");
  });

  it("keeps valid saved sources available when another legacy snapshot is malformed", async () => {
    const malformed = sourceRecord(
      validProfile({ projects: [{ id: "project-bad", name: "Bad", technologies: "Python" }] }),
      "resume-malformed"
    );
    const valid = sourceRecord();
    (db.resume.findMany as jest.Mock).mockResolvedValue([malformed, valid]);

    const response = await getSavedSources();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sources: [
        {
          id: SOURCE_ID,
          candidateName: "Avery Example",
          targetRole: "Operations Manager",
          targetCompany: "Example Distribution",
          updatedAt: "2026-07-20T12:00:00.000Z",
        },
      ],
    });
    expect(db.resume.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID }) })
    );
  });

  it("recovers a saved source name from the original resume when its header is corrupt", async () => {
    const source = sourceRecord();
    source.sections[1].content = JSON.stringify({
      name: "S",
      email: "avery@example.com",
    });
    source.sections[2].content = [
      "AVERY EXAMPLE",
      "Columbus, OH | avery@example.com",
      "PROFESSIONAL EXPERIENCE",
    ].join("\n");
    (db.resume.findMany as jest.Mock).mockResolvedValue([source]);

    const response = await getSavedSources();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sources: [
        expect.objectContaining({
          id: SOURCE_ID,
          candidateName: "AVERY EXAMPLE",
        }),
      ],
    });
  });

  it("returns an authenticated library summary without cross-user query scope", async () => {
    const response = await getResumeLibrary();

    expect(response.status).toBe(200);
    expect(db.resume.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
    expect(db.resume.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(db.application.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });
});
