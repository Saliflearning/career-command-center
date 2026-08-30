import {
  classifyResumeContentResponse,
  normalizeResumeContent,
  sourceResumeTextFromSections,
} from "./content-contract";

describe("resume content contract", () => {
  it("keeps a 202 response in bounded processing without exposing its body", () => {
    expect(
      classifyResumeContentResponse(202, {
        state: "GENERATING",
        message: "Internal worker and storage details must stay private.",
      })
    ).toEqual({
      kind: "processing",
      state: "GENERATING",
      message: "This resume is still being generated.",
    });
  });

  it("routes an expired session to authentication recovery", () => {
    expect(classifyResumeContentResponse(401, { error: "Unauthorized" })).toEqual({
      kind: "unauthorized",
      message: "Your session expired. Sign in to continue with this resume.",
    });
  });

  it.each([403, 404])(
    "bounds an unavailable resume returned with HTTP %s",
    (status) => {
      expect(
        classifyResumeContentResponse(status, {
          error: "Private ownership or lookup diagnostic",
        })
      ).toEqual({
        kind: "unavailable",
        message: "This resume is unavailable. Choose an existing resume or start a new one.",
      });
    }
  );

  it("bounds server failures without exposing their response body", () => {
    expect(
      classifyResumeContentResponse(500, {
        error: "Internal persistence failure with private infrastructure identifiers",
      })
    ).toEqual({
      kind: "error",
      message: "Resume content could not be loaded. Please try again.",
    });
  });

  it("normalizes absent legacy collections to empty arrays", () => {
    const result = classifyResumeContentResponse(200, {
      resumeId: "resume-123",
      state: "QA_REVIEWED",
      targetRole: "Operations Manager",
      summaryText: "A completed draft.",
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Expected ready content");

    expect(result.data.sections).toEqual([]);
    expect(result.data.workHistory).toEqual([]);
    expect(result.data.education).toEqual([]);
    expect(result.data.certifications).toEqual([]);
    expect(result.data.skills).toEqual([]);
    expect(result.data.projects).toEqual([]);
    expect(result.data.roleType).toBeNull();
    expect(result.data.presentation).toEqual({
      font: "sans",
      scale: "normal",
      density: "balanced",
    });
  });

  it("normalizes saved document presentation", () => {
    const result = normalizeResumeContent({
      resumeId: "resume-123",
      state: "USER_EDITING",
      presentation: { font: "serif", scale: "large", density: "open" },
    });

    expect(result?.presentation).toEqual({
      font: "serif",
      scale: "large",
      density: "open",
    });
  });

  it("normalizes an optional source-grounded target headline", () => {
    const result = normalizeResumeContent({
      resumeId: "resume-123",
      state: "QA_REVIEWED",
      candidateHeadline: "Senior Operations Manager",
    });

    expect(result?.candidateHeadline).toBe("Senior Operations Manager");
  });

  it("does not expose a legacy editor loading placeholder as resume content", () => {
    const result = normalizeResumeContent({
      resumeId: "resume-123",
      state: "USER_EDITING",
      summaryText: "Loading summary...",
    });

    expect(result?.summaryText).toBeNull();
  });

  it("recovers the persisted source resume for preview round trips", () => {
    expect(
      sourceResumeTextFromSections([
        { name: "summary", sortOrder: 0, visible: true, content: "Generated summary" },
        {
          name: "source_resume",
          sortOrder: -1,
          visible: false,
          content: "  SOURCE RESUME\n- Preserved evidence.  ",
        },
      ])
    ).toBe("SOURCE RESUME\n- Preserved evidence.");
  });

  it("recovers the real visible summary section when the legacy field is a placeholder", () => {
    const result = normalizeResumeContent({
      resumeId: "resume-123",
      state: "USER_EDITING",
      summaryText: "Loading summary...",
      sections: [
        {
          name: "professional_summary",
          sortOrder: 1,
          visible: true,
          content: "A verified candidate summary.",
        },
      ],
    });

    expect(result?.summaryText).toBe("A verified candidate summary.");
  });

  it("normalizes missing nested bullet arrays without losing the role", () => {
    const result = normalizeResumeContent({
      resumeId: "resume-123",
      state: "QA_REVIEWED",
      workHistory: [
        {
          workHistoryId: "job-1",
          company: "Example Co",
          title: "Manager",
          startDate: "2024-01-01",
        },
      ],
    });

    expect(result?.workHistory).toEqual([
      expect.objectContaining({
        workHistoryId: "job-1",
        bullets: [],
      }),
    ]);
  });

  it("preserves source-authored date labels for Quick Resume content", () => {
    const result = normalizeResumeContent({
      resumeId: "resume-123",
      state: "QA_REVIEWED",
      workHistory: [
        {
          workHistoryId: "job-1",
          company: "Example Co",
          title: "Shift Lead",
          startDate: "",
          dateLabel: "About four years",
          bullets: [],
        },
      ],
      education: [
        {
          degree: "High School Diploma",
          institution: "North High School",
          graduationDate: null,
          inProgress: false,
          dateLabel: "Completed 2018",
          details: "Coursework in business operations.",
        },
      ],
      certifications: [
        {
          name: "Forklift Certification",
          issuingBody: "Warehouse Safety Council",
          issueDate: null,
          dateLabel: "Earned 2019",
        },
      ],
    });

    expect(result?.workHistory[0].dateLabel).toBe("About four years");
    expect(result?.education[0]).toMatchObject({
      dateLabel: "Completed 2018",
      details: "Coursework in business operations.",
    });
    expect(result?.certifications[0].dateLabel).toBe("Earned 2019");
  });

  it("normalizes projected projects without trusting malformed technologies", () => {
    const result = normalizeResumeContent({
      resumeId: "resume-123",
      state: "QA_REVIEWED",
      roleType: "TECHNICAL",
      projects: [
        {
          id: "project-1",
          name: "Cloud Reliability Lab",
          description: "Built an observable deployment workflow.",
          technologies: ["AWS", "Terraform", null, ""],
          url: "https://example.com/project",
          startDate: "2025-01-01",
          endDate: null,
        },
      ],
    });

    expect(result?.roleType).toBe("TECHNICAL");
    expect(result?.projects).toEqual([
      {
        id: "project-1",
        name: "Cloud Reliability Lab",
        description: "Built an observable deployment workflow.",
        technologies: ["AWS", "Terraform"],
        url: "https://example.com/project",
        startDate: "2025-01-01",
        endDate: null,
      },
    ]);
  });

  it("rejects a successful payload that is not completed resume content", () => {
    expect(
      classifyResumeContentResponse(200, {
        state: "GENERATING",
        message: "Not content",
      })
    ).toEqual({
      kind: "error",
      message: "Resume content is incomplete. Please try again.",
    });
  });
});
