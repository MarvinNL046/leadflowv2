import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { LeadCoverage } from '#/components/marketplace/lead-coverage'
import { ServiceReview } from '#/components/marketplace/service-review'
import { SaleReview } from '#/components/marketplace/sale-review'

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
  const [attentionOnly,setAttentionOnly] = useState(false)
  const { results, status, loadMore } = usePaginatedQuery(
    api.marketplace.admin.listLeads, {sourceId,attentionOnly}, { initialNumItems: 25 },
  )
  const updateStatus = useMutation(api.marketplace.admin.setFollowUpStatus)
  const funnel = useQuery(api.marketplace.metrics.homepageFunnel, sourceId ? { sourceId } : 'skip')
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
        <p className="mt-2 text-sm text-zinc-500">Alle opgeslagen websiteaanvragen in LeadFlow v2, met bron en opvolging. Nieuwste opslag eerst; bij imports staat de oorspronkelijke aanvraagdatum apart.</p>
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
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attentionOnly} onChange={e=>setAttentionOnly(e.target.checked)}/>Alleen opvolging nodig</label>
        <p className="text-sm text-zinc-500">{results.length} geladen{sources ? ` · ${sources.length} bronnen` : ''}</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {results.length>0 && <section aria-label="Afnemerdekking" className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">Afnemerdekking · {results.length} geladen aanvragen</h2>
        <p className="mt-2">{results.filter(l=>l.coverage.status==='uncovered').length} zonder passende afnemer · {results.filter(l=>l.coverage.status==='covered').length} met passende afnemer · {results.filter(l=>l.coverage.status==='unavailable').length} niet beschikbaar · {results.filter(l=>l.coverage.status==='unknown').length} nog te controleren</p>
        <p className="mt-2 text-xs text-zinc-500">Gebaseerd op actieve marketplace-profielen, werkgebied, dienst en beschikbare verkoopvorm. Een match is geen aankoop of verstuurde melding. Tegoed en e-mailinstellingen tellen hier niet mee.</p>
      </section>}
      <section aria-label="Homepageconversie" className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Homepageconversie · laatste 30 dagen</h2>
        {!sourceId ? <p className="mt-2 text-sm text-zinc-500">Kies hierboven een leadbron om de meetgegevens te bekijken.</p>
          : !funnel ? <p role="status" className="mt-2 text-sm">Meetgegevens laden…</p>
          : <>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[[funnel.views, 'Paginaweergaven'], [funnel.starts, 'Formulier gestart'], [funnel.submitted, 'Ingediend'], [funnel.verified, 'Nieuwe bevestigde leads']].map(([value,label]) => (
                <div key={label}><p className="text-2xl font-semibold text-indigo-800">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-500">{funnel.firstMeasuredDay ? 'Tellingen vanaf ' + new Intl.DateTimeFormat('nl-NL', {dateStyle:'medium',timeZone:'UTC'}).format(funnel.firstMeasuredDay) + '. ' : 'Nog geen metingen ontvangen. '}Weergaven zijn geen unieke bezoekers. Alleen de aangesloten homepage telt mee; dubbele leads en herhaalde bevestigingen tellen niet als nieuwe lead. Dagen lopen van 00:00 tot 24:00 UTC.</p>
          </>}
      </section>
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
              <p className="mt-1 text-xs text-zinc-500">{lead.imported ? 'Geïmporteerd op ' : 'Ontvangen op '}{date(lead.createdAt)} · {lead.niche} · {statuses[lead.status] ?? lead.status}</p>
              {lead.imported && <p className="mt-1 text-xs text-zinc-500">Oorspronkelijke aanvraag: {lead.originalRequestedAt ? date(lead.originalRequestedAt) : 'datum onbekend'}</p>}
              <p className="mt-1 text-xs text-zinc-500">Type werk: {({install:'Installeren',repair:'Repareren',maintain:'Onderhouden'} as Record<string,string>)[lead.serviceType ?? ''] ?? 'Nog vaststellen'}</p>
              {lead.importedPendingReview && <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">Bij import was deze aanvraag nog te beoordelen. Controleer de actuele behoefte en het type werk voordat je deze als actuele lead aanbiedt.</p>}
              {lead.expiresAt && <p className="mt-1 text-xs text-zinc-500">Verkooptermijn tot {date(lead.expiresAt)}</p>}
              {lead.unclaimedAt && <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm font-medium text-amber-900">Opvolging nodig: nog geen koper bij het verstrijken van de opvolgtermijn.</p>}
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
          <LeadCoverage coverage={lead.coverage} />
          <ServiceReview leadId={lead.id} current={lead.serviceType} revision={lead.serviceTypeRevision} canEdit={lead.canEditServiceType} latest={lead.latestServiceReview} />
          <SaleReview leadId={lead.id} action={lead.saleReviewAction} revision={lead.saleReviewRevision} latest={lead.latestSaleReview}/>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 ${lead.phoneVerified ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-500'}`}>Telefoon {lead.phoneVerified ? 'bevestigd' : 'onbevestigd'}</span>
            {lead.email && <span className={`rounded-full px-2.5 py-1 ${lead.emailVerified ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-500'}`}>E-mail {lead.emailVerified ? 'bevestigd' : 'onbevestigd'}</span>}
            <span className={`rounded-full px-2.5 py-1 ${lead.notificationStatus === 'failed' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600'}`}>Beheer: {notifications[lead.notificationStatus] ?? lead.notificationStatus}</span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">Afnemersmail: {lead.buyerMailsSent} door provider geaccepteerd</span>
            {lead.buyerMailsFailed>0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{lead.buyerMailsFailed} afnemersmeldingen mislukt</span>}
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
