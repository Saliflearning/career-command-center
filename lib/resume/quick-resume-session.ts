import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { intakeQuestionsSchema, type IntakeQuestion } from "./quick-resume-contract";

const SESSION_VERSION = 1 as const;

const sessionSchema = z
  .object({
    version: z.literal(SESSION_VERSION),
    userId: z.string().min(1).max(200),
    jobDescriptionHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.number().int().positive(),
    questions: intakeQuestionsSchema,
  })
  .strict();

const submittedAnswerSchema = z
  .object({
    questionId: z.string().regex(/^q[1-9]$/),
    answer: z.string().trim().min(1).max(2_000),
  })
  .strict();

const submittedAnswersSchema = z
  .array(submittedAnswerSchema)
  .min(1)
  .max(9)
  .superRefine((answers, context) => {
    const ids = answers.map(({ questionId }) => questionId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Answer IDs must be unique." });
    }
  });

export interface QuickResumeSession {
  version: typeof SESSION_VERSION;
  userId: string;
  jobDescriptionHash: string;
  expiresAt: number;
  questions: IntakeQuestion[];
}

export interface VerifiedQuickResumeAnswer {
  questionId: string;
  question: string;
  answer: string;
}

function hashJobDescription(jobDescription: string): string {
  return createHash("sha256").update(jobDescription.trim(), "utf8").digest("hex");
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload, "utf8").digest();
}

function invalidSession(): never {
  throw new Error("Invalid or expired Quick Resume session.");
}

export function createQuickResumeSession(
  session: QuickResumeSession,
  jobDescription: string,
  secret: string
): string {
  if (secret.length < 16) invalidSession();
  const validated = sessionSchema.parse({
    ...session,
    jobDescriptionHash: hashJobDescription(jobDescription),
  });
  const payload = Buffer.from(JSON.stringify(validated), "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyQuickResumeSession(
  token: string,
  binding: {
    userId: string;
    jobDescription: string;
    secret: string;
    now?: number;
  }
): QuickResumeSession {
  try {
    if (binding.secret.length < 16) invalidSession();
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) invalidSession();

    const expected = signature(parts[0], binding.secret);
    const provided = Buffer.from(parts[1], "base64url");
    const canonicalSignature = provided.toString("base64url");
    if (
      canonicalSignature !== parts[1] ||
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      invalidSession();
    }

    const parsed = sessionSchema.parse(
      JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))
    );
    const now = binding.now ?? Date.now();
    if (
      parsed.userId !== binding.userId ||
      parsed.jobDescriptionHash !== hashJobDescription(binding.jobDescription) ||
      parsed.expiresAt <= now
    ) {
      invalidSession();
    }
    return parsed;
  } catch {
    return invalidSession();
  }
}

export function validateQuickResumeAnswers(
  questions: IntakeQuestion[],
  value: unknown
): VerifiedQuickResumeAnswer[] {
  const parsed = submittedAnswersSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Quick Resume answers.");
  }

  const byId = new Map(parsed.data.map((answer) => [answer.questionId, answer.answer]));
  const knownIds = new Set(questions.map(({ id }) => id));
  if (parsed.data.some(({ questionId }) => !knownIds.has(questionId))) {
    throw new Error("Invalid Quick Resume answers.");
  }

  const missingEssentials = questions.filter(({ id, essential }) => essential && !byId.has(id));
  if (missingEssentials.length > 0) {
    throw new Error("Answer every required question before generating.");
  }

  return questions.flatMap(({ id, question }) => {
    const answer = byId.get(id);
    return answer ? [{ questionId: id, question, answer }] : [];
  });
}

export function formatQuickResumeAnswers(answers: VerifiedQuickResumeAnswer[]): string {
  return answers.map(({ question, answer }) => `- ${question}\n  ${answer}`).join("\n");
}
