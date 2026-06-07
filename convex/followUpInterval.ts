/**
 * Bepaalt het retry-interval (dagen tot volgende belpoging) voor een lead na
 * "Niet bereikt". De verst-gevorderde open opp (hoogste stage-order) bepaalt
 * het interval: diens stage-followUpDays, of de workspace-default als die stage
 * geen override heeft of er geen open opp is. Pure → unit-testbaar.
 */
export function resolveFollowUpDays(
  openStages: Array<{ order: number; followUpDays?: number | null }>,
  defaultDays: number,
): number {
  if (openStages.length === 0) return defaultDays;
  const furthest = [...openStages].sort((a, b) => b.order - a.order)[0];
  return furthest.followUpDays ?? defaultDays;
}
