/**
 * Externe Staycool-apps (losse SaaS-producten, los geëxploiteerd).
 * Lichte koppeling: navlinks in de sidebar + per-klant deeplinks.
 * Latere fase: webhook-sync (zie docs) en modules als upsell.
 */

export const FROSTWORK_URL = 'https://frostwork.app'
export const CASHFLOW_URL = 'https://wetrycashflow.com'

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
