import { analyzeResumeAgainstJob, extractJobTermDetails } from "./scan-analysis";

describe("resume scan adversarial inputs", () => {
  it("keeps legal job-board boilerplate out of the scored vocabulary", () => {
    const jd = [
      "Senior Backend Engineer",
      "Build distributed services in Go and Kubernetes. Own API reliability and incident response.",
      "We are an equal opportunity employer and do not discriminate based on race, color, religion, sex, national origin, disability, age, sexual orientation, gender identity, or veteran status.",
    ].join("\n");

    const terms = extractJobTermDetails(jd).map((item) => item.term);

    expect(terms).toEqual(expect.arrayContaining([expect.stringMatching(/distributed|kubernetes|api/i)]));
    expect(terms.join(" ")).not.toMatch(/race|religion|national origin|disability|sexual orientation|veteran status/i);
  });

  it("handles a very short JD without inventing a large vocabulary", () => {
    const analysis = analyzeResumeAgainstJob(
      "Python Developer\nEXPERIENCE\nBuilt Python APIs for production systems.",
      "Python developer"
    );

    expect(analysis.totalKeywords).toBeGreaterThan(0);
    expect(analysis.totalKeywords).toBeLessThanOrEqual(3);
    expect(analysis.matchedCount).toBeGreaterThan(0);
  });

  it("deduplicates repeated tokens instead of inflating the score denominator", () => {
    const repeated = Array(100).fill("Python").join(" ");
    const details = extractJobTermDetails(repeated);

    expect(details.map((item) => item.term)).toEqual(["python"]);
  });

  it("keeps useful English requirements when the posting contains a foreign-language fragment", () => {
    const analysis = analyzeResumeAgainstJob(
      "EXPERIENCE\nBuilt SQL dashboards and automated financial reporting.\nEDUCATION\nB.S. Finance",
      "Data Analyst. Build SQL dashboards and financial reporting. Tambien colaborara con equipos internacionales y preparara informes mensuales."
    );

    expect(analysis.totalKeywords).toBeLessThanOrEqual(24);
    expect(analysis.matchedKeywords.join(" ")).toMatch(/sql|dashboard|financial reporting/i);
  });

  it("does not count unrelated words that merely share a short prefix", () => {
    const analysis = analyzeResumeAgainstJob(
      "EXPERIENCE\nManaged analyst relations and maintained filing systems.",
      "Administer medications and maintain clinical documentation."
    );

    expect(analysis.matchedKeywords.join(" ")).not.toMatch(/administer medications/i);
  });

  it("does not treat job-board headers or generic prose as missing nursing skills", () => {
    const resume = [
      "Jordan Lee, RN",
      "EXPERIENCE",
      "Registered Nurse | Lakeside Medical Center | 2019 - Present",
      "- Coordinated patient assessments, medication administration, discharge education, and interdisciplinary care for adult medical-surgical patients.",
      "- Trained new nurses on safety protocols and electronic health record documentation.",
      "CERTIFICATIONS",
      "Active RN license, BLS, ACLS",
    ].join("\n");
    const jd = [
      "Registered Nurse - Medical Surgical",
      "Northside Regional Hospital",
      "We are seeking a registered nurse to deliver safe patient care on a busy medical-surgical unit.",
      "Responsibilities include patient assessment, medication administration, care planning, discharge education, electronic health record documentation, infection prevention, collaboration with physicians, and mentoring new nurses.",
      "Requirements: active RN license, BLS certification, ACLS preferred, and at least three years of acute-care nursing experience.",
      "Northside Regional Hospital is an equal opportunity employer and does not discriminate based on race, color, religion, sex, disability, age, or protected status.",
    ].join("\n");

    const analysis = analyzeResumeAgainstJob(resume, jd);
    const missing = analysis.missingKeywordDetails.map((item) => item.term).join(" ");

    expect(analysis.fitLabel).not.toBe("Limited alignment");
    expect(missing).not.toMatch(/northside|regional|hospital|active|based|busy|race|religion|protected/i);
    expect(analysis.matchedKeywords.join(" ")).toMatch(/patient|medication|electronic health|rn|bls|acls/i);
  });

  it("excludes benefits and availability metadata without dropping real planning requirements", () => {
    const jd = [
      "Production Planning Supervisor- job post",
      "nGROUP PERFORMANCE PARTNERS",
      "Job details",
      "Pay",
      "$70,000 a year",
      "Job type",
      "Full-time",
      "Shift and schedule",
      "Night shift",
      "Day shift",
      "Benefits",
      "Dental insurance",
      "Full job description",
      "Overview",
      "Strong knowledge of production planning, capacity planning, and demand forecasting.",
      "Core Responsibilities",
      "Build shift labor plans aligned to volume and standards.",
      "Lead hourly execution reviews during shift.",
      "Benefits:",
      "Dental insurance",
      "Application Question(s):",
      "How many years of forecasting experience do you have?",
      "Shift availability:",
      "Day Shift (Required)",
      "Night Shift (Required)",
      "Work Location: In person",
    ].join("\n");

    const terms = extractJobTermDetails(jd).map((item) => item.term);
    const vocabulary = terms.join(" ");

    expect(vocabulary).toMatch(/production planning|capacity planning|demand forecasting|labor plans/i);
    expect(vocabulary).not.toMatch(/dental|insurance|night shift|day shift|work location/i);
    expect(terms).not.toContain("jd");
  });
});
