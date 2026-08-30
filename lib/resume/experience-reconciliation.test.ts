import { reconcileExperienceEntries } from "./experience-reconciliation";

describe("reconcileExperienceEntries", () => {
  it("uses employer dates and combines undated nested headings", () => {
    const source = `NORTHSTAR LOGISTICS
Operations & Fulfillment Leadership Experience | Columbus, OH | 2018 - 2023
Operations Leadership Experience
- Led and supported teams of 75+ associates.
Process Improvement Internship
- Reduced peak weekly defects by 28%.
Blue Ridge Technology | Associate Cloud Engineer
Columbus, OH | Feb 2024 - Nov 2025`;
    const result = reconcileExperienceEntries([
      { company: "NORTHSTAR LOGISTICS", title: "Operations Leadership Experience", startDate: "2018-01", endDate: null, current: true, location: "Columbus, OH", employmentType: null, bullets: ["Led and supported teams of 75+ associates."] },
      { company: "NORTHSTAR LOGISTICS", title: "Process Improvement Internship", startDate: "2018-01", endDate: "2018-12", current: false, location: "Columbus, OH", employmentType: "Internship", bullets: ["Reduced peak weekly defects by 28%."] },
      { company: "Blue Ridge Technology", title: "Associate Cloud Engineer", startDate: "2024-02", endDate: "2025-11", current: false, location: "Columbus, OH", employmentType: null, bullets: ["Maintained onboarding documentation."] },
    ], source);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ company: "NORTHSTAR LOGISTICS", title: "Operations & Fulfillment Leadership Experience", startDate: "2018-01", endDate: "2023-12", current: false });
    expect(result[0].bullets).toHaveLength(2);
    expect(result[1]).toMatchObject({ company: "Blue Ridge Technology", startDate: "2024-02", endDate: "2025-11", current: false });
  });

  it("rejects current status without present in the source", () => {
    const result = reconcileExperienceEntries([
      { company: "Acme", title: "Operations Manager", startDate: "2022-01", endDate: null, current: true, location: null, employmentType: null, bullets: ["Managed daily operations."] },
    ], "Acme | Operations Manager | 2022 - 2024");
    expect(result[0]).toMatchObject({ endDate: "2024-12", current: false });
  });

  it("never replaces a parsed role title with a location heading", () => {
    const result = reconcileExperienceEntries([
      {
        company: "Blue Ridge Technology",
        title: "Associate Cloud Engineer",
        startDate: "2024-02",
        endDate: "2025-11",
        current: false,
        location: "Columbus, OH",
        employmentType: null,
        bullets: ["Maintained onboarding documentation."],
      },
    ], "Blue Ridge Technology | Columbus, OH | Associate Cloud Engineer | Feb 2024 - Nov 2025");

    expect(result[0]).toMatchObject({
      company: "Blue Ridge Technology",
      title: "Associate Cloud Engineer",
      startDate: "2024-02",
      endDate: "2025-11",
    });
  });
});
