import type { CareerMemory } from "@/lib/types";

const mockFindMany = jest.fn();

jest.mock("@/lib/db/client", () => ({
  db: {
    workHistory: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { refreshResumeSourceProfile } from "./resume-source-profile";

const profile: CareerMemory = {
  id: "memory-1",
  userId: "user-1",
  version: 1,
  jobs: [
    {
      id: "job-1",
      company: "Example Corp",
      title: "Operations Manager",
      startDate: "2021-01-01T00:00:00.000Z",
      endDate: null,
      current: true,
      location: "Indianapolis, IN",
      employmentType: "Full-Time",
      bullets: [],
      sourceType: "UPLOADED",
      verified: true,
      locked: false,
      sortOrder: 0,
    },
  ],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
  achievements: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function bullet(
  id: string,
  contentType: "VERIFIED" | "GENERATED",
  usedInResumeIds: string[]
) {
  return {
    id,
    workHistoryId: "job-1",
    content: id + " content",
    contentType,
    metrics: [],
    keywords: [],
    locked: false,
    usedInResumes: usedInResumeIds.map((linkId) => ({ id: linkId })),
  };
}

describe("refreshResumeSourceProfile", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it("keeps source bullets and only generated bullets linked to this resume", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "job-1",
        company: "Example Corp",
        title: "Operations Manager",
        startDate: new Date("2021-01-01T00:00:00.000Z"),
        endDate: null,
        current: true,
        location: "Indianapolis, IN",
        employmentType: "Full-Time",
        bullets: [
          bullet("source-bullet", "VERIFIED", []),
          bullet("current-generated", "GENERATED", ["current-link"]),
          bullet("other-resume-generated", "GENERATED", []),
        ],
      },
    ]);

    const refreshed = await refreshResumeSourceProfile("resume-current", profile);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["job-1"] } },
      include: {
        bullets: {
          include: {
            usedInResumes: {
              where: { resumeId: "resume-current" },
              select: { id: true },
            },
          },
        },
      },
    });
    expect(refreshed.jobs[0].bullets.map((entry) => entry.id)).toEqual([
      "source-bullet",
      "current-generated",
    ]);
  });
});
