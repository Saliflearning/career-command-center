const DEFAULT_PIPELINE_CLAIM_TTL_MS = 10 * 60 * 1000;

interface PipelineClaimTimestamps {
  pipelineStartedAt: Date | null;
  pipelineFinishedAt: Date | null;
}

export function hasActivePipelineClaim(
  timestamps: PipelineClaimTimestamps,
  now = new Date(),
  ttlMs = DEFAULT_PIPELINE_CLAIM_TTL_MS
): boolean {
  if (!timestamps.pipelineStartedAt || timestamps.pipelineFinishedAt) return false;

  const ageMs = now.getTime() - timestamps.pipelineStartedAt.getTime();
  return ageMs >= 0 && ageMs < ttlMs;
}
