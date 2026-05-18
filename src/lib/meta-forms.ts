/**
 * Mapping van Meta lead-form-ID naar leesbaar label voor de UI.
 *
 * Bron: scripts/_inspect-neon analyse op Staycool lead_attribution (18 mei
 * 2026). Top-5 forms dekken 99% van 354 meta-leads. Labels zijn
 * best-effort uit docs/v1-migration/integrations/meta-lead-ads.md en
 * adset-namen. PAS LABELS AAN naar interne naamgeving wanneer gewenst.
 *
 * Toekomst: vervangen door dynamic lookup naar Convex `metaForms` table
 * zodra die geport is. Voor nu houdt deze hardcoded mapping de UI snel
 * (geen extra query per render).
 */
export const META_FORM_LABELS: Record<string, string> = {
  "1414562123459035": "Algemeen",
  "956868316261651": "Winteractie",
  "1200797428374191": "Vermogen-check",
  "1979305763009930": "Aanvraag (NL)",
  "1197443315672305": "Zonnepanelen",
};

/**
 * Returnt het label voor een form-ID, of null als onbekend. Caller
 * beslist of fallback "Meta" of een afgekorte ID getoond wordt.
 */
export function getMetaFormLabel(formId: string | null | undefined): string | null {
  if (!formId) return null;
  return META_FORM_LABELS[formId] ?? null;
}
