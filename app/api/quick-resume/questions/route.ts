/**
 * POST /api/quick-resume/questions
 *
 * Step 1 of the no-resume flow: a first-time user pastes a job description and
 * gets back the plain-language questions we need answered to write a truthful,
 * JD-aligned resume. Stateless — nothing is persisted here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { generateIntakeQuestions } from "@/lib/resume/quick-resume";
import { candidatePathSchema } from "@/lib/resume/quick-resume-contract";
import { createQuickResumeSession } from "@/lib/resume/quick-resume-session";
import { hit, clientIp } from "@/lib/rate-limit";

const MIN_JD_CHARS = 40;
const MAX_JD_CHARS = 20_000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;

function signingSecret(): string | null {
  const secret = authOptions.secret ?? process.env.NEXTAUTH_SECRET;
  return typeof secret === "string" && secret.length >= 16 ? secret : null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = hit(`qr-questions:${session.user.id}:${clientIp(request.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
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

  const jd = (body as Record<string, unknown>).jobDescription;
  const candidatePathResult = candidatePathSchema.safeParse(
    (body as Record<string, unknown>).candidatePath
  );
  if (typeof jd !== "string" || jd.trim().length < MIN_JD_CHARS) {
    return NextResponse.json(
      { error: "Paste the full job description so we can ask the right questions." },
      { status: 400 }
    );
  }
  if (jd.length > MAX_JD_CHARS) {
    return NextResponse.json({ error: "That job description is too long." }, { status: 400 });
  }
  if (!candidatePathResult.success) {
    return NextResponse.json(
      { error: "Choose the kind of experience you want us to use." },
      { status: 400 }
    );
  }

  const secret = signingSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Quick Resume is not configured right now." },
      { status: 503 }
    );
  }

  try {
    const questions = await generateIntakeQuestions(jd, candidatePathResult.data);
    if (questions.length === 0) {
      // The model returned nothing usable; do not fail the user with a 500.
      return NextResponse.json(
        { error: "We couldn't read that job description. Try pasting the full posting." },
        { status: 422 }
      );
    }
    const intakeToken = createQuickResumeSession(
      {
        version: 1,
        userId: session.user.id,
        jobDescriptionHash: "",
        expiresAt: Date.now() + SESSION_TTL_MS,
        questions,
      },
      jd,
      secret
    );
    return NextResponse.json({ questions, intakeToken }, { status: 200 });
  } catch {
    // Never leak provider diagnostics.
    return NextResponse.json(
      { error: "We couldn't prepare your questions right now. Please try again." },
      { status: 502 }
    );
  }
}
