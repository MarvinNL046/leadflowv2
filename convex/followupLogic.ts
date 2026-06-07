/**
 * Pure beslissing voor de follow-up-cron: mag een opp in deze stage worden
 * teruggezet naar de eerste stage (Nieuw)? Geen Convex-context → unit-testbaar.
 * Sets als ReadonlySet<string> zodat een Set<Id<...>> zonder cast past.
 */
export function shouldResurfaceOpp(
  stageId: string,
  opts: {
    firstStageId: string;
    closedStageIds: ReadonlySet<string>;
    noResurfaceStageIds: ReadonlySet<string>;
  },
): boolean {
  if (stageId === opts.firstStageId) return false; // al in Nieuw
  if (opts.closedStageIds.has(stageId)) return false; // won/lost
  if (opts.noResurfaceStageIds.has(stageId)) return false; // vastgehouden
  return true;
}
