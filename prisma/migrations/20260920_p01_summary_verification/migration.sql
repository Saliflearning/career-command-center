-- P0-1 — verify the career summary before persisting it.
-- Stores the verifier's verdict for the generated summary so the workspace
-- can badge it ("Verified" / "Needs review"). Ship with the P0-1 code change.
-- Run against your Postgres instance before deploying the P0-1 pipeline code.

ALTER TABLE "Resume"
  ADD COLUMN IF NOT EXISTS "summaryVerificationJson" JSONB;
