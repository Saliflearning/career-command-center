import { sanitizeEducationOutput } from "./index";

describe("sanitizeEducationOutput", () => {
  it("keeps complete education entries and normalizes optional values", () => {
    expect(sanitizeEducationOutput([
      {
        degree: "  Bachelor of Science  ",
        school: "  Example University  ",
        graduationDate: "  2024-05  ",
        expected: true,
        gpa: " 3.8 ",
      },
    ])).toEqual([
      {
        degree: "Bachelor of Science",
        school: "Example University",
        graduationDate: "2024-05",
        expected: true,
        gpa: "3.8",
      },
    ]);
  });

  it("drops partial and malformed entries before they can reach Prisma", () => {
    expect(sanitizeEducationOutput([
      { degree: "Sterile Processing certification", school: null },
      { degree: " ", school: "Example University" },
      { degree: "Associate Degree", school: "" },
      null,
      "not an education entry",
      { degree: "Associate Degree", school: "Community College", expected: "false" },
    ])).toEqual([
      {
        degree: "Associate Degree",
        school: "Community College",
        graduationDate: null,
        expected: false,
        gpa: null,
      },
    ]);
  });

  it("returns an empty list for a non-array model response", () => {
    expect(sanitizeEducationOutput({ degree: "Bachelor of Science" })).toEqual([]);
  });
});
