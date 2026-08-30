import {
  buildPdfDownloadUrl,
  renderAndDownloadPdf,
} from "./pdf-download";

describe("authenticated PDF download", () => {
  it("uses a same-origin attachment route with a bounded filename", () => {
    expect(buildPdfDownloadUrl("resume/id", "Djelika Doumbia Resume"))
      .toBe("/api/export/resume%2Fid/download?filename=Djelika%20Doumbia%20Resume");
  });

  it("renders the canonical PDF before starting the attachment download", async () => {
    const requestPreview = jest.fn().mockResolvedValue({
      pdfUrl: "https://signed.example/final.pdf",
      fallback: false,
      renderer: "structured",
      pageCount: 1,
    });
    const startDownload = jest.fn();

    const result = await renderAndDownloadPdf({
      resumeId: "resume-1",
      filename: "Candidate Resume",
      requestPreview,
      startDownload,
    });

    expect(requestPreview).toHaveBeenCalledWith("resume-1");
    expect(startDownload).toHaveBeenCalledWith(
      "/api/export/resume-1/download?filename=Candidate%20Resume",
      "Candidate Resume.pdf"
    );
    expect(result.pageCount).toBe(1);
  });
});
