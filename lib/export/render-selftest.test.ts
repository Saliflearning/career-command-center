import { expectedSectionsFor } from "@/lib/resume/expected-sections";
import { isRenderSelfTestEnabled, renderSelfTestFixture } from "./render-selftest";

describe("render self-test switch", () => {
  it("is off unless RESUME_RENDER_SELFTEST is exactly 1", () => {
    expect(isRenderSelfTestEnabled({})).toBe(false);
    expect(isRenderSelfTestEnabled({ RESUME_RENDER_SELFTEST: "" })).toBe(false);
    expect(isRenderSelfTestEnabled({ RESUME_RENDER_SELFTEST: "0" })).toBe(false);
    expect(isRenderSelfTestEnabled({ RESUME_RENDER_SELFTEST: "true" })).toBe(false);
    expect(isRenderSelfTestEnabled({ RESUME_RENDER_SELFTEST: "1" })).toBe(true);
    expect(isRenderSelfTestEnabled({ RESUME_RENDER_SELFTEST: " 1 " })).toBe(true);
  });
});

describe("render self-test fixture", () => {
  it("exercises every section the visual gate checks", () => {
    expect(expectedSectionsFor(renderSelfTestFixture())).toEqual([
      "Professional Summary",
      "Core Skills",
      "Professional Experience",
      "Education",
      "Certifications",
    ]);
  });

  it("returns a fresh object each call so a caller cannot mutate shared state", () => {
    const first = renderSelfTestFixture();
    first.jobs.length = 0;
    expect(renderSelfTestFixture().jobs.length).toBe(2);
  });
});
