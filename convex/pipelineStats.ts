/**
 * Pure aggregatie voor de kanban-stats-balk. Geen Convex-context →
 * unit-testbaar onder `convex/**\/*.test.ts`.
 */

type StatStage = { _id: string; isWonStage: boolean; isLostStage: boolean };

export function computePipelineStats(
  stages: Array<StatStage>,
  opps: Array<{ stageId: string }>,
): {
  openCount: number;
  wonCount: number;
  lostCount: number;
  totalCount: number;
  winRate: number | null;
} {
  const wonIds = new Set(stages.filter((s) => s.isWonStage).map((s) => s._id));
  const lostIds = new Set(
    stages.filter((s) => s.isLostStage).map((s) => s._id),
  );

  let won = 0;
  let lost = 0;
  let open = 0;
  for (const o of opps) {
    if (wonIds.has(o.stageId)) won++;
    else if (lostIds.has(o.stageId)) lost++;
    else open++;
  }

  const closed = won + lost;
  return {
    openCount: open,
    wonCount: won,
    lostCount: lost,
    totalCount: opps.length,
    winRate: closed === 0 ? null : Math.round((won / closed) * 100),
  };
}
