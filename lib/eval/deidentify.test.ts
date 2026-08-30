import { deidentifyResume, findResidualPii } from "./deidentify";

// All fixtures synthetic — no real PII in the committed suite.
const RESUME = [
  "JORDAN EXAMPLE",
  "100 Example Avenue, Columbus, OH 43004 | (614) 555-0142 | jordan.example@example.com | linkedin.com/in/jordan-example",
  "PROFESSIONAL EXPERIENCE",
  "Operations Lead | Example Logistics | 2019 - Present",
  "- Jordan led 40 associates and reduced defects 18% for the site.",
  "EDUCATION",
  "B.S. Business | State University",
].join("\n");

describe("deidentifyResume", () => {
  it("removes email, phone, profile URL, and street address", () => {
    const { text, replaced } = deidentifyResume(RESUME);
    expect(text).not.toMatch(/jordan\.example@example\.com/);
    expect(text).not.toMatch(/\(614\) 555-0142/);
    expect(text).not.toMatch(/linkedin\.com\/in\/jordan-example/);
    expect(text).not.toMatch(/100 Example Avenue/i);
    expect(text).toContain("[EMAIL]");
    expect(text).toContain("[PHONE]");
    expect(text).toContain("[URL]");
    expect(text).toContain("[ADDRESS]");
    expect(replaced.emails).toBe(1);
    expect(replaced.phones).toBe(1);
    expect(replaced.urls).toBe(1);
  });

  it("scrubs the candidate name (header and inline) when provided", () => {
    const { text } = deidentifyResume(RESUME, "Jordan Example");
    expect(text).not.toMatch(/\bJordan\b/);
    expect(text).not.toMatch(/Jordan Example/);
    expect(text).toContain("[CANDIDATE]");
  });

  it("KEEPS employer, school, title, metrics, and city/state", () => {
    const { text } = deidentifyResume(RESUME, "Jordan Example");
    expect(text).toContain("Operations Lead");
    expect(text).toContain("State University");
    expect(text).toContain("18%");
    expect(text).toMatch(/Columbus, OH/); // city/state kept
  });

  it("does not mangle date ranges as phone numbers", () => {
    const { text } = deidentifyResume("Worked 2019 - 2024 on the platform.");
    expect(text).toContain("2019 - 2024");
    expect(text).not.toContain("[PHONE]");
  });

  it("findResidualPii flags leftover identifiers and is clean after scrubbing", () => {
    expect(findResidualPii(RESUME).length).toBeGreaterThan(0);
    const { text } = deidentifyResume(RESUME, "Jordan Example");
    expect(findResidualPii(text)).toEqual([]);
  });
});
