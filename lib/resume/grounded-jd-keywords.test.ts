import { mergeGroundedJdKeywords } from "@/lib/resume/grounded-jd-keywords";
import type { CareerMemory } from "@/lib/types";

const memory = {
  jobs: [
    {
      title: "Program Analyst",
      company: "Public Agency",
      bullets: [
        { content: "Compiled performance reports and tracked program compliance." },
      ],
    },
  ],
  skills: [{ name: "Program analysis" }],
  education: [],
  certifications: [],
} as unknown as CareerMemory;

describe("mergeGroundedJdKeywords", () => {
  it("retains JD language already proven by the source profile", () => {
    const keywords = mergeGroundedJdKeywords(
      ["stakeholder communication"],
      memory,
      "Program Analyst\nPublic Agency\nPerformance reports. Program compliance."
    );

    expect(keywords).toContain("stakeholder communication");
    expect(keywords).toContain("program analyst");
    expect(keywords).toContain("performance reports");
    expect(keywords).toContain("program compliance");
  });

  it("does not add a JD phrase that the profile does not support", () => {
    const keywords = mergeGroundedJdKeywords(
      [],
      memory,
      "Program Analyst\nOwn a seven-figure capital budget."
    );

    expect(keywords).not.toContain("capital budget");
  });
});
