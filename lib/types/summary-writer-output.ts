/**
 * SummaryWriterOutput — canonical output for the Summary Writer agent
 *
 * Produced by: agents/summary-writer
 * Consumed by: agents/orchestrator, lib/latex/generator, workspace editor (A8)
 *
 * The summary is the first thing a recruiter reads.
 * It must be 2–3 sentences, plain English, calibrated to the JD's seniority
 * and role type. It must never fabricate experience or upgrade qualifiers.
 *
 * Persisted to: Resume.summaryText + ResumeSection (name="summary")
 */

export interface SummaryWriterOutput {
  resumeId:    string;
  summaryText: string;   // 2–3 sentences, recruiter-ready, JD-calibrated
  wordCount:   number;
  agentVersion: string;
  provider:    string;
  generatedAt: string;   // ISO 8601
}
