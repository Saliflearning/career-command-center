import {
  closePdfPreview,
  reservePdfPreview,
  showPdfPreview,
  type ReservedPdfPreview,
} from "./pdf-preview-navigation";

function previewWindow(): ReservedPdfPreview {
  return {
    closed: false,
    opener: { unsafe: true },
    location: { replace: jest.fn() },
    close: jest.fn(),
  };
}

describe("PDF preview navigation", () => {
  it("reserves a safe tab during the user click and navigates it after export", () => {
    const preview = previewWindow();
    const reserved = reservePdfPreview(() => preview);
    const navigateCurrentTab = jest.fn();

    expect(preview.opener).toBeNull();
    expect(showPdfPreview(reserved, "https://files.example.test/resume.pdf", navigateCurrentTab))
      .toBe("reserved-tab");
    expect(preview.location.replace).toHaveBeenCalledWith(
      "https://files.example.test/resume.pdf"
    );
    expect(navigateCurrentTab).not.toHaveBeenCalled();
  });

  it("uses the current tab when a popup is blocked", () => {
    const navigateCurrentTab = jest.fn();

    expect(showPdfPreview(null, "/resume.pdf", navigateCurrentTab)).toBe(
      "current-tab"
    );
    expect(navigateCurrentTab).toHaveBeenCalledWith("/resume.pdf");
  });

  it("closes an unused reserved tab after an export failure", () => {
    const preview = previewWindow();

    closePdfPreview(preview);

    expect(preview.close).toHaveBeenCalledTimes(1);
  });
});