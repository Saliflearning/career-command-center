import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({
  authOptions: { secret: "test-only-quick-resume-signing-secret" },
}));
jest.mock("@/lib/db/client", () => ({
  db: { resume: { create: jest.fn() } },
}));
jest.mock("@/lib/resume/quick-resume", () => {
  const actual = jest.requireActual("@/lib/resume/quick-resume");
  return {
    ...actual,
    generateIntakeQuestions: jest.fn(),
    generateQuickResume: jest.fn(),
    // keep the real deterministic grounding check
  };
});

import { getServerSession } from "next-auth";
import {
  generateIntakeQuestions,
  generateQuickResume,
} from "@/lib/resume/quick-resume";
import { POST as questionsPOST } from "@/app/api/quick-resume/questions/route";
import { POST as generatePOST } from "@/app/api/quick-resume/generate/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { createQuickResumeSession } from "@/lib/resume/quick-resume-session";
import { db } from "@/lib/db/client";

const asMock = (fn: unknown) => fn as jest.Mock;
const JD = "Warehouse Operations Manager. Lead a team of supervisors, uphold safety compliance, track KPIs and productivity.";
const SECRET = "test-only-quick-resume-signing-secret";
const QUESTIONS = [
  { id: "q1", evidenceKey: "recent-role", question: "Have you held a related role?", essential: true },
  { id: "q2", evidenceKey: "team-leadership", question: "Have you led people in this kind of work?", essential: true },
  { id: "q3", evidenceKey: "required-tools", question: "Have you used the required tools or certifications?", essential: false },
];
const SUBMITTED_ANSWERS = [
  { questionId: "q1", answer: "Shift lead at a grocery warehouse." },
  { questionId: "q2", answer: "4 years leading 15 to 20 people, scheduling work, and supporting safety." },
  { questionId: "q3", answer: "Forklift certified." },
];
const CONTACT = {
  name: "Taylor Morgan",
  email: "taylor@example.com",
  phone: "317-555-0199",
  linkedin: "linkedin.com/in/taylor-morgan",
  location: "Indianapolis, IN",
};

function intakeToken(userId = "user-1") {
  return createQuickResumeSession(
    {
      version: 1,
      userId,
      jobDescriptionHash: "",
      expiresAt: Date.now() + 30 * 60 * 1000,
      questions: QUESTIONS,
    },
    JD,
    SECRET
  );
}

function generationBody(overrides: Record<string, unknown> = {}) {
  return {
    jobDescription: JD,
    intakeToken: intakeToken(),
    answers: SUBMITTED_ANSWERS,
    contact: CONTACT,
    ...overrides,
  };
}

