import { isResumeExportableState } from "./state-capabilities";

describe("resume state capabilities", () => {
  it.each(["QA_REVIEWED", "USER_EDITING", "EXPORTED", "TRACKED"])(
    "allows export for %s resumes",
    (state) => {
      expect(isResumeExportableState(state)).toBe(true);
    }
  );

  it.each([undefined, null, "", "UPLOADED", "GENERATING", "FAILED"])(
    "rejects export for %s",
    (state) => {
      expect(isResumeExportableState(state)).toBe(false);
    }
  );
});