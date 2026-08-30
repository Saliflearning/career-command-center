// ---------------------------------------------------------------------------
// Pipeline Orchestrator  — Golden Path Sprint
//
// Drives the complete 14-step resume-generation pipeline.
// Every specialist agent is now wired with full data flow.
//
// Architecture rules:
//  - Never calls the AI router directly (only specialist agents do)
//  - Never calls storage directly (lib/storage/adapter.ts only)
//  - All inter-agent data uses canonical types from lib/types
//  - `currentState` is updated after EVERY transition (P0 stale-state fix)
//
// Observability (Golden Path directive):
//  - Every step is timed and logged as a structured JSON event
//  - Retry attempts, verifier failures, and repair loops are all surfaced
//  - Pipeline timing is persisted to DB (pipelineStartedAt/FinishedAt)
//
// Retry loop (Golden Path directive §3):
//  - Verifier runs after each bullet-writer call (up to 3 inner retries)
//  - If verifier.maxRetriesReached, orchestrator re-calls bullet-writer
//    with retryInstructions (up to MAX_OUTER_RETRIES = 2 outer attempts)
//  - This gives: 2 outer × 3 inner = up to 6 LLM calls per work history entry
//  - After all retries exhausted: surface to user, continue pipeline
// ---------------------------------------------------------------------------

import { db } from "@/lib/db/client";
import { transition, ResumeState } from "@/lib/state/machine";
import { AIRouterError } from "@/lib/ai/router";
import { fetchCareerMemoryFromDB } from "@/lib/db/mappers/career-memory.mapper";
import {
  fetchResumeSourceProfile,
  refreshResumeSourceProfile,
} from "@/lib/db/resume-source-profile";
import type {
  CareerMemory,
  JDAnalysis,
  ResumeStrategy,
  BulletWriterOutput,
} from "@/lib/types";

import { runIntake }         from "@/agents/intake";
import { runNormalizer }     from "@/agents/normalizer";
import type { ConfirmedEvidence } from "@/lib/resume/evidence-draft";
import { extractMetricTokens } from "@/lib/resume/evidence-retention";
import { mergeGroundedJdKeywords } from "@/lib/resume/grounded-jd-keywords";
import { runJDAnalyst }      from "@/agents/jd-analyst";
import { runStrategy }       from "@/agents/strategy";
import { runSummaryWriter }  from "@/agents/summary-writer";
import { runBulletWriter, type BulletWriterRetryContext } from "@/agents/bullet-writer";
import { loadTeachingContext } from "@/lib/resume/teaching-examples";
import { runVerifier, type VerifierContext } from "@/agents/verifier";
import { runCompression }    from "@/agents/compression";
import { runDiagnostic }     from "@/agents/diagnostic";
import { generateLatexSource } from "@/lib/latex/generator";
import { runResumeVisualQualityGate } from "@/lib/resume/visual-quality-gate";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum outer retries per work history entry (verifier → bullet-writer loop) */
const MAX_OUTER_RETRIES = 2;

// ---------------------------------------------------------------------------
// Observability helpers
// ---------------------------------------------------------------------------

interface StepRecord {
  step:       string;
  startMs:    number;
  durationMs: number;
  tokensUsed?: number;
  retries?:   number;
  outcome:    "ok" | "warn" | "skipped";
}

function log(
  event: string,
  resumeId: string,
  extra?: Record<string, unknown>
): void {
  console.log(JSON.stringify({
    event, resumeId, timestamp: new Date().toISOString(), ...extra,
  }));
}

function startStep(name: string): { end: (outcome?: StepRecord["outcome"], extra?: Record<string, unknown>) => StepRecord } {
  const startMs = Date.now();
  return {
    end(outcome: StepRecord["outcome"] = "ok", extra = {}): StepRecord {
      const durationMs = Date.now() - startMs;
      return { step: name, startMs, durationMs, outcome, ...extra };
    },
  };
}


// ---------------------------------------------------------------------------
// Crash-recovery helper — rebuild CareerMemory from DB
// Delegates to the canonical mapper so the mapping logic lives in one place.
// ---------------------------------------------------------------------------

async function _fetchCareerMemoryFromDB(userId: string): Promise<CareerMemory | null> {
  return fetchCareerMemoryFromDB(userId);
}

async function _fetchCareerMemoryForResume(
  resumeId: string,
  userId: string
): Promise<CareerMemory | null> {
  return (await fetchResumeSourceProfile(resumeId)) ?? _fetchCareerMemoryFromDB(userId);
}

// ---------------------------------------------------------------------------
// Verifier context builder — P0 fix: userMetrics from SOURCE data, not output
// ---------------------------------------------------------------------------

