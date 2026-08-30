import { hasActivePipelineClaim } from "./pipeline-claim";

describe("hasActivePipelineClaim", () => {
  const now = new Date("2026-07-15T04:00:00.000Z");

  it("recognizes a recent unfinished claim", () => {
    expect(hasActivePipelineClaim({
      pipelineStartedAt: new Date("2026-07-15T03:55:00.000Z"),
      pipelineFinishedAt: null,
    }, now)).toBe(true);
  });

  it("allows a completed run to be retried", () => {
    expect(hasActivePipelineClaim({
      pipelineStartedAt: new Date("2026-07-15T03:55:00.000Z"),
      pipelineFinishedAt: new Date("2026-07-15T03:57:00.000Z"),
    }, now)).toBe(false);
  });

  it("allows an unfinished stale claim to be recovered", () => {
    expect(hasActivePipelineClaim({
      pipelineStartedAt: new Date("2026-07-15T03:49:59.000Z"),
      pipelineFinishedAt: null,
    }, now)).toBe(false);
  });

  it("does not treat an unclaimed resume as active", () => {
    expect(hasActivePipelineClaim({
      pipelineStartedAt: null,
      pipelineFinishedAt: null,
    }, now)).toBe(false);
  });
});
