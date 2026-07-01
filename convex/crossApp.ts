import { v } from 'convex/values'
import { action } from './_generated/server'
import { api } from './_generated/api'

/**
 * Cross-app "hub": haalt de samenvatting van dit contact op bij de andere
 * suite-apps (cashflow: facturen/offertes, frostwork: installaties/onderhoud/
 * werkbonnen). Het leadflow-contact-`_id` is precies wat die apps als
 * `leadflowContactId` opslaan, dus we sturen het contactId 1-op-1 mee.
 *
 * Auth: leadflow gebruikt Convex Auth. Een action heeft geen `ctx.db`, dus we
 * gaten via `ctx.runQuery(api.contacts.getDetail)` — die doet de auth- +
 * workspace-membership-check (gooit voor niet-leden, `null` voor onbekend
 * contact). Graceful: als een app onbereikbaar is of z'n key mist → `null`
 * voor die app, zodat de contactpagina niet breekt. De keys staan ALLEEN op de
 * Convex-deployment (CASHFLOW_READ_API_KEY / FROSTWORK_READ_API_KEY), nooit in
 * de client-bundle.
 */

type CashflowSummary = {
  configured: boolean
  linked: boolean
  invoices: {
    count: number
    openCount: number
    openTotalCents: number
    latestDate: number | null
    latestNumber: string | null
  }
  quotes: { count: number; openCount: number }
}

type FrostworkSummary = {
  configured: boolean
  linked: boolean
  installations: { count: number }
  maintenance: { lastAt: number | null; nextDueAt: number | null }
  workOrders: { count: number }
}

const CASHFLOW_SUMMARY_URL =
  process.env.CASHFLOW_SUMMARY_URL ??
  'https://good-ibex-522.eu-west-1.convex.site/api/summary/contact'
const FROSTWORK_SUMMARY_URL =
  process.env.FROSTWORK_SUMMARY_URL ??
  'https://fine-skunk-171.eu-west-1.convex.site/api/summary/contact'

async function fetchSummary<T>(
  base: string,
  key: string | undefined,
  contactId: string,
): Promise<T | null> {
  if (!key) return null
  try {
    const url = `${base}?id=${encodeURIComponent(contactId)}`
    const res = await fetch(url, { headers: { 'x-api-key': key } })
    if (!res.ok) {
      console.error('[crossApp] summary fetch', base, res.status)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error('[crossApp] summary fetch error', base, err)
    return null
  }
}

export const contactSuiteSummary = action({
  args: { contactId: v.id('contacts') },
  handler: async (
    ctx,
    args,
  ): Promise<{
    cashflow: CashflowSummary | null
    frostwork: FrostworkSummary | null
  }> => {
    // Auth- + workspace-membership-gate (gooit voor niet-leden).
    await ctx.runQuery(api.contacts.getDetail, { contactId: args.contactId })

    const [cashflow, frostwork] = await Promise.all([
      fetchSummary<CashflowSummary>(
        CASHFLOW_SUMMARY_URL,
        process.env.CASHFLOW_READ_API_KEY,
        args.contactId,
      ),
      fetchSummary<FrostworkSummary>(
        FROSTWORK_SUMMARY_URL,
        process.env.FROSTWORK_READ_API_KEY,
        args.contactId,
      ),
    ])
    return { cashflow, frostwork }
  },
})
