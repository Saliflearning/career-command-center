import type { IntakeQuestion } from "./quick-resume-contract";
import {
  QUESTION_BATCH_SIZE,
  buildSubmittedEvidenceAnswers,
  getInterviewBatch,
  isEvidenceResponseComplete,
  type EvidenceResponse,
} from "./quick-resume-interview";

const questions: IntakeQuestion[] = Array.from({ length: 7 }, (_, index) => ({
  id: `q${index + 1}`,
  evidenceKey: `requirement-${index + 1}`,
  question: `Do you have evidence for requirement ${index + 1}?`,
  essential: index < 3,
})) as IntakeQuestion[];

describe("Quick Resume progressive evidence interview", () => {
  it("shows no more than three JD-derived questions in a batch", () => {
    expect(QUESTION_BATCH_SIZE).toBe(3);
    expect(getInterviewBatch(questions, 0).map(({ id }) => id)).toEqual(["q1", "q2", "q3"]);
    expect(getInterviewBatch(questions, 1).map(({ id }) => id)).toEqual(["q4", "q5", "q6"]);
    expect(getInterviewBatch(questions, 2).map(({ id }) => id)).toEqual(["q7"]);
  });

  it("requires truthful details after Yes but accepts No and Not sure without prose", () => {
    expect(isEvidenceResponseComplete({ choice: "yes", details: "" })).toBe(false);
    expect(isEvidenceResponseComplete({ choice: "yes", details: "Used Excel for two years." })).toBe(true);
    expect(isEvidenceResponseComplete({ choice: "no", details: "" })).toBe(true);
    expect(isEvidenceResponseComplete({ choice: "unsure", details: "" })).toBe(true);
  });

  it("submits explicit negative evidence without turning it into a positive claim", () => {
    const responses: Record<string, EvidenceResponse> = {
      q1: { choice: "yes", details: "Led eight people during weekend shifts." },
      q2: { choice: "no", details: "ignored text" },
      q3: { choice: "unsure", details: "ignored text" },
    };

    expect(buildSubmittedEvidenceAnswers(questions.slice(0, 3), responses)).toEqual([
      { questionId: "q1", answer: "Yes. Candidate evidence: Led eight people during weekend shifts." },
      { questionId: "q2", answer: "No. The candidate reports no evidence for this requirement. Do not include it as a candidate skill or claim." },
      { questionId: "q3", answer: "Not sure. The candidate did not provide usable evidence for this requirement. Do not include it as a candidate skill or claim." },
    ]);
  });
});
