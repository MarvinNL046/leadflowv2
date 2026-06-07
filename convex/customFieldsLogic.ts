/** Pure helpers voor custom-fields — geen Convex-context → unit-testbaar. */

export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function validateDefinition(d: {
  label: string;
  fieldType: string;
  selectOptions?: string[];
}): string | null {
  const label = d.label.trim();
  if (label.length < 1 || label.length > 40) {
    return "Label moet tussen 1 en 40 tekens zijn";
  }
  if (d.fieldType === "select") {
    const opts = (d.selectOptions ?? []).map((o) => o.trim()).filter(Boolean);
    if (opts.length < 1) return "Een keuzelijst heeft minstens 1 optie nodig";
  }
  return null;
}
