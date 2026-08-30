import { z } from "zod";

const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export const candidatePathSchema = z.enum([
  "experienced",
  "early-career",
  "career-change",
]);

const modelQuestionSchema = z
  .object({
    evidenceKey: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(64),
    question: boundedText(8, 240),
    essential: z.boolean(),
  })
  .strict();

const modelIntakeResponseSchema = z
  .object({
    questions: z.array(modelQuestionSchema).min(3).max(9),
  })
  .strict()
  .superRefine(({ questions }, context) => {
    const normalized = questions.map(({ question }) => question.toLowerCase().replace(/\s+/g, " "));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", message: "Questions must be unique." });
    }
    const evidenceKeys = questions.map(({ evidenceKey }) => evidenceKey);
    if (new Set(evidenceKeys).size !== evidenceKeys.length) {
      context.addIssue({ code: "custom", message: "Evidence concepts must be unique." });
    }
    if (!questions.some(({ essential }) => essential)) {
      context.addIssue({ code: "custom", message: "At least one question must be essential." });
    }
  });

export const intakeQuestionSchema = modelQuestionSchema.extend({
  id: z.string().regex(/^q[1-9]$/),
});

export const intakeQuestionsSchema = z.array(intakeQuestionSchema).min(3).max(9);

const experienceSchema = z
  .object({
    title: boundedText(2, 120),
    company: z.string().trim().max(160),
    location: z.string().trim().max(120),
    dateLabel: z.string().trim().max(80),
    bullets: z.array(boundedText(8, 360)).min(1).max(5),
  })
  .strict();

const projectSchema = z
  .object({
    name: boundedText(2, 160),
    description: boundedText(8, 800),
    technologies: z.array(boundedText(2, 80)).max(12),
    url: z.string().trim().max(300),
  })
  .strict();

const educationSchema = z
  .object({
    degree: boundedText(2, 160),
    institution: boundedText(2, 160),
    dateLabel: z.string().trim().max(80),
    details: z.string().trim().max(240),
  })
  .strict();

const certificationSchema = z
  .object({
    name: boundedText(2, 160),
    issuer: z.string().trim().max(160),
    dateLabel: z.string().trim().max(80),
  })
  .strict();

const quickResumeModelDraftObjectSchema = z
  .object({
    targetTitle: boundedText(2, 120),
    honestStretchNote: z.string().trim().max(500),
    summary: boundedText(20, 1_200),
    coreSkills: z.array(boundedText(2, 80)).min(3).max(18),
    experience: z.array(experienceSchema).max(6),
    projects: z.array(projectSchema).max(6),
    education: z.array(educationSchema).max(6),
    certifications: z.array(certificationSchema).max(10),
    placeholdersForUser: z.array(boundedText(2, 160)).max(12),
  })
  .strict();

function requireCandidateEvidence(
  value: { experience: unknown[]; projects: unknown[] },
  context: z.RefinementCtx
): void {
  if (value.experience.length === 0 && value.projects.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A Quick Resume needs at least one experience or project entry.",
    });
  }
}

export const quickResumeModelDraftSchema = quickResumeModelDraftObjectSchema
  .superRefine(requireCandidateEvidence);

export const quickResumeContactSchema = z
  .object({
    name: boundedText(2, 100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().max(40).default(""),
    linkedin: z.string().trim().max(200).default(""),
    location: z.string().trim().max(120).default(""),
  })
  .strict();

export const quickResumeDraftSchema = quickResumeModelDraftObjectSchema
  .extend({ personalInfo: quickResumeContactSchema })
  .superRefine(requireCandidateEvidence);

export type IntakeQuestion = z.infer<typeof intakeQuestionSchema>;
export type CandidatePath = z.infer<typeof candidatePathSchema>;
export type QuickResumeExperience = z.infer<typeof experienceSchema>;
export type QuickResumeProject = z.infer<typeof projectSchema>;
export type QuickResumeModelDraft = z.infer<typeof quickResumeModelDraftSchema>;
export type QuickResumeContact = z.infer<typeof quickResumeContactSchema>;
export type QuickResumeDraft = z.infer<typeof quickResumeDraftSchema>;

export function parseIntakeResponse(value: unknown): IntakeQuestion[] {
  const parsed = modelIntakeResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Quick Resume intake response.");
  }

  return parsed.data.questions.map((question, index) => ({
    id: `q${index + 1}`,
    ...question,
  }));
}

export function parseModelDraft(value: unknown): QuickResumeModelDraft {
  const parsed = quickResumeModelDraftSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Quick Resume draft response.");
  }
  return parsed.data;
}