async function _buildVerifierContext(
  workHistoryId: string,
  generatedBulletStrings: string[],
  careerMemory: CareerMemory | null,
  jdText: string
): Promise<VerifierContext> {
  const wh = await db.workHistory.findUnique({
    where:   { id: workHistoryId },
    // Include SOURCE bullets to extract user-provided metrics (Rule 4 fix)
    include: { bullets: { where: { contentType: { not: "GENERATED" } } } },
  });

  const company = wh?.company ?? "Unknown Company";
  const title   = wh?.title   ?? "Unknown Title";
  const start   = wh?.startDate ? new Date(wh.startDate).toISOString().slice(0, 7) : "unknown";
  const end     = wh?.endDate   ? new Date(wh.endDate).toISOString().slice(0, 7)   : "present";
  const dates   = `${start} – ${end}`;

  // P0 FIX: userMetrics come from VERIFIED source bullets, not from generated output.
  // This is the ground truth the verifier uses to catch invented numbers (Rule 4).
  const sourceBullets = (wh?.bullets ?? []) as Array<{ content: string; metrics: string[] }>;
  const userMetrics = Array.from(new Set(sourceBullets.flatMap((bullet) => [
    ...(bullet.metrics as string[]),
    ...extractMetricTokens(bullet.content),
  ])));
  const sourceEvidence = sourceBullets.map((bullet) => bullet.content);

  const userSkills = careerMemory?.skills.map((s) => s.name) ?? [];
  const qualifiers = (careerMemory?.skills ?? [])
    .filter((s) => s.proficiencyLabel !== null)
    .map((s) => ({ skill: s.name, level: s.proficiencyLabel! }));

  const hasConferredDegree = careerMemory?.education.some((e) => !e.inProgress) ?? false;
  const degreeStatus: "conferred" | "expected" | undefined =
    careerMemory?.education.length
      ? (hasConferredDegree ? "conferred" : "expected")
      : undefined;

  return {
    jobTitle:       title,
    companyName:    company,
    dates,
    userSkills,
    degreeStatus,
    userMetrics,    // ← source data, not generated output
    sourceEvidence,
    jobDescription: jdText,
    bullets:        generatedBulletStrings,
    qualifiers,
  };
}

// ---------------------------------------------------------------------------
// Resume source helpers
// ---------------------------------------------------------------------------

/** MIME type derived from the stored file extension. */
function _mimeFromPath(path: string): string {
  return path.toLowerCase().endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
}

function parseResumeHeaderSection(content: string | null | undefined) {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      linkedin: typeof parsed.linkedin === "string" ? parsed.linkedin : null,
      location: typeof parsed.location === "string" ? parsed.location : null,
    };
  } catch {
    return null;
  }
}

