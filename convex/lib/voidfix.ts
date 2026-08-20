/**
 * Voidfix — één plek voor de basis-URL's.
 *
 * Deze constante stond alleen in convex/integrations.ts. Bij het bouwen van de
 * sessiebewaking is hij overgetypt als "api.voidfix.com" in plaats van
 * "wa.voidfix.com", waarna elke statuscontrole stil faalde op een DNS-fout en
 * de bewaker "alles in orde" rapporteerde. Vandaar: één definitie, hier.
 */
export const VOIDFIX_WA_BASE = "https://wa.voidfix.com";