function req(body: unknown, contentType = "application/json") {
  return new NextRequest("http://localhost/api/quick-resume", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const DRAFT = {
  targetTitle: "Operations Supervisor",
  honestStretchNote: "",
  summary: "Shift lead with 4 years of warehouse team leadership.",
  coreSkills: ["Team Leadership", "Safety Compliance", "Scheduling"],
  experience: [{
    title: "Shift Lead",
    company: "Grocery Warehouse",
    location: "Indianapolis, IN",
    dateLabel: "4 years",
    bullets: ["Led a team of 15 to 20 associates."],
  }],
  projects: [],
  education: [],
  certifications: [{ name: "Forklift Certification", issuer: "", dateLabel: "" }],
  placeholdersForUser: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetRateLimits();
  asMock(getServerSession).mockResolvedValue({ user: { id: "user-1" } });
  asMock(db.resume.create).mockResolvedValue({ id: "resume-quick-1" });
});

describe("POST /api/quick-resume/questions", () => {
  it("401 when signed out", async () => {
    asMock(getServerSession).mockResolvedValueOnce(null);
    const res = await questionsPOST(req({ jobDescription: JD, candidatePath: "experienced" }));
    expect(res.status).toBe(401);
    expect(generateIntakeQuestions).not.toHaveBeenCalled();
  });

  it("400 when the JD is missing or too short", async () => {
    const res = await questionsPOST(req({ jobDescription: "help", candidatePath: "experienced" }));
    expect(res.status).toBe(400);
    expect(generateIntakeQuestions).not.toHaveBeenCalled();
  });

  it("returns questions for a real JD", async () => {
    asMock(generateIntakeQuestions).mockResolvedValue(QUESTIONS);
    const res = await questionsPOST(req({ jobDescription: JD, candidatePath: "experienced" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.questions).toEqual(QUESTIONS);
    expect(json.intakeToken).toEqual(expect.any(String));
    expect(generateIntakeQuestions).toHaveBeenCalledWith(JD, "experienced");
  });

  it("400 when the candidate evidence path is missing or invalid", async () => {
    const missing = await questionsPOST(req({ jobDescription: JD }));
    const invalid = await questionsPOST(req({ jobDescription: JD, candidatePath: "executive" }));

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(generateIntakeQuestions).not.toHaveBeenCalled();
  });

  it("422 (not 500) when the model returns nothing usable", async () => {
    asMock(generateIntakeQuestions).mockResolvedValue([]);
    const res = await questionsPOST(req({ jobDescription: JD, candidatePath: "experienced" }));
    expect(res.status).toBe(422);
  });

  it("502 without leaking provider diagnostics on failure", async () => {
    asMock(generateIntakeQuestions).mockRejectedValue(new Error("ANTHROPIC secret detail"));
    const res = await questionsPOST(req({ jobDescription: JD, candidatePath: "experienced" }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("ANTHROPIC");
  });
});

describe("POST /api/quick-resume/generate", () => {
  it("401 when signed out", async () => {
    asMock(getServerSession).mockResolvedValueOnce(null);
    const res = await generatePOST(req(generationBody()));
    expect(res.status).toBe(401);
  });

  it("400 when answers are missing", async () => {
    const res = await generatePOST(req(generationBody({ answers: undefined })));
    expect(res.status).toBe(400);
    expect(generateQuickResume).not.toHaveBeenCalled();
  });

  it("422 when any signed essential question is unanswered", async () => {
    const res = await generatePOST(req(generationBody({
      answers: SUBMITTED_ANSWERS.filter(({ questionId }) => questionId !== "q2"),
    })));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("ESSENTIAL_ANSWERS_REQUIRED");
    expect(generateQuickResume).not.toHaveBeenCalled();
  });

  it("400 when the intake token is tampered with or belongs to another user", async () => {
    const token = intakeToken();
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const tamperedResponse = await generatePOST(req(generationBody({ intakeToken: tampered })));
    expect(tamperedResponse.status).toBe(400);

    const otherUserResponse = await generatePOST(req(generationBody({ intakeToken: intakeToken("user-2") })));
    expect(otherUserResponse.status).toBe(400);
    expect(generateQuickResume).not.toHaveBeenCalled();
  });

  it("400 when candidate contact data is missing or malformed", async () => {
    const res = await generatePOST(req(generationBody({
      contact: { ...CONTACT, email: "not-an-email" },
    })));
    expect(res.status).toBe(400);
    expect(generateQuickResume).not.toHaveBeenCalled();
  });

  it("returns the draft AND a grounding verdict", async () => {
    asMock(generateQuickResume).mockResolvedValue(DRAFT);
    const res = await generatePOST(req(generationBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.draft.targetTitle).toBe("Operations Supervisor");
    expect(json.draft.personalInfo).toEqual(CONTACT);
    expect(json.grounding.grounded).toBe(true); // every number traces to the answers
    expect(json.resumeId).toBe("resume-quick-1");
    expect(db.resume.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        targetRole: "Operations Supervisor",
        state: "USER_EDITING",
        strategyJson: {
          engine: "quick_resume_v1",
          artifactVersion: 3,
        },
      }),
    }));
  });

  it("does not release a draft when canonical persistence fails", async () => {
    asMock(generateQuickResume).mockResolvedValue(DRAFT);
    asMock(db.resume.create).mockRejectedValueOnce(new Error("database unavailable"));

    const res = await generatePOST(req(generationBody()));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.draft).toBeUndefined();
    expect(json.resumeId).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("database unavailable");
  });

  it("holds an ungrounded draft instead of returning it to the caller", async () => {
    asMock(generateQuickResume).mockResolvedValue({
      ...DRAFT,
      experience: [{
        title: "Shift Lead",
        company: "Grocery Warehouse",
        location: "",
        dateLabel: "",
        bullets: ["Cut costs by 37% and ran a $2M budget."],
      }],
    });
    const res = await generatePOST(req(generationBody()));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.grounding.grounded).toBe(false);
    expect(json.grounding.ungroundedNumbers).toEqual(expect.arrayContaining(["37%"]));
    expect(json.draft).toBeUndefined();
  });

  it("holds a draft with unresolved placeholders", async () => {
    asMock(generateQuickResume).mockResolvedValue({
      ...DRAFT,
      placeholdersForUser: ["Phone number"],
    });
    const res = await generatePOST(req(generationBody()));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.grounding.placeholderCount).toBe(1);
    expect(json.draft).toBeUndefined();
  });
});
