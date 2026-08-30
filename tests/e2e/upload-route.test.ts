import { NextRequest } from "next/server";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ authOptions: {} }));
jest.mock("@/lib/db/client", () => ({
  db: { resume: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock("@/lib/storage/adapter", () => ({
  storage: { upload: jest.fn() },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db/client";
import { storage } from "@/lib/storage/adapter";
import { POST } from "@/app/api/resume/[id]/upload/route";

const USER_ID = "user-upload-test";
const RESUME_ID = "resume-upload-test";
const params = { params: Promise.resolve({ id: RESUME_ID }) };

function uploadRequest(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return new NextRequest(`http://localhost/api/resume/${RESUME_ID}/upload`, {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/resume/[id]/upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: USER_ID } });
    (db.resume.findUnique as jest.Mock).mockResolvedValue({
      id: RESUME_ID,
      userId: USER_ID,
    });
    (db.resume.update as jest.Mock).mockResolvedValue({ id: RESUME_ID });
    (storage.upload as jest.Mock).mockResolvedValue("https://signed.example/original");
  });

  it("rejects malformed multipart data before storage or persistence", async () => {
    const request = {
      formData: jest.fn().mockRejectedValue(new Error("multipart boundary internals")),
    } as unknown as NextRequest;

    const response = await POST(request, params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Upload body must be valid form data." });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("accepts a DOCX extension case-insensitively and normalizes its MIME type", async () => {
    const file = new File(["docx bytes"], "Candidate.DOCX", {
      type: "application/octet-stream",
    });

    const response = await POST(uploadRequest(file), params);

    expect(response.status).toBe(200);
    expect(storage.upload).toHaveBeenCalledWith(
      `${USER_ID}/${RESUME_ID}/original.docx`,
      expect.any(Buffer),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(db.resume.update).toHaveBeenCalledWith({
      where: { id: RESUME_ID },
      data: { pdfUrl: "https://signed.example/original" },
    });
  });

  it("keeps storage diagnostics out of the response", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    (storage.upload as jest.Mock).mockRejectedValue(
      new Error("bucket resume-files denied for service-role-secret")
    );

    const response = await POST(
      uploadRequest(new File(["%PDF"], "candidate.pdf", { type: "application/pdf" })),
      params
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "File upload failed. Try again.",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("bucket resume-files denied for service-role-secret")
    );
    expect(db.resume.update).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("rejects unsupported files before storage", async () => {
    const response = await POST(
      uploadRequest(new File(["plain text"], "candidate.txt", { type: "text/plain" })),
      params
    );

    expect(response.status).toBe(400);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("rejects files larger than 10 MB before storage", async () => {
    const response = await POST(
      uploadRequest(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "candidate.pdf", {
          type: "application/pdf",
        })
      ),
      params
    );

    expect(response.status).toBe(400);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
  });
});
