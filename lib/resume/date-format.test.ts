import {
  formatCertificationLabel,
  formatEducationDateUtc,
  formatMonthYearRangeUtc,
  formatMonthYearUtc,
  formatYearUtc,
} from "./date-format";

describe("UTC resume date formatting", () => {
  it("does not roll a UTC date-only value into the previous month", () => {
    expect(formatMonthYearUtc("2022-01-01T00:00:00.000Z")).toBe("Jan 2022");
    expect(formatMonthYearRangeUtc("2022-01-01T00:00:00.000Z", null, true)).toBe(
      "Jan 2022 - Present"
    );
  });

  it("keeps education years in UTC", () => {
    expect(formatYearUtc("2021-01-01T00:00:00.000Z")).toBe("2021");
  });

  it("does not invent month precision for canonical year-only ranges", () => {
    expect(formatMonthYearRangeUtc(
      "2017-01-01T00:00:00.000Z",
      "2024-12-01T00:00:00.000Z",
      false
    )).toBe("2017 - 2024");
  });

  it("preserves exact education precision and completion state", () => {
    expect(formatEducationDateUtc("2026-05-01T00:00:00.000Z", false)).toBe("May 2026");
    expect(formatEducationDateUtc("2023-01-01T00:00:00.000Z", false)).toBe("2023");
    expect(formatEducationDateUtc("2026-05-01T00:00:00.000Z", true)).toBe("Expected May 2026");
  });

  it("preserves certification years without inventing missing dates", () => {
    expect(formatCertificationLabel({
      name: "AWS Certified Solutions Architect - Associate",
      issueDate: "2025-01-01T00:00:00.000Z",
    })).toBe("AWS Certified Solutions Architect - Associate (2025)");
    expect(formatCertificationLabel({
      name: "ITIL Foundation",
      issueDate: null,
    })).toBe("ITIL Foundation");
  });

  it("returns an empty value for invalid dates", () => {
    expect(formatMonthYearUtc("not-a-date")).toBe("");
    expect(formatYearUtc("not-a-date")).toBe("");
  });
});
