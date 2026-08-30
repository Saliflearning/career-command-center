import { getTeachingConfirmation } from "./teaching-confirmation";

describe("teaching confirmation", () => {
  it("describes the private data write before adding an example", () => {
    expect(getTeachingConfirmation(false)).toEqual({
      title: "Teach 3C from this resume?",
      description:
        "Save this approved resume as a private example for your account. Its structure and writing style may influence similar future drafts.",
      confirmLabel: "Use as teaching example",
      method: "POST",
    });
  });

  it("describes removal before deleting an example", () => {
    expect(getTeachingConfirmation(true)).toEqual({
      title: "Stop teaching from this resume?",
      description:
        "Remove this private example from your account. It will no longer influence future drafts.",
      confirmLabel: "Remove teaching example",
      method: "DELETE",
    });
  });
});
