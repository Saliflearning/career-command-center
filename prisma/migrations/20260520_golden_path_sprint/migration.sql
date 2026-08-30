-- Golden Path Sprint — Resume pipeline observability fields
-- Adds crash-recovery JSON blobs, summary text, and pipeline timing.
-- Run against your Postgres instance before deploying golden-path pipeline code.

ALTER TABLE "Resume"
  ADD COLUMN IF NOT EXISTS "jdAnalysisJson"       JSONB,
  ADD COLUMN IF NOT EXISTS "strategyJson"          JSONB,
  ADD COLUMN IF NOT EXISTS "summaryText"           TEXT,
  ADD COLUMN IF NOT EXISTS "pipelineStartedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pipelineFinishedAt"    TIMESTAMP(3);
