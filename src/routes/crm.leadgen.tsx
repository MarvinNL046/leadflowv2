import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/crm/leadgen')({ component: LeadgenPage })

const date = (value: number) => new Intl.DateTimeFormat('nl-NL', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam',
}).format(value)
const notifications: Record<string, string> = {
  pending: 'Melding in wachtrij', sent: 'Melding verstuurd', failed: 'Melding mislukt', unknown: 'Melding niet geregistreerd',
}
const statuses: Record<string, string> = {
  published: 'Beschikbaar', pending_review: 'Te beoordelen', duplicate: 'Dubbele aanvraag',
  rejected: 'Afgewezen', sold_exclusive: 'Exclusief verkocht', sold_out: 'Uitverkocht', expired: 'Verlopen',
}

function LeadgenPage() {
  const profile = useQuery(api.userProfiles.me)
  if (profile === undefined) return <p role="status">Leadgenbeheer laden…</p>
  if (!profile?.isSuperAdmin) return <p>Dit overzicht is alleen beschikbaar voor beheerders.</p>
  return <LeadgenOverview />
}

function LeadgenOverview() {
  const sources = useQuery(api.marketplace.admin.listSources)
  const [sourceId, setSourceId] = useState<Id<'marketplaceApiKeys'> | undefined>()
  const { results, status, loadMore } = usePaginatedQuery(
    api.marketplace.admin.listLeads, sourceId ? { sourceId } : {}, { initialNumItems: 25 },
  )
  const updateStatus = useMutation(api.marketplace.admin.setFollowUpStatus)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function followUp(leadId: Id<'marketplaceLeads'>, value: 'new' | 'contacted' | 'done') {
    setSaving(leadId)
    setError(null)
    try { await updateStatus({ leadId, status: value }) }
    catch { setError('De opvolgstatus kon niet worden opgeslagen. Probeer opnieuw.') }
    finally { setSaving(null) }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Leadgenbeheer</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Binnengekomen leads</h1>
        <p className="mt-2 text-sm text-zinc-500">Alle opgeslagen websiteaanvragen in LeadFlow v2, met bron en opvolging. Nieuwste eerst.</p>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-white p-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Leadbron
          <select className="max-w-full rounded-md border bg-white px-3 py-2" value={sourceId ?? ''}
            onChange={e => setSourceId(e.target.value ? e.target.value as Id<'marketplaceApiKeys'> : undefined)}>
            <option value="">Alle bronnen</option>
            {sources?.map(source => <option key={source.id} value={source.id}>{source.name}{source.active ? '' : ' (inactief)'}</option>)}
          </select>
        </label>
        <p className="text-sm text-zinc-500">{results.length} geladen{sources ? ` · ${sources.length} bronnen` : ''}</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {status === 'LoadingFirstPage' ? <p role="status">Aanvragen laden…</p> : results.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">Nog geen aanvragen gevonden</p>
          <p className="mt-1 text-sm text-zinc-500">{sourceId ? 'Deze bron heeft nog geen opgeslagen aanvragen.' : 'Nieuwe aanvragen verschijnen hier automatisch na verificatie.'}</p>
        </div>
      ) : <div className="space-y-4">{results.map(lead => (
        <article key={lead.id} className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-zinc-900">{lead.name}</h2>
              <p className="mt-1 break-all text-sm text-indigo-700">{lead.source}</p>
              <p className="mt-1 text-xs text-zinc-500">{date(lead.createdAt)} · {lead.niche} · {statuses[lead.status] ?? lead.status}</p>
            </div>
            <label className="grid gap-1 text-xs text-zinc-500">
              Opvolging
              <select aria-label={`Opvolging ${lead.name}`} value={lead.followUpStatus} disabled={saving !== null}
                onChange={e => void followUp(lead.id, e.target.value as 'new' | 'contacted' | 'done')}
                className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50">
                <option value="new">Nieuw</option><option value="contacted">Contact opgenomen</option><option value="done">Afgerond</option>
              </select>
              {saving === lead.id && <span role="status">Opslaan…</span>}
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {lead.phone && <a className="underline decoration-zinc-300 underline-offset-4" href={`tel:${lead.phone}`}>{lead.phone}</a>}
            {lead.email && <a className="break-all underline decoration-zinc-300 underline-offset-4" href={`mailto:${lead.email}`}>{lead.email}</a>}
            {(lead.city || lead.postalCode) && <span className="text-zinc-500">{[lead.postalCode, lead.city].filter(Boolean).join(' · ')}</span>}
          </div>
          {lead.message && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-600">{lead.message}</p>}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 ${lead.phoneVerified ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-500'}`}>Telefoon {lead.phoneVerified ? 'bevestigd' : 'onbevestigd'}</span>
            {lead.email && <span className={`rounded-full px-2.5 py-1 ${lead.emailVerified ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-500'}`}>E-mail {lead.emailVerified ? 'bevestigd' : 'onbevestigd'}</span>}
            <span className={`rounded-full px-2.5 py-1 ${lead.notificationStatus === 'failed' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600'}`}>{notifications[lead.notificationStatus] ?? lead.notificationStatus}</span>
          </div>
        </article>
      ))}</div>}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <Button variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(25)}>{status === 'LoadingMore' ? 'Laden…' : 'Meer aanvragen laden'}</Button>
      )}
      <p className="text-xs text-zinc-500">Bij oudere aanvragen is de notificatiestatus niet geregistreerd. Opvolging staat los van de verkoopstatus in de marketplace.</p>
    </div>
  )
}
