import { createCanvas } from "@napi-rs/canvas";
import { extractTextItems, renderPageAsImage } from "unpdf";
import { runVisualQA } from "@/agents/visual-qa";

jest.mock("unpdf", () => ({
  extractTextItems: jest.fn(),
  renderPageAsImage: jest.fn(),
}));

const mockExtractTextItems = extractTextItems as jest.MockedFunction<typeof extractTextItems>;
const mockRenderPageAsImage = renderPageAsImage as jest.Mock;

function textItem(str: string, x: number, y: number, fontSize = 10) {
  return {
    str,
    x,
    y,
    width: Math.max(35, str.length * fontSize * 0.45),
    height: fontSize,
    fontSize,
    fontFamily: "Helvetica",
    dir: "ltr",
    hasEOL: true,
  };
}

function screenshotArrayBuffer() {
  const canvas = createCanvas(918, 1188);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.fillRect(82, 75, 754, 42);
  for (let row = 0; row < 28; row += 1) {
    context.fillRect(82, 150 + row * 27, row % 5 === 0 ? 700 : 610, 8);
  }
  const png = canvas.toBuffer("image/png");
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
}

const VALID_ITEMS = [
  textItem("JORDAN SMITH", 220, 738, 17),
  textItem("jordan@example.com | Indianapolis, IN", 170, 720, 9),
  textItem("PROFESSIONAL SUMMARY", 54, 690, 10),
  textItem("Operations leader with verified experience.", 54, 672, 10),
  textItem("CORE SKILLS", 54, 640, 10),
  textItem("Management: Operations Leadership", 54, 622, 10),
  textItem("PROFESSIONAL EXPERIENCE", 54, 590, 10),
  textItem("Operations Manager", 54, 572, 10),
  textItem("EDUCATION", 54, 430, 10),
  textItem("Bachelor of Science", 54, 412, 10),
];

describe("runVisualQA", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockExtractTextItems.mockResolvedValue({ totalPages: 1, items: [VALID_ITEMS] });
    mockRenderPageAsImage.mockResolvedValue(screenshotArrayBuffer());
  });

  it("captures a PNG and passes measurable layout checks", async () => {
    const output = await runVisualQA("resume-1", "signed://preview", Buffer.from("pdf"), {
      roleType: "OPERATIONS",
      candidateName: "Jordan Smith",
      expectedSections: [
        "Professional Summary",
        "Core Skills",
        "Professional Experience",
        "Education",
      ],
    });

    expect(output.result.passed).toBe(true);
    expect(output.result.referenceStandard).toBe("private-sector-one-page-v1");
    expect(output.result.pageCountActual).toBe(1);
    expect(output.result.layoutMetrics?.minFontSizePt).toBeGreaterThanOrEqual(9);
    expect(output.result.checks.screenshotRendered.status).toBe("passed");
    expect(output.screenshot.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("fails honestly when an expected rendered section is absent", async () => {
    const output = await runVisualQA("resume-2", "signed://preview", Buffer.from("pdf"), {
      roleType: "OPERATIONS",
      candidateName: "Jordan Smith",
      expectedSections: ["Projects"],
    });

    expect(output.result.passed).toBe(false);
    expect(output.result.checks.sectionBreaks.status).toBe("failed");
    expect(output.result.recommendedAction).toBe("surface");
  });

  it("does not mistake right-aligned dates for a second content column", async () => {
    const datedItems = [
      ...VALID_ITEMS,
      textItem("Operations Manager", 54, 560, 10),
      textItem("Jan 2022 - Present", 468, 560, 10),
      textItem("Program Analyst", 54, 530, 10),
      textItem("May 2020 - Dec 2021", 456, 530, 10),
      textItem("Associate Analyst", 54, 500, 10),
      textItem("Jun 2018 - Apr 2020", 456, 500, 10),
      textItem("Intern", 54, 470, 10),
      textItem("Jan 2017 - May 2018", 456, 470, 10),
    ];
    mockExtractTextItems.mockResolvedValue({ totalPages: 1, items: [datedItems] });

    const output = await runVisualQA("resume-dates", "signed://preview", Buffer.from("pdf"), {
      roleType: "OPERATIONS",
      candidateName: "Jordan Smith",
      expectedSections: ["Professional Summary", "Core Skills", "Professional Experience", "Education"],
    });

    expect(output.result.checks.atsLayoutSafe.status).toBe("passed");
    expect(output.result.passed).toBe(true);
  });

  it("still rejects a genuine two-column body layout", async () => {
    const twoColumnItems = [
      ...VALID_ITEMS,
      ...Array.from({ length: 4 }, (_, row) => [
        textItem(`Left column body content row ${row}`, 54, 560 - row * 28, 10),
        textItem(`Right column body content row ${row}`, 360, 560 - row * 28, 10),
      ]).flat(),
    ];
    mockExtractTextItems.mockResolvedValue({ totalPages: 1, items: [twoColumnItems] });

    const output = await runVisualQA("resume-columns", "signed://preview", Buffer.from("pdf"), {
      roleType: "OPERATIONS",
      candidateName: "Jordan Smith",
      expectedSections: ["Professional Summary", "Core Skills", "Professional Experience", "Education"],
    });

    expect(output.result.checks.atsLayoutSafe.status).toBe("failed");
    expect(output.result.passed).toBe(false);
  });

  it("does not invent a pass when PDF rasterization fails", async () => {
    mockRenderPageAsImage.mockRejectedValue(new Error("renderer unavailable"));
    const output = await runVisualQA("resume-3", "signed://preview", Buffer.from("pdf"));

    expect(output.result.passed).toBe(false);
    expect(output.result.checks.screenshotRendered.status).toBe("failed");
    expect(output.screenshot).toHaveLength(0);
  });
});
