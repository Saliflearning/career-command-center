// Regression: a real Indeed/DHL posting titles the role
// "Senior Operations Manager (Operations Manager I)". The parenthetical job
// code must be stripped before the title is re-injected as a scored term.
// Before this fix the term became the un-matchable 6-word phrase
// "senior operations manager operations manager i" (real-data QA, 2026-07-17).
import { analyzeResumeAgainstJob } from "./scan-analysis";

const JD = [
  "Senior Operations Manager (Operations Manager I)",
  "DHL Supply Chain",
  "",
  "Lead a diverse team of Supervisors. Develop efficient workflows and labor plans.",
  "Compile reports on key performance indicators and productivity metrics.",
].join("\n");

const RESUME = [
  "ALEX EXAMPLE",
  "City, ST | (317) 555-0100 | alex@example.com",
  "PROFESSIONAL EXPERIENCE",
  "Senior Operations Manager | Example Logistics | 2018 - Present",
  "- Led a team of supervisors across a high-volume warehouse.",
  "- Built labor plans and workflows; reported KPIs and productivity weekly.",
].join("\n");

describe("title parenthetical stripping", () => {
  const r = analyzeResumeAgainstJob(RESUME, JD);
  const allTerms = [...r.matchedKeywords, ...r.missingKeywordDetails.map((d) => d.term)];

  it("never emits the mangled repeated-word title phrase", () => {
    expect(allTerms).not.toContain("senior operations manager operations manager i");
  });

  it("scores the clean role title and matches a resume that carries it", () => {
    expect(r.matchedKeywords).toContain("senior operations manager");
  });
});
