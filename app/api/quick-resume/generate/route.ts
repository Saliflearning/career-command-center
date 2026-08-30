/**
 * POST /api/quick-resume/generate
 *
 * Step 2 of the no-resume flow: given the job description and the user's plain
 * answers, generate a JD-aligned resume and run the deterministic release
 * checks. Grounding failures and unresolved facts are held without returning
 * draft content; only a release-ready draft reaches the UI.
 * Stateless — nothing is persisted here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import {
  generateQuickResume,
  sanitizeDraft,
  verifyQuickResumeGrounding,
} from "@/lib/resume/quick-resume";
import { quickResumeContactSchema } from "@/lib/resume/quick-resume-contract";
import {
  formatQuickResumeAnswers,
  validateQuickResumeAnswers,
  verifyQuickResumeSession,
} from "@/lib/resume/quick-resume-session";
import { hit, clientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";
import {
  QUICK_RESUME_ARTIFACT_SECTION,
  buildQuickResumeArtifact,
  quickResumeStrategyMarker,
} from "@/lib/resume/quick-resume-artifact";
import { z } from "zod";

const MIN_JD_CHARS = 40;
const MAX_JD_CHARS = 20_000;
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const requestSchema = z
  .object({
    jobDescription: z.string().trim().min(MIN_JD_CHARS).max(MAX_JD_CHARS),
    intakeToken: z.string().min(40).max(20_000),
    answers: z.unknown(),
    contact: quickResumeContactSchema,
  })
  .strict();

function signingSecret(): string | null {
  const secret = authOptions.secret ?? process.env.NEXTAUTH_SECRET;
  return typeof secret === "string" && secret.length >= 16 ? secret : null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = hit(`qr-generate:${session.user.id}:${clientIp(request.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const parsedRequest = requestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Request data is incomplete or invalid." },
      { status: 400 }
    );
  }

  const { jobDescription, intakeToken, answers, contact } = parsedRequest.data;
  const secret = signingSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Quick Resume is not configured right now." },
      { status: 503 }
    );
  }

  let verifiedAnswers: ReturnType<typeof validateQuickResumeAnswers>;
  try {
    const intakeSession = verifyQuickResumeSession(intakeToken, {
      userId: session.user.id,
      jobDescription,
      secret,
    });
    verifiedAnswers = validateQuickResumeAnswers(intakeSession.questions, answers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/answer every required question/i.test(message)) {
      return NextResponse.json(
        {
          error: "Answer every required question before generating.",
          code: "ESSENTIAL_ANSWERS_REQUIRED",
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: "Your question session expired or changed. Please get the questions again." },
      { status: 400 }
    );
  }

  const answerText = formatQuickResumeAnswers(verifiedAnswers);
  const groundingEvidence = [
    answerText,
    contact.name,
    contact.email,
    contact.phone,
    contact.linkedin,
    contact.location,
  ].filter(Boolean).join("\n");

  try {
    const generatedDraft = await generateQuickResume(jobDescription, answerText);
    const grounding = verifyQuickResumeGrounding(generatedDraft, groundingEvidence);
    if (!grounding.grounded || grounding.placeholderCount > 0) {
      const error = !grounding.grounded
        ? "The draft included a claim we could not trace to your answers. Add or correct the source facts, then try again."
        : "The draft still needs information from you before it can be released.";
      return NextResponse.json(
        { error, status: "needs_input", grounding },
        { status: 422 }
      );
    }

    // Verify the model's exact output. Formatting cleanup happens only after
    // the deterministic claim boundary has accepted it.
    const releasedDraft = sanitizeDraft(generatedDraft);
    const artifact = buildQuickResumeArtifact(releasedDraft);
    let savedResume: { id: string };
    try {
      const now = new Date();
      savedResume = await db.resume.create({
        data: {
          userId: session.user.id,
          targetRole: releasedDraft.targetTitle,
          targetCompany: null,
          jdText: jobDescription,
          jdKeywords: [],
          roleType: null,
          state: "USER_EDITING",
          strategyJson: quickResumeStrategyMarker(),
          summaryText: releasedDraft.summary,
          pipelineStartedAt: now,
          pipelineFinishedAt: now,
          sections: {
            create: [
              {
                name: "resume_header",
                visible: false,
                sortOrder: -100,
                content: JSON.stringify({ ...contact, website: null, github: null }),
              },
              {
                name: QUICK_RESUME_ARTIFACT_SECTION,
                visible: false,
                sortOrder: -90,
                content: JSON.stringify(artifact),
              },
            ],
          },
        },
        select: { id: true },
      });
    } catch {
      return NextResponse.json(
        { error: "Your resume was generated but could not be saved safely. Please try again." },
        { status: 503 }
      );
    }

    const draft = { ...releasedDraft, personalInfo: contact };
    return NextResponse.json({ resumeId: savedResume.id, draft, grounding }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "We couldn't generate your resume right now. Please try again." },
      { status: 502 }
    );
  }
}
