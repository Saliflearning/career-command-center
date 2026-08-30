export interface ResumeScoreAggregate {
  average: number | null;
  count: number;
}

export interface ResumeLibrarySummary {
  totalResumes: number;
  totalApplications: number;
  averageMatchScore: number | null;
  scoredResumeCount: number;
}

export function buildResumeLibrarySummary(
  scoreAggregates: ResumeScoreAggregate[],
  totalResumes: number,
  totalApplications: number
): ResumeLibrarySummary {
  const scoredResumeCount = scoreAggregates.reduce(
    (total, aggregate) => total + aggregate.count,
    0
  );
  const scoreTotal = scoreAggregates.reduce(
    (total, aggregate) => total + (aggregate.average ?? 0) * aggregate.count,
    0
  );

  return {
    totalResumes,
    totalApplications,
    averageMatchScore:
      scoredResumeCount > 0
        ? Math.round(scoreTotal / scoredResumeCount)
        : null,
    scoredResumeCount,
  };
}
