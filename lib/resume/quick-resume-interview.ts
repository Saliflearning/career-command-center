import type { IntakeQuestion } from "./quick-resume-contract";

export const QUESTION_BATCH_SIZE = 3;

export type EvidenceChoice = "yes" | "no" | "unsure";

export interface EvidenceResponse {
  choice: EvidenceChoice | null;
  details: string;
}

export interface SubmittedEvidenceAnswer {
  questionId: string;
  answer: string;
}

export function getInterviewBatch(
  questions: IntakeQuestion[],
  batchIndex: number
): IntakeQuestion[] {
  const safeIndex = Math.max(0, Math.floor(batchIndex));
  const start = safeIndex * QUESTION_BATCH_SIZE;
  return questions.slice(start, start + QUESTION_BATCH_SIZE);
}

export function getInterviewBatchCount(questions: IntakeQuestion[]): number {
  return Math.max(1, Math.ceil(questions.length / QUESTION_BATCH_SIZE));
}

export function isEvidenceResponseComplete(response?: EvidenceResponse): boolean {
  if (!response?.choice) return false;
  if (response.choice === "yes") return response.details.trim().length >= 2;
  return true;
}

export function formatEvidenceResponse(response: EvidenceResponse): string {
  if (response.choice === "yes") {
    return `Yes. Candidate evidence: ${response.details.trim()}`;
  }
  if (response.choice === "no") {
    return "No. The candidate reports no evidence for this requirement. Do not include it as a candidate skill or claim.";
  }
  return "Not sure. The candidate did not provide usable evidence for this requirement. Do not include it as a candidate skill or claim.";
}

export function buildSubmittedEvidenceAnswers(
  questions: IntakeQuestion[],
  responses: Record<string, EvidenceResponse>
): SubmittedEvidenceAnswer[] {
  return questions.flatMap(({ id }) => {
    const response = responses[id];
    if (!response || !isEvidenceResponseComplete(response)) return [];
    return [{ questionId: id, answer: formatEvidenceResponse(response) }];
  });
}
