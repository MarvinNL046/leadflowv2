/**
 * Pure validatie voor pipeline-namen. Geen Convex-imports → unit-testbaar.
 * Gebruikt door createPipeline + renamePipeline (zelfde regels: ≤80 tekens).
 */
export function validatePipelineName(
  name: string,
): { value: string } | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Naam mag niet leeg zijn" };
  if (trimmed.length > 80) return { error: "Naam mag max 80 tekens zijn" };
  return { value: trimmed };
}

/**
 * De eerste actieve (niet-won/niet-lost) stage op volgorde. Single-sourced
 * definitie van "de eerste/intake-stage" — gebruikt door het dashboard
 * (listIncomingLeads) en de follow-up-cron. Sorteert intern, dus volgorde van
 * de input maakt niet uit. undefined als er geen actieve stage is.
 */
export function pickFirstActiveStage<
  T extends { order: number; isWonStage: boolean; isLostStage: boolean },
>(stages: T[]): T | undefined {
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .find((s) => !s.isWonStage && !s.isLostStage);
}
