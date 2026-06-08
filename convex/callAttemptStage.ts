/**
 * Vindt de "Nx Gebeld"-stage voor een belpoging (V1-call-progressie). Exact-match
 * op de genormaliseerde naam `"{attempt}x gebeld"` (lowercase, whitespace ingeklapt)
 * → geen false-positives (bv. "11x Gebeld" matcht attempt 1 niet). Geen match →
 * undefined → caller laat de opp staan (dashboard verbergt 'm via de follow-up).
 * Pure → unit-testbaar.
 */
export function pickCallAttemptStage<T extends { name: string }>(
  stages: T[],
  attempt: number,
): T | undefined {
  const target = `${attempt}x gebeld`;
  return stages.find(
    (s) => s.name.toLowerCase().replace(/\s+/g, " ").trim() === target,
  );
}
