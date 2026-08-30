import { getMarketingNavCurrentState } from "@/components/marketing/marketing-navigation-state";

describe("marketing navigation current state", () => {
  it("marks route destinations as the current page", () => {
    expect(getMarketingNavCurrentState("/scan", "")).toEqual({
      href: "/scan",
      ariaCurrent: "page",
    });
    expect(getMarketingNavCurrentState("/pricing", "#features")).toEqual({
      href: "/#pricing",
      ariaCurrent: "page",
    });
  });

  it("marks homepage sections as the current location", () => {
    expect(getMarketingNavCurrentState("/", "#how-it-works")).toEqual({
      href: "/#how-it-works",
      ariaCurrent: "location",
    });
    expect(getMarketingNavCurrentState("/", "features")).toEqual({
      href: "/#features",
      ariaCurrent: "location",
    });
    expect(getMarketingNavCurrentState("/", "#pricing")).toEqual({
      href: "/#pricing",
      ariaCurrent: "location",
    });
  });

  it("does not let a stale hash override another route", () => {
    expect(getMarketingNavCurrentState("/scan", "#features")).toEqual({
      href: "/scan",
      ariaCurrent: "page",
    });
  });

  it("leaves the homepage top level unselected", () => {
    expect(getMarketingNavCurrentState("/", "")).toBeNull();
    expect(getMarketingNavCurrentState("/", "#unknown")).toBeNull();
  });
});
