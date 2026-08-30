import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: {
    resume: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/db/mappers/career-memory.mapper", () => ({
  fetchCareerMemoryFromDB: jest.fn(),
}));
jest.mock("@/lib/db/resume-source-profile", () => ({
  fetchResumeSourceProfile: jest.fn(),
}));
jest.mock("@/lib/resume/content-projection", () => ({
  projectResumeProjects: jest.fn(() => []),
  projectGroundedJdSkillGaps: jest.fn(() => []),
  projectGroundedTargetHeadline: jest.fn(() => null),
  projectLinkedWorkHistory: jest.fn(() => []),
  restoreSourceWorkHistory: jest.fn(() => []),
  projectResumeSkillsWithKeywords: jest.fn(() => []),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { fetchCareerMemoryFromDB } from "@/lib/db/mappers/career-memory.mapper";
import { fetchResumeSourceProfile } from "@/lib/db/resume-source-profile";
import { GET } from "@/app/api/resume/[id]/content/route";

const USER_ID = "user-content";
const RESUME_ID = "resume-content";
const params = { params: Promise.resolve({ id: RESUME_ID }) };
const request = new NextRequest(`http://localhost/api/resume/${RESUME_ID}/content`);

function section(name: string, visible: boolean, content: string) {
  return { name, visible, content, sortOrder: 0 };
}

function readyResume(overrides: Record<string, unknown> = {}) {
  return {
    id: RESUME_ID,
    userId: USER_ID,
    user: { name: "Example Candidate", email: "candidate@example.com" },
    state: "QA_REVIEWED",
    jdText: "Example target job description.",
    jdKeywords: [],
    targetRole: "Operations Manager",
    targetCompany: "Example Company",
    roleType: "OPERATIONS",
    summaryText: "A grounded summary.",
    atsScore: 80,
    keywordScore: 75,
    version: 1,
    strategyJson: null,
    latexSource: null,
    bullets: [],
    sections: [],
    ...overrides,
  };
}

describe("GET /api/resume/[id]/content", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue(readyResume());
    (fetchResumeSourceProfile as jest.Mock).mockResolvedValue(null);
    (fetchCareerMemoryFromDB as jest.Mock).mockResolvedValue(null);
  });

  it("rejects unauthenticated requests before resume lookup", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(request, params);

    expect(response.status).toBe(401);
    expect(db.resume.findUnique).not.toHaveBeenCalled();
  });

  it("preserves missing and cross-user resource boundaries", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const missing = await GET(request, params);
    expect(missing.status).toBe(404);

    (db.resume.findUnique as jest.Mock).mockResolvedValueOnce(
      readyResume({ userId: "another-user" })
    );
    const forbidden = await GET(request, params);
    expect(forbidden.status).toBe(403);
    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
  });

  it("keeps processing responses ahead of source projection", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      readyResume({ state: "GENERATING" })
    );

    const response = await GET(request, params);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      state: "GENERATING",
      message: "Resume is still being generated. Keep polling /status.",
    });
    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
    expect(fetchCareerMemoryFromDB).not.toHaveBeenCalled();
  });

  it("returns visible document sections and the source resume used for round trips", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      readyResume({
        sections: [
          section("summary", true, "A visible summary."),
          section("source_resume", false, "Preserved source evidence."),
        ],
      })
    );

    const response = await GET(request, params);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sections).toEqual([
      section("summary", true, "A visible summary."),
      section("source_resume", false, "Preserved source evidence."),
    ]);
  });

  it("recovers a corrupt candidate name from the uploaded source resume", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      readyResume({
        user: { name: "S", email: "avery.morgan@example.com" },
        sections: [
          section("resume_header", false, JSON.stringify({ name: "S" })),
          section(
            "source_resume",
            false,
            "AVERY MORGAN\nColumbus, OH | avery.morgan@example.com\nPROFESSIONAL SUMMARY"
          ),
        ],
      })
    );

    const response = await GET(request, params);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidateName).toBe("AVERY MORGAN");
  });

  it("does not serialize hidden internal sections through the generic section list", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      readyResume({
        sections: [
          section("summary", true, "A visible summary."),
          section("source_resume", false, "Preserved source evidence."),
          section("source_profile", true, "private immutable snapshot"),
          section("source_origin", false, "private source identifier"),
          section("pipeline_error", true, "private stack and provider detail"),
          section("diagnostic", false, JSON.stringify({ issues: [] })),
          section("user_evidence", false, "private evidence answers"),
          section("resume_header", false, JSON.stringify({ name: "Example Candidate" })),
          section("resume_presentation", false, JSON.stringify({ font: "serif" })),
          section("teaching_example_v1", false, "private teaching approval"),
          section("visual_qa", false, "private renderer diagnostics"),
          section("unknown_internal_record", false, "private future data"),
        ],
      })
    );

    const response = await GET(request, params);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sections).toEqual([
      section("summary", true, "A visible summary."),
      section("source_resume", false, "Preserved source evidence."),
    ]);
    expect(JSON.stringify(payload.sections)).not.toContain("private");
  });

  it("reopens a persisted Quick Resume without consulting Career Profile memory", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      readyResume({
        sections: [section("quick_resume_draft_v1", false, JSON.stringify({
          version: 2,
          revision: 1,
          targetTitle: "Warehouse Supervisor",
          honestStretchNote: "",
          coreSkills: ["Team Leadership", "Scheduling", "Safety Compliance"],
          jobs: [{
            id: "quick-job-1",
            title: "Shift Lead",
            company: "Grocery Warehouse",
            location: "Columbus, OH",
            dateLabel: "2019 - 2023",
            bullets: [{ id: "quick-bullet-1", content: "Led daily shift operations.", contentType: "GENERATED" }],
          }],
          education: [{
            id: "quick-education-1",
            degree: "High School Diploma",
            institution: "North High School",
            dateLabel: "2018",
            details: "",
          }],
          certifications: [{
            id: "quick-cert-1",
            name: "Forklift Certification",
            issuer: "Warehouse Safety Council",
            dateLabel: "2019",
          }],
        }))],
      })
    );

    const response = await GET(request, params);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
    expect(fetchCareerMemoryFromDB).not.toHaveBeenCalled();
    expect(payload.workHistory[0]).toMatchObject({
      workHistoryId: "quick-job-1",
      title: "Shift Lead",
      company: "Grocery Warehouse",
      dateLabel: "2019 - 2023",
      bullets: [{
        bulletId: "quick-bullet-1",
        content: "Led daily shift operations.",
        contentType: "GENERATED",
      }],
    });
    expect(payload.skills).toEqual([
      { name: "Team Leadership", category: "Core Skills" },
      { name: "Scheduling", category: "Core Skills" },
      { name: "Safety Compliance", category: "Core Skills" },
    ]);
    expect(payload.sections).toEqual([]);
    expect(payload.documentRevision).toBe(1);
    expect(payload.candidateHeadline).toBe("Warehouse Supervisor");
    expect(payload.honestStretchNote).toBe("");
  });

  it("rejects a marked Quick Resume whose artifact is missing", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      readyResume({
        strategyJson: { engine: "quick_resume_v1", artifactVersion: 2 },
        sections: [],
      })
    );

    const response = await GET(request, params);

    expect(response.status).toBe(422);
    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
    expect(fetchCareerMemoryFromDB).not.toHaveBeenCalled();
  });

  it("rejects a damaged Quick Resume instead of falling back to Career Profile data", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(
      readyResume({
        sections: [section("quick_resume_draft_v1", false, "{not-valid-json")],
      })
    );

    const response = await GET(request, params);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "This saved Quick Resume is damaged and cannot be opened safely.",
    });
    expect(fetchResumeSourceProfile).not.toHaveBeenCalled();
    expect(fetchCareerMemoryFromDB).not.toHaveBeenCalled();
  });
});
