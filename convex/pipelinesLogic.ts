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
