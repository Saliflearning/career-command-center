export interface TeachingConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  method: "POST" | "DELETE";
}

export function getTeachingConfirmation(approved: boolean): TeachingConfirmation {
  if (approved) {
    return {
      title: "Stop teaching from this resume?",
      description:
        "Remove this private example from your account. It will no longer influence future drafts.",
      confirmLabel: "Remove teaching example",
      method: "DELETE",
    };
  }

  return {
    title: "Teach 3C from this resume?",
    description:
      "Save this approved resume as a private example for your account. Its structure and writing style may influence similar future drafts.",
    confirmLabel: "Use as teaching example",
    method: "POST",
  };
}
