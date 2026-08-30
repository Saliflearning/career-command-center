import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: { resume: { findFirst: jest.fn() } },
}));
jest.mock("@/lib/storage/adapter", () => ({
  storage: { download: jest.fn() },
}));
jest.mock("@/lib/resume/state-capabilities", () => ({
  isResumeExportableState: jest.fn(() => true),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { storage } from "@/lib/storage/adapter";
import { isResumeExportableState } from "@/lib/resume/state-capabilities";
import { GET } from "@/app/api/export/[id]/download/route";

const USER_ID = "download-user";
const RESUME_ID = "download-resume";
const params = { params: Promise.resolve({ id: RESUME_ID }) };

describe("GET /api/export/[id]/download", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findFirst as jest.Mock).mockResolvedValue({ state: "EXPORTED" });
    (storage.download as jest.Mock).mockResolvedValue(Buffer.from("%PDF-verified"));
    (isResumeExportableState as unknown as jest.Mock).mockReturnValue(true);
  });

  it("returns the verified private artifact as an attachment", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/export/${RESUME_ID}/download?filename=Djelika%20Doumbia%20Resume`
      ),
      params
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("content-disposition")).toContain("Djelika_Doumbia_Resume.pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(storage.download).toHaveBeenCalledWith(`${USER_ID}/${RESUME_ID}/export.pdf`);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("%PDF-verified");
  });

  it("does not disclose or download another user's artifact", async () => {
    (db.resume.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}/download`),
      params
    );

    expect(response.status).toBe(404);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("requires authentication and a completed exportable state", async () => {
    (getServerSession as jest.Mock).mockResolvedValueOnce(null);
    const unauthorized = await GET(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}/download`),
      params
    );
    expect(unauthorized.status).toBe(401);

    (db.resume.findFirst as jest.Mock).mockResolvedValueOnce({ state: "GENERATING" });
    (isResumeExportableState as unknown as jest.Mock).mockReturnValueOnce(false);
    const processing = await GET(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}/download`),
      params
    );
    expect(processing.status).toBe(409);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("bounds storage failures without exposing provider details", async () => {
    (storage.download as jest.Mock).mockRejectedValue(new Error("private bucket internals"));

    const response = await GET(
      new NextRequest(`http://localhost/api/export/${RESUME_ID}/download`),
      params
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "The exported PDF is not available. Render it again and retry.",
    });
  });
});
