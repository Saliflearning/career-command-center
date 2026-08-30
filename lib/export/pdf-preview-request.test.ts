import { requestPdfPreview } from "./pdf-preview-request";

describe("PDF preview request", () => {
  it("requests one rendered PDF and preserves additive metadata", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pdfUrl: "https://storage.example/resume.pdf",
        fallback: true,
        renderer: "structured",
        pageCount: 1,
      }),
    });

    await expect(requestPdfPreview("resume 1", request)).resolves.toEqual({
      pdfUrl: "https://storage.example/resume.pdf",
      fallback: true,
      renderer: "structured",
      pageCount: 1,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/export/resume%201", { method: "POST" });
  });

  it("surfaces the API error instead of accepting an empty preview", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Visual integrity check failed." }),
    });

    await expect(requestPdfPreview("resume-2", request)).rejects.toThrow(
      "Visual integrity check failed."
    );
  });

  it("rejects a successful response without a PDF URL", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pageCount: 1 }),
    });

    await expect(requestPdfPreview("resume-3", request)).rejects.toThrow(
      "Export completed without a PDF URL."
    );
  });
});
