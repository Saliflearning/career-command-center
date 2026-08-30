/**
 * GET /api/export/[id]/tex — LaTeX source download.
 * Auth-scoped, exportable states only, 404 when no LaTeX exists.
 */
import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({ db: { resume: { findUnique: jest.fn() } } }));
jest.mock("@/lib/resume/state-capabilities", () => ({
  isResumeExportableState: jest.fn(() => true),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";
import { GET } from "@/app/api/export/[id]/tex/route";

const USER_ID = "user-tex-test";
const RESUME_ID = "resume-tex-test";
const LATEX = "\\documentclass[letterpaper,10pt]{article}\\begin{document}Hi\\end{document}";

function request() {
  return GET({} as NextRequest, { params: Promise.resolve({ id: RESUME_ID }) });
}

describe("GET /api/export/[id]/tex", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (isResumeExportableState as jest.Mock).mockReturnValue(true);
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      latexSource: LATEX,
      state: "USER_EDITING",
      targetRole: "Senior Operations Manager",
    });
  });

  it("returns the LaTeX source as an attachment for the owner", async () => {
    const res = await request();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-tex");
    expect(res.headers.get("Content-Disposition")).toContain('filename="senior-operations-manager.tex"');
    expect(await res.text()).toBe(LATEX);
    // Ownership is enforced in the query itself, not post-hoc.
    expect((db.resume.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({
      id: RESUME_ID,
      userId: USER_ID,
    });
  });

  it("rejects anonymous requests", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const res = await request();
    expect(res.status).toBe(401);
    expect(db.resume.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for a resume the user does not own", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request();
    expect(res.status).toBe(404);
  });

  it("refuses non-exportable states", async () => {
    (isResumeExportableState as jest.Mock).mockReturnValue(false);
    const res = await request();
    expect(res.status).toBe(409);
  });

  it("returns 404 when the resume has no LaTeX source", async () => {
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      latexSource: "   ",
      state: "USER_EDITING",
      targetRole: "Any Role",
    });
    const res = await request();
    expect(res.status).toBe(404);
  });
});
