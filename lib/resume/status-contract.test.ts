import { classifyResumeStatusResponse } from "./status-contract";

describe("resume status response contract", () => {
  it("accepts a complete pipeline status payload", () => {
    expect(
      classifyResumeStatusResponse(200, {
        state: "GENERATING",
        progressPercent: 78,
        label: "Writing tailored bullets",
        errorMessage: null,
      })
    ).toEqual({
      kind: "ready",
      data: {
        state: "GENERATING",
        progressPercent: 78,
        label: "Writing tailored bullets",
        errorMessage: null,
      },
    });
  });

  it("routes an expired session to authentication recovery", () => {
    expect(classifyResumeStatusResponse(401, { error: "Unauthorized" })).toEqual({
      kind: "unauthorized",
      message: "Your session expired. Sign in to continue with this resume.",
    });
  });

  it.each([403, 404])(
    "does not keep polling an unavailable resume returned with HTTP %s",
    (status) => {
      expect(classifyResumeStatusResponse(status, { error: "Not found" })).toEqual({
        kind: "unavailable",
        message: "This resume is unavailable. Choose an existing resume or start a new one.",
      });
    }
  );

  it("bounds unexpected server errors without exposing the response body", () => {
    expect(
      classifyResumeStatusResponse(503, {
        error: "Database connection includes private infrastructure details",
      })
    ).toEqual({
      kind: "error",
      message: "Resume status could not be loaded. Please try again.",
    });
  });

  it.each([
    null,
    { state: "GENERATING", progressPercent: 78 },
    { state: "GENERATING", progressPercent: 101, label: "Invalid" },
    { state: "", progressPercent: 10, label: "Starting" },
  ])("rejects a malformed HTTP 200 payload: %p", (payload) => {
    expect(classifyResumeStatusResponse(200, payload)).toEqual({
      kind: "error",
      message: "Resume status is incomplete. Please refresh and try again.",
    });
  });
});
