/**
 * Externe Staycool-apps (losse SaaS-producten, los geëxploiteerd).
 * Lichte koppeling: navlinks in de sidebar + per-klant deeplinks.
 * Latere fase: webhook-sync (zie docs) en modules als upsell.
 */

/**
 * Domeinstructuur (wetry.app-koepel, live sinds eind jun 2026 — vervangt
 * het oudere app.wetry{product}.com-plan van 12 jun dat nooit is aangelegd):
 *   wetry{product}.com   → marketing/landing
 *   {product}.wetry.app  → de app zelf
 * Leadflow zelf woont op leadflow.wetry.app.
 */
export const FROSTWORK_URL = 'https://frostwork.wetry.app'
export const CASHFLOW_URL = 'https://cashflow.wetry.app'

/**
 * Deeplink naar de Frostwork-klantenlijst, voorgefilterd op naam
 * (Frostwork zoekt server-side op naam via het ?q= param).
 */
export function frostworkCustomerUrl(name?: string | null): string {
  const q = name?.trim()
  return q
    ? `${FROSTWORK_URL}/customers?q=${encodeURIComponent(q)}`
    : `${FROSTWORK_URL}/customers`
}
