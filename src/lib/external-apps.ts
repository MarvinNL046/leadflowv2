/**
 * Externe Staycool-apps (losse SaaS-producten, los geëxploiteerd).
 * Lichte koppeling: navlinks in de sidebar + per-klant deeplinks.
 * Latere fase: webhook-sync (zie docs) en modules als upsell.
 */

/**
 * Domeinstructuur (koepel "wetry", besloten 12 jun 2026):
 *   wetry{product}.com     → marketing/landing
 *   app.wetry{product}.com → de app zelf
 */
export const FROSTWORK_URL = 'https://app.wetryfrostwork.com'
export const CASHFLOW_URL = 'https://app.wetrycashflow.com'

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
