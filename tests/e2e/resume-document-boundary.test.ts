import fs from "fs";
import path from "path";

const quickResumePage = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/quick-resume/page.tsx"),
  "utf8"
);
const uploadPage = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/upload/page.tsx"),
  "utf8"
);
const exportPage = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/export/[resumeId]/page.tsx"),
  "utf8"
);
const workspacePage = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/workspace/[resumeId]/page.tsx"),
  "utf8"
);

describe("resume document and mobile export boundary", () => {
  it("keeps internal stretch guidance outside the resume article", () => {
    const articleEnd = quickResumePage.indexOf("</article>", quickResumePage.indexOf("<article"));
    const stretchGuidance = quickResumePage.indexOf("draft.honestStretchNote");

    expect(articleEnd).toBeGreaterThan(0);
    expect(stretchGuidance).toBeGreaterThan(articleEnd);
  });

  it("places a real mobile PDF action before the embedded desktop preview", () => {
    const mobileActions = exportPage.indexOf('data-testid="mobile-pdf-actions"');
    const desktopFrame = exportPage.indexOf('data-testid="pdf-preview-frame"');

    expect(mobileActions).toBeGreaterThan(0);
    expect(desktopFrame).toBeGreaterThan(mobileActions);
    expect(exportPage).toContain("Download PDF");
    expect(exportPage).toContain("Open preview");
    expect(exportPage).toContain("buildPdfDownloadUrl");
  });

  it("offers a direct PDF download from every generated-result and editor view", () => {
    expect(quickResumePage).toContain("renderAndDownloadPdf");
    expect(quickResumePage).toContain("Download PDF");
    expect(uploadPage).toContain("renderAndDownloadPdf");
    expect(uploadPage).toContain("Download PDF");
    expect(workspacePage).toContain("renderAndDownloadPdf");
    expect(workspacePage).toContain("Download PDF");
  });

  it("lets the resume document grow on phones instead of cropping it in an inner scroller", () => {
    const documentSurface = workspacePage.indexOf('data-testid="resume-editor-document"');

    expect(documentSurface).toBeGreaterThan(0);
    expect(workspacePage).toContain("md:max-h-[calc(100vh-11rem)]");
    expect(workspacePage).toContain("md:overflow-y-auto");
    expect(workspacePage).not.toContain(
      "max-h-[calc(100vh-11rem)] min-h-[1056px] w-[816px]"
    );
  });
});