async function _getFileBuffer(pdfUrl: string | null): Promise<{ fileBuffer: Buffer; mimeType: string }> {
  if (!pdfUrl) throw new Error("Orchestrator: resume.pdfUrl is null — cannot fetch file");

  // The DB stores a SIGNED URL (which expires after 1 hour), not a bucket
  // path. Derive the bucket-relative path from the URL so storage.download
  // works regardless of URL age:
  //   .../object/sign/resume-files/<userId>/<resumeId>/original.pdf?token=...
  const pathMatch = pdfUrl.match(/\/resume-files\/([^?]+)/);
  if (pathMatch) {
    const storagePath = decodeURIComponent(pathMatch[1]);
    const { storage } = await import("@/lib/storage/adapter");
    const fileBuffer = await storage.download(storagePath);
    return { fileBuffer, mimeType: _mimeFromPath(storagePath) };
  }

  // Fallback for any other URL shape: direct fetch (works while signed URL is valid)
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error(`Orchestrator: failed to fetch file — HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return { fileBuffer: Buffer.from(arrayBuffer), mimeType: response.headers.get("content-type") ?? "application/pdf" };
}

async function _getPastedResumeSource(resumeId: string): Promise<string | null> {
  const source = await db.resumeSection.findFirst({
    where: { resumeId, name: "source_resume" },
    select: { content: true },
  });

  const text = source?.content?.trim() ?? "";
  return text.length > 0 ? text : null;
}

async function _getUserEvidence(resumeId: string): Promise<ConfirmedEvidence[]> {
  const section = await db.resumeSection.findFirst({
    where: { resumeId, name: "user_evidence" },
    select: { content: true },
  });
  if (!section?.content) return [];

  try {
    const evidence = JSON.parse(section.content) as Array<{
      term?: string;
      category?: string;
      source?: string;
      details?: string;
    }>;
    return evidence
      .filter(
        (item): item is ConfirmedEvidence =>
          Boolean(item.term?.trim() && item.source?.trim() && item.details?.trim())
      )
      .map((item) => ({
        term: item.term.trim(),
        category: item.category?.trim() || "User-confirmed evidence",
        source: item.source.trim(),
        details: item.details.trim(),
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// runPipeline — public entry-point
// ---------------------------------------------------------------------------

/**
 * Orchestrate the full 14-step golden-path pipeline.
 *
 * Inputs (must be set on Resume record before calling):
 *  - pdfUrl      — uploaded file location
 *  - jdText      — the job description the user pasted
 *  - targetRole  — the role title being targeted
 *
 * P0 guarantee: `currentState` is a mutable local variable updated after
 * every successful transition. It NEVER reads the stale initial resume.state.
 *
 * Observability: every step is timed and logged. Pipeline start/finish
 * timestamps are persisted to the Resume record.
 */
export async function runPipeline(resumeId: string): Promise<void> {
  const pipelineStartMs = Date.now();
  const stepTimings: StepRecord[] = [];

  log("pipeline_start", resumeId);

  // Mark pipeline start on the Resume record
  await db.resume.update({
    where: { id: resumeId },
    data:  { pipelineStartedAt: new Date() },
  });

  // ------------------------------------------------------------------
  // Initial fetch — all fields needed across the full pipeline
  // ------------------------------------------------------------------
  const resume = await db.resume.findUnique({
    where:  { id: resumeId },
    select: {
      id:            true,
      userId:        true,
      state:         true,
      pdfUrl:        true,
      latexSource:   true,
      pageCount:     true,
      jdText:        true,
      jdKeywords:    true,
      targetRole:    true,
      targetCompany: true,
      jdAnalysisJson: true,
      strategyJson:   true,
    },
  });

  if (!resume) throw new Error(`Orchestrator: resume not found — ${resumeId}`);

  // P0 Fix: mutable state tracker — NEVER use resume.state for step guards after this line
  let currentState = resume.state as ResumeState;

  // ── Retry after failure: reset FAILED → UPLOADED so the step guards fire ──
  // FAILED state is intentionally allowed by the jd route for re-triggering.
  // Without this reset, currentState === FAILED matches no step guard and the
  // pipeline exits immediately without doing anything, staying FAILED forever.
  if (currentState === ResumeState.FAILED) {
    await transition(resumeId, ResumeState.UPLOADED);
    currentState = ResumeState.UPLOADED;
    log("pipeline_reset", resumeId, { reason: "retry_after_failure" });
  }

  // In-memory pipeline data — accumulated across steps.
  // On crash recovery, each step reads from DB if the in-memory value is null.
  let careerMemory: CareerMemory | null = null;
  let jdAnalysis:   JDAnalysis   | null = null;
  let strategy:     ResumeStrategy | null = null;
  let summaryText   = "";

  // Restore cached outputs if pipeline is resuming after a crash
  if (resume.jdAnalysisJson) {
    jdAnalysis = resume.jdAnalysisJson as unknown as JDAnalysis;
  }
  if (resume.strategyJson) {
    strategy = resume.strategyJson as unknown as ResumeStrategy;
  }

  // ── SPEED OPTIMIZATION: Start JD analysis immediately (parallel with intake + normalizer) ──
  // jdAnalysis only needs resume.jdText which is already fetched. Fire the LLM call now
  // so it runs concurrently with intake (file parse) and normalizer (~20s combined).
  // We await the result when we actually need it in Step 4a (JD_ANALYZED state).
  // Skip if already cached from a prior run or if there is no jdText.
  let _jdAnalysisEarlyPromise: Promise<JDAnalysis> | null = null;
  if (resume.jdText && !jdAnalysis && currentState === ResumeState.UPLOADED) {
    log("pipeline_jd_early_start", resumeId, { note: "parallel with intake+normalizer" });
    _jdAnalysisEarlyPromise = runJDAnalyst(
      resume.jdText,
      resumeId,
      resume.targetRole,
      resume.targetCompany ?? null
    ).catch((err) => {
      // Non-fatal here — if it fails the VERIFIED step will retry synchronously
      log("pipeline_jd_early_error", resumeId, { error: String(err) });
      return null as unknown as JDAnalysis;
    });
  }

  try {
    // ================================================================
    // Step 1: INTAKE — parse uploaded file to raw text
    //         UPLOADED → PARSED
    // ================================================================
    if (currentState === ResumeState.UPLOADED) {
      const timer = startStep("intake");
      log("pipeline_step", resumeId, { step: "intake" });

      const pastedSource = await _getPastedResumeSource(resumeId);
      let rawText: string;

      if (pastedSource) {
        rawText = pastedSource;
        log("pipeline_source_resolved", resumeId, {
          source: "pasted_resume",
          chars: rawText.length,
        });
      } else {
        const { fileBuffer, mimeType } = await _getFileBuffer(resume.pdfUrl);
        rawText = await runIntake(resumeId, fileBuffer, mimeType);
        log("pipeline_source_resolved", resumeId, {
          source: "uploaded_file",
          mimeType,
          chars: rawText.length,
        });
      }
      await db.resume.update({
        where: { id: resumeId },
        data:  { latexSource: rawText },
      });

      await transition(resumeId, ResumeState.PARSED);
      currentState = ResumeState.PARSED;
      stepTimings.push(timer.end("ok"));
      log("pipeline_transition", resumeId, { to: ResumeState.PARSED, durationMs: stepTimings.at(-1)!.durationMs });
    }

    // ================================================================
    // Step 2: NORMALIZER — structure raw text into CareerMemory
    //         PARSED → NORMALIZED
    // ================================================================
    if (currentState === ResumeState.PARSED) {
      const timer = startStep("normalizer");
      log("pipeline_step", resumeId, { step: "normalizer" });

      const updated = await db.resume.findUnique({
        where: { id: resumeId }, select: { latexSource: true },
      });
      const rawText = updated?.latexSource ?? "";

      try {
        const userEvidence = await _getUserEvidence(resumeId);
        careerMemory = await runNormalizer(
          rawText,
          resume.userId,
          resumeId,
          userEvidence
        );
      } catch (normErr) {
        // Surface a human-readable error instead of the raw AIRouterError message.
        if (normErr instanceof AIRouterError) {
          throw new Error(
            "The AI service is unavailable right now. " +
            "Please ensure your ANTHROPIC_API_KEY is set in .env, then restart the server and try again."
          );
        }
        throw normErr;
      }

      if (careerMemory.jobs.length === 0) {
        throw new Error(
          "The uploaded file didn't contain recognisable work experience. " +
          "Please check the file and try again."
        );
      }

      await transition(resumeId, ResumeState.NORMALIZED);
      currentState = ResumeState.NORMALIZED;
      stepTimings.push(timer.end("ok", { jobsFound: careerMemory.jobs.length }));
      log("pipeline_transition", resumeId, { to: ResumeState.NORMALIZED, durationMs: stepTimings.at(-1)!.durationMs });
    }

    // ================================================================
    // Step 3: PRE-FLIGHT CHECK — validate pipeline can continue
    //         NORMALIZED → VERIFIED
    // ================================================================
    if (currentState === ResumeState.NORMALIZED) {
      const timer = startStep("preflight");
      log("pipeline_step", resumeId, { step: "preflight" });

      if (!resume.jdText) {
        throw new Error(
          "A job description is required before we can tailor your resume. " +
          "Please paste the job description and try again."
        );
      }

      await transition(resumeId, ResumeState.VERIFIED);
      currentState = ResumeState.VERIFIED;
      stepTimings.push(timer.end("ok"));
      log("pipeline_transition", resumeId, { to: ResumeState.VERIFIED });
    }

    // ================================================================
    // Step 4a: JD ANALYST — extract requirements from job description
    //          VERIFIED → JD_ANALYZED
    // ================================================================
    if (currentState === ResumeState.VERIFIED) {
      // Skip LLM call if we restored from cache
      if (jdAnalysis) {
        log("pipeline_step", resumeId, { step: "jd_analyst", cached: true });
        stepTimings.push({ step: "jd_analyst", startMs: Date.now(), durationMs: 0, outcome: "ok" });
      } else {
        const timer = startStep("jd_analyst");

        // If the early promise was started in parallel with intake+normalizer, await it now.
        // Only remaining wait time is any time not already covered by the parallel steps.
        if (_jdAnalysisEarlyPromise) {
          log("pipeline_step", resumeId, { step: "jd_analyst", mode: "await_parallel" });
          const earlyResult = await _jdAnalysisEarlyPromise;
          if (earlyResult && earlyResult.topKeywords) {
            jdAnalysis = earlyResult;
          }
        }

        // Fallback: if early promise failed or was not started (e.g. crash recovery)
        if (!jdAnalysis) {
          log("pipeline_step", resumeId, { step: "jd_analyst", mode: "sequential_fallback" });
          jdAnalysis = await runJDAnalyst(
            resume.jdText!,
            resumeId,
            resume.targetRole,
            resume.targetCompany ?? null
          );
        }

        stepTimings.push(timer.end("ok", { keywordsFound: jdAnalysis.topKeywords.length }));
        log("pipeline_step_done", resumeId, { step: "jd_analyst", durationMs: stepTimings.at(-1)!.durationMs });
      }

      // The bullet writer reads targeting context from Resume, so the analyzed
      // keyword set must be persisted before generation begins. Previously only
      // jdAnalysisJson was saved, leaving jdKeywords empty for uploaded resumes.
      if (!careerMemory) careerMemory = await _fetchCareerMemoryForResume(resumeId, resume.userId);
      if (!careerMemory) throw new Error("Pipeline fault: careerMemory is null at JD keyword handoff");
      const modelJdKeywords = Array.from(new Set(
        jdAnalysis.topKeywords.map((keyword) => keyword.term.trim()).filter(Boolean)
      ));
      const analyzedJdKeywords = mergeGroundedJdKeywords(
        modelJdKeywords,
        careerMemory,
        resume.jdText ?? ""
      );

      const existingTerms = new Set(jdAnalysis.topKeywords.map((keyword) => keyword.term.toLowerCase()));
      const groundedTerms = analyzedJdKeywords
        .filter((term) => !existingTerms.has(term.toLowerCase()))
        .map((term) => ({
          term,
          frequency: 1,
          required: false,
          category: "other" as const,
        }));
      if (groundedTerms.length > 0) {
        jdAnalysis = {
          ...jdAnalysis,
          topKeywords: [...jdAnalysis.topKeywords, ...groundedTerms].slice(0, 24),
        };
      }
      await db.resume.update({
        where: { id: resumeId },
        data: {
          jdAnalysisJson: jdAnalysis as object,
          jdKeywords: analyzedJdKeywords,
        },
      });
      resume.jdKeywords = analyzedJdKeywords;

      await transition(resumeId, ResumeState.JD_ANALYZED);
      currentState = ResumeState.JD_ANALYZED;
    }

    // ================================================================
    // Step 4b: STRATEGY — generate section order + keyword targeting
    //          JD_ANALYZED → STRATEGY_READY
    // ================================================================
    if (currentState === ResumeState.JD_ANALYZED) {
      if (!jdAnalysis) throw new Error("Pipeline fault: jdAnalysis is null at STRATEGY step");

      if (!careerMemory) careerMemory = await _fetchCareerMemoryForResume(resumeId, resume.userId);
      if (!careerMemory) throw new Error("Pipeline fault: careerMemory is null at STRATEGY step");

      if (strategy) {
        log("pipeline_step", resumeId, { step: "strategy", cached: true });
        stepTimings.push({ step: "strategy", startMs: Date.now(), durationMs: 0, outcome: "ok" });
      } else {
        const timer = startStep("strategy");
        log("pipeline_step", resumeId, { step: "strategy" });

        strategy = await runStrategy(resumeId, jdAnalysis, careerMemory);

        // Persist so crash recovery skips this LLM call
        await db.resume.update({
          where: { id: resumeId },
          data:  { strategyJson: strategy as object },
        });

        stepTimings.push(timer.end("ok", { matchScore: strategy.matchScore, roleType: strategy.roleType }));
        log("pipeline_step_done", resumeId, { step: "strategy", durationMs: stepTimings.at(-1)!.durationMs });
      }

      await transition(resumeId, ResumeState.STRATEGY_READY);
      currentState = ResumeState.STRATEGY_READY;
    }

    // ================================================================
    // Step 5: SUMMARY WRITER — generate career summary paragraph
    //         (within STRATEGY_READY, before bullet generation)
    // ================================================================
    if (currentState === ResumeState.STRATEGY_READY) {
      if (!strategy)  throw new Error("Pipeline fault: strategy is null at SUMMARY step");
      if (!jdAnalysis) throw new Error("Pipeline fault: jdAnalysis is null at SUMMARY step");
      if (!careerMemory) careerMemory = await _fetchCareerMemoryForResume(resumeId, resume.userId);
      if (!careerMemory) throw new Error("Pipeline fault: careerMemory is null at SUMMARY step");

      const timer = startStep("summary_writer");
      log("pipeline_step", resumeId, { step: "summary_writer" });

      const teachingContext = (await loadTeachingContext(
        resume.userId,
        resume.targetRole,
        resume.jdKeywords,
        resume.id
      )) ?? "";
      const summaryOutput = await runSummaryWriter(
        resumeId,
        careerMemory,
        jdAnalysis,
        strategy,
        teachingContext
      );
      summaryText = summaryOutput.summaryText;

      // Persist summary to Resume record and ResumeSection table
      await db.resume.update({
        where: { id: resumeId },
        data:  { summaryText },
      });

      // Upsert the summary section record
      const existing = await db.resumeSection.findFirst({
        where: { resumeId, name: "summary" },
      });
      if (existing) {
        await db.resumeSection.update({ where: { id: existing.id }, data: { content: summaryText } });
      } else {
        await db.resumeSection.create({
          data: { resumeId, name: "summary", content: summaryText, sortOrder: 0 },
        });
      }

      stepTimings.push(timer.end("ok", { wordCount: summaryOutput.wordCount }));
      log("pipeline_step_done", resumeId, { step: "summary_writer", durationMs: stepTimings.at(-1)!.durationMs });

      // Transition to GENERATING
      await transition(resumeId, ResumeState.GENERATING);
      currentState = ResumeState.GENERATING;
      log("pipeline_transition", resumeId, { to: ResumeState.GENERATING });
    }

    // ================================================================
    // Step 6: BULLET WRITER + VERIFIER — with full outer retry loop
    //         GENERATING
    // ================================================================
    if (currentState === ResumeState.GENERATING) {
      if (!strategy)     throw new Error("Pipeline fault: strategy is null at GENERATING step");
      if (!careerMemory) careerMemory = await _fetchCareerMemoryForResume(resumeId, resume.userId);
      if (!careerMemory) throw new Error("Pipeline fault: careerMemory is null at GENERATING step");


      const jdText = resume.jdText ?? "";
      const teachingContext = (await loadTeachingContext(
        resume.userId,
        resume.targetRole,
        resume.jdKeywords,
        resume.id
      )) ?? "";

      // workHistoryInScope entries drive both parallelism and per-entry bullet caps

      const generationTimer = startStep("bullet_generation");
      let totalBulletsGenerated = 0;
      let totalVerifierRetries  = 0;
      const verifierWarnings: string[] = [];

      // ── Per-entry bullet writer + verifier loop (extracted for parallelism) ──
      type WHResult = {
        bulletsGenerated: number;
        verifierRetries: number;
        passed: boolean;
        steps: StepRecord[];
        warnings: string[];
      };
      const _processWorkHistoryEntry = async (workHistoryId: string, maxBullets?: number): Promise<WHResult> => {
        const entrySteps: StepRecord[] = [];
        const entryWarnings: string[] = [];
        let latestBulletOutput: BulletWriterOutput | null = null;
        let outerPassed = false;
        let linkedBulletIds: string[] = [];

        for (let outerAttempt = 0; outerAttempt < MAX_OUTER_RETRIES; outerAttempt++) {
          // Delete only the discarded bullets created by this invocation's prior
          // attempt. A broad work-history cleanup races with concurrent pipelines:
          // another invocation can link a row after the DELETE snapshot is taken,
          // causing ResumeBullet_bulletId_fkey to reject the deletion.
          if (latestBulletOutput) {
            const discardedBulletIds = latestBulletOutput.bullets.map((bullet) => bullet.id);
            if (discardedBulletIds.length > 0) {
              await db.bullet.deleteMany({
                where: {
                  id: { in: discardedBulletIds },
                  workHistoryId,
                  contentType: "GENERATED",
                  usedInResumes: { none: {} },
                },
              });
            }
          }

          // --- BULLET WRITER ---
          const bwTimer = startStep(`bullet_writer[${workHistoryId}]:attempt${outerAttempt + 1}`);

          const retryCtx: BulletWriterRetryContext | undefined =
            outerAttempt > 0 && latestBulletOutput !== null
              ? {
                  instructions: latestBulletOutput.bullets[0]?.warnings?.join("; ") ?? "Fix the flagged quality issues",
                  outerAttempt,
                }
              : undefined;

          latestBulletOutput = await runBulletWriter(
            workHistoryId,
            resumeId,
            retryCtx,
            maxBullets,
            teachingContext
          );
          const bwStep = bwTimer.end("ok");
          entrySteps.push(bwStep);

          log("pipeline_bullets_written", resumeId, {
            workHistoryId, count: latestBulletOutput.bullets.length,
            attempt: outerAttempt + 1, durationMs: bwStep.durationMs,
          });

          // --- VERIFIER ---
          const vTimer = startStep(`verifier[${workHistoryId}]:attempt${outerAttempt + 1}`);
          const bulletStrings   = latestBulletOutput.bullets.map((b) => b.content);
          const verifierContext = await _buildVerifierContext(workHistoryId, bulletStrings, careerMemory, jdText);

          const verifierResult = await runVerifier(
            verifierContext,
            workHistoryId,
            workHistoryId,
            resumeId
          );

          const failedCheckNames = Object.entries(verifierResult.checks)
            .filter(([, c]) => c.status === "failed")
            .map(([name]) => name);

          entrySteps.push(vTimer.end(verifierResult.passed ? "ok" : "warn", {
            passed:      verifierResult.passed,
            failedChecks: failedCheckNames,
            innerAttempts: verifierResult.attemptNumber,
          }));

          log("pipeline_verified", resumeId, {
            workHistoryId,
            passed:        verifierResult.passed,
            failedChecks:  failedCheckNames,
            maxRetries:    verifierResult.maxRetriesReached,
            outerAttempt:  outerAttempt + 1,
            innerAttempts: verifierResult.attemptNumber,
          });

          if (verifierResult.passed) {
            outerPassed = true;
            linkedBulletIds = latestBulletOutput.bullets.map((bullet) => bullet.id);
            break;
          }

          if (!verifierResult.maxRetriesReached) {
            outerPassed = verifierResult.passed;
            break;
          }

          // maxRetriesReached: prepare for outer retry with instructions
          if (outerAttempt < MAX_OUTER_RETRIES - 1) {
            log("pipeline_outer_retry", resumeId, {
              workHistoryId,
              outerAttempt: outerAttempt + 1,
              instructions:  verifierResult.retryInstructions,
            });

            if (latestBulletOutput) {
              latestBulletOutput.bullets.forEach(b => {
                b.warnings = [verifierResult.retryInstructions ?? "Fix quality issues"];
              });
            }
          } else {
            entryWarnings.push(
              `${workHistoryId}: ${verifierResult.userMessage ?? "Quality checks failed"}`
            );
            log("pipeline_verify_warn_final", resumeId, {
              workHistoryId,
              userMessage: verifierResult.userMessage,
            });
          }
        }

        if (!outerPassed) {
          const rejectedBulletIds = latestBulletOutput?.bullets.map((bullet) => bullet.id) ?? [];
          const referencedSourceIds = Array.from(new Set(
            latestBulletOutput?.bullets.flatMap((bullet) => bullet.sourceCareerMemoryBulletIds) ?? []
          ));

          if (rejectedBulletIds.length > 0) {
            await db.bullet.deleteMany({
              where: {
                id: { in: rejectedBulletIds },
                workHistoryId,
                contentType: "GENERATED",
                usedInResumes: { none: {} },
              },
            });
          }

          const sourceWhere = {
            workHistoryId,
            contentType: { not: "GENERATED" as const },
            ...(referencedSourceIds.length > 0 ? { id: { in: referencedSourceIds } } : {}),
          };
          let sourceBullets = await db.bullet.findMany({
            where: sourceWhere,
            select: { id: true },
          });

          // A writer may omit provenance IDs. In that case preserve the user's
          // original role evidence instead of publishing an unverified rewrite.
          if (sourceBullets.length === 0 && referencedSourceIds.length > 0) {
            sourceBullets = await db.bullet.findMany({
              where: { workHistoryId, contentType: { not: "GENERATED" } },
              select: { id: true },
            });
          }
          linkedBulletIds = sourceBullets
            .slice(0, maxBullets ?? sourceBullets.length)
            .map((bullet) => bullet.id);

          log("pipeline_verify_warn", resumeId, {
            workHistoryId,
            message: linkedBulletIds.length > 0
              ? "Rejected rewrite replaced with source-grounded bullets"
              : "Rejected rewrite omitted because no source-grounded fallback exists",
            fallbackBulletCount: linkedBulletIds.length,
          });
        }

        // Link the final accepted bullet set to this resume. The workspace
        // and content API read experience through ResumeBullet — without
        // these rows the draft renders with no work history at all.
        if (linkedBulletIds.length > 0) {
          await db.resumeBullet.createMany({
            data: linkedBulletIds.map((bulletId) => ({
              resumeId,
              bulletId,
            })),
          });
        }

        return {
          bulletsGenerated: linkedBulletIds.length,
          verifierRetries:  entrySteps.filter(s => s.step.startsWith("verifier")).reduce(
            (sum, s) => sum + (((s as StepRecord & { innerAttempts?: number }).innerAttempts ?? 1) - 1),
            0
          ),
          passed:   outerPassed,
          steps:    entrySteps,
          warnings: entryWarnings,
        };
      };

      // ── Run all work history entries in parallel ──
      // Clear links from any previous run first so a FAILED → re-trigger
      // cycle doesn't accumulate duplicate experience entries.
      await db.resumeBullet.deleteMany({ where: { resumeId } });

      const _includedEntries = strategy.workHistoryInScope.filter((w) => w.include);
      log("pipeline_parallel_start", resumeId, { entryCount: _includedEntries.length });
      // Pass position-based maxBullets cap from strategy so older/less relevant
      // roles don't over-generate (primary role: 6, secondary: 5, older: 4).
      const parallelResults = await Promise.all(
        strategy.workHistoryInScope
          .filter((w) => w.include)
          .map((w) => _processWorkHistoryEntry(w.workHistoryId, w.bulletCountTarget))
      );

      // ── Merge results ──
      for (const result of parallelResults) {
        totalBulletsGenerated += result.bulletsGenerated;
        totalVerifierRetries  += result.verifierRetries;
        stepTimings.push(...result.steps);
        verifierWarnings.push(...result.warnings);
      }

      stepTimings.push(generationTimer.end(
        verifierWarnings.length > 0 ? "warn" : "ok",
        { totalBulletsGenerated, totalVerifierRetries, verifierWarnings }
      ));

      // ================================================================
      // Step 7: LATEX GENERATOR — produce the resume source document
      // ================================================================
      const latexTimer = startStep("latex_generator");
      log("pipeline_step", resumeId, { step: "latex_generator" });

      // Reload careerMemory from DB to pick up GENERATED bullets just written
      careerMemory = await refreshResumeSourceProfile(resumeId, careerMemory);

      const headerSection = await db.resumeSection.findFirst({
        where: { resumeId, name: "resume_header" },
        select: { content: true },
      });

      const latexSource = generateLatexSource({
        careerMemory,
        strategy:    strategy!,
        summaryText,
        resumeHeader: parseResumeHeaderSection(headerSection?.content),
      });

      await db.resume.update({
        where: { id: resumeId },
        data:  { latexSource },
      });

      stepTimings.push(latexTimer.end("ok", { latexLength: latexSource.length }));
      log("pipeline_step_done", resumeId, { step: "latex_generator", durationMs: stepTimings.at(-1)!.durationMs });

      await transition(resumeId, ResumeState.QA_REVIEWED);
      currentState = ResumeState.QA_REVIEWED;
      log("pipeline_transition", resumeId, { to: ResumeState.QA_REVIEWED });
    }

    // ================================================================
    // Step 8: COMPRESSION — enforce one-page limit if LaTeX overflows
    //         QA_REVIEWED (inline — compression is silent, not a state change)
    // ================================================================
    if (currentState === ResumeState.QA_REVIEWED) {
      const latest = await db.resume.findUnique({
        where:  { id: resumeId },
        select: { latexSource: true, pageCount: true },
      });

      if (latest?.latexSource && (latest.pageCount ?? 0) > 1) {
        const timer = startStep("compression");
        log("pipeline_step", resumeId, { step: "compression", pageCount: latest.pageCount });

        const compressed = await runCompression(resumeId, latest.latexSource, latest.pageCount ?? 1);
        await db.resume.update({ where: { id: resumeId }, data: { latexSource: compressed } });

        stepTimings.push(timer.end("ok", { originalPages: latest.pageCount }));
        log("pipeline_step_done", resumeId, { step: "compression", durationMs: stepTimings.at(-1)!.durationMs });
      }

      // ================================================================
      // Step 8b: DIAGNOSTIC — score the tailored draft (ATS + keywords).
      // Non-fatal: a scoring failure must not block the finished resume.
      // Leave scores null on failure rather than inventing fallback values.
      // ================================================================
      const diagTimer = startStep("diagnostic");
      try {
        const draftBullets = await db.resumeBullet.findMany({
          where:   { resumeId },
          include: { bullet: { include: { workHistory: { select: { company: true, title: true } } } } },
        });
        const resumeData = {
          targetRole: resume.targetRole,
          summary:    summaryText,
          experience: draftBullets.map((rb) => ({
            company: rb.bullet.workHistory.company,
            title:   rb.bullet.workHistory.title,
            bullet:  rb.bullet.content,
          })),
        };
        const diagnostic = await runDiagnostic(resumeId, resumeData, resume.jdText ?? undefined);
        await db.resume.update({
          where: { id: resumeId },
          data:  { atsScore: diagnostic.atsScore, keywordScore: diagnostic.keywordScore },
        });
        const diagnosticSection = await db.resumeSection.findFirst({
          where: { resumeId, name: "diagnostic" },
          select: { id: true },
        });
        const diagnosticContent = JSON.stringify({
          atsScore: diagnostic.atsScore,
          keywordScore: diagnostic.keywordScore,
          issues: diagnostic.issues,
          recommendations: diagnostic.recommendations,
          needsReview: diagnostic.atsScore < 80 || diagnostic.keywordScore < 80,
        });
        if (diagnosticSection) {
          await db.resumeSection.update({
            where: { id: diagnosticSection.id },
            data: { content: diagnosticContent, visible: false },
          });
        } else {
          await db.resumeSection.create({
            data: { resumeId, name: "diagnostic", content: diagnosticContent, visible: false, sortOrder: 999 },
          });
        }
        stepTimings.push(diagTimer.end("ok", {
          atsScore: diagnostic.atsScore, keywordScore: diagnostic.keywordScore,
        }));
      } catch (err) {
        await db.resume.update({
          where: { id: resumeId },
          data: { atsScore: null, keywordScore: null },
        }).catch(() => undefined);
        stepTimings.push(diagTimer.end("warn", { error: String(err) }));
        log("pipeline_warn", resumeId, {
          step: "diagnostic",
          error: err instanceof Error ? err.message : String(err),
          note: "scores left unavailable; no synthetic fallback written",
        });
      }

      // ================================================================
      // Step 8c: VISUAL QA - render the final structured document to PDF
      // and PNG, then verify real geometry before exposing the draft.
      // ================================================================
      const visualQaTimer = startStep("visual_qa");
      const visualQa = await runResumeVisualQualityGate(resumeId);
      stepTimings.push(visualQaTimer.end("ok", {
        referenceStandard: visualQa.referenceStandard,
        pageCount: visualQa.pageCountActual,
        density: visualQa.density,
        warnings: Object.entries(visualQa.checks)
          .filter(([, check]) => check.status === "warning")
          .map(([name]) => name),
      }));
      log("pipeline_step_done", resumeId, {
        step: "visual_qa",
        durationMs: stepTimings.at(-1)!.durationMs,
        referenceStandard: visualQa.referenceStandard,
      });

      // Applications are created only when the user explicitly chooses
      // "Track application" after export. Generating a resume is not applying.
      // ================================================================
      // Step 9: Transition → USER_EDITING
      // This is the signal that ALL pipeline work (including scoring) is done.
      // The content API gates behind QA_REVIEWED+, but the upload page polls
      // specifically for USER_EDITING so it only fetches content AFTER scores
      // are written — eliminating the race condition that showed "-" scores.
      // ================================================================
      await transition(resumeId, ResumeState.USER_EDITING);
      currentState = ResumeState.USER_EDITING;
      log("pipeline_transition", resumeId, { to: ResumeState.USER_EDITING, note: "pipeline fully complete" });
    }

    // ================================================================
    // Pipeline complete
    // ================================================================
    const totalDurationMs = Date.now() - pipelineStartMs;

    await db.resume.update({
      where: { id: resumeId },
      data:  { pipelineFinishedAt: new Date() },
    });
    await db.resumeSection.deleteMany({
      where: { resumeId, name: "pipeline_error" },
    });

    log("pipeline_complete", resumeId, {
      finalState:      currentState,
      totalDurationMs,
      stepCount:       stepTimings.length,
      steps: stepTimings.map(s => ({
        step:       s.step,
        durationMs: s.durationMs,
        outcome:    s.outcome,
      })),
      warnings: stepTimings.filter(s => s.outcome === "warn").map(s => s.step),
    });
  } catch (err) {
    const totalDurationMs = Date.now() - pipelineStartMs;
    log("pipeline_error", resumeId, {
      error:            err instanceof Error ? err.message : String(err),
      failedState:      currentState,
      totalDurationMs,
      stepsCompleted:   stepTimings.filter(s => s.outcome === "ok").length,
    });

    // Fail honestly: FAILED state lets the user re-trigger the pipeline.
    // Never present fabricated fallback content as a finished draft.
    // Persist the error message so the workspace (and debugging) can show
    // WHY the run failed — console logs alone are ephemeral.
    try {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await db.resumeSection.deleteMany({
        where: { resumeId, name: "pipeline_error" },
      });
      await db.resumeSection.create({
        data: {
          resumeId,
          name:      "pipeline_error",
          visible:   false,
          sortOrder: 99,
          content:   `[${currentState}] ${errorMessage}`.slice(0, 4000),
        },
      });
      await db.resume.update({
        where: { id: resumeId },
        data:  { pipelineFinishedAt: new Date() },
      });
      await transition(resumeId, ResumeState.FAILED);
    } catch { /* swallow — pipeline_error log above is the fallback record */ }
    throw err;
  }
}
