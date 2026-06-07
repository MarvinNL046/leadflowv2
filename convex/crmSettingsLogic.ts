/** Pure helpers voor crmSettings — geen Convex-context → unit-testbaar. */

export const DEFAULT_CALLBACK_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1, label: "Morgen" },
  { days: 3, label: "Over 3 dagen" },
  { days: 7, label: "Over een week" },
  { days: 14, label: "Over 2 weken" },
  { days: 30, label: "Over een maand" },
];

/** Returnt een foutmelding of null als de lijst geldig is. Lege lijst = OK. */
export function validateCallbackPresets(
  presets: Array<{ days: number; label: string }>,
): string | null {
  if (presets.length > 8) return "Maximaal 8 terugbel-knoppen";
  const seen = new Set<number>();
  for (const p of presets) {
    if (!Number.isInteger(p.days) || p.days < 1 || p.days > 365) {
      return "Dagen moet een geheel getal tussen 1 en 365 zijn";
    }
    if (seen.has(p.days)) return `Dubbele waarde: ${p.days} dagen`;
    seen.add(p.days);
    const label = p.label.trim();
    if (label.length < 1 || label.length > 40) {
      return "Label moet tussen 1 en 40 tekens zijn";
    }
  }
  return null;
}
