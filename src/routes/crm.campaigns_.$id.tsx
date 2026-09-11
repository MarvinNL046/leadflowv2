import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react'
import { ArrowLeft } from "@/components/icons"
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { BroadcastEditor } from '#/components/crm/campaigns/broadcast-editor'
import { htmlToBlocks } from '#/components/crm/campaigns/email-builder/html-to-blocks'
import type { EmailBlock } from '../../convex/emailBlocks'
import { humanizeConvexError } from '#/lib/errors'

export const Route = createFileRoute('/crm/campaigns_/$id')({ component: BroadcastDetail })

function formatMoment(ms: number): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms))
}

/** Vertaal per-ontvanger status naar één leesbaar label (bezorgstatus uit de
 *  Resend-webhook wint van de verzendstatus). */
function deliveryLabel(r: {
  status: string
  delivery: 'delivered' | 'bounced' | 'read' | null
}): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (r.delivery === 'bounced') return { label: 'Gebounced', tone: 'warn' }
  if (r.delivery === 'read') return { label: 'Geopend', tone: 'ok' }
  if (r.delivery === 'delivered') return { label: 'Afgeleverd', tone: 'ok' }
  if (r.status === 'failed') return { label: 'Mislukt', tone: 'warn' }
  if (r.status === 'sent') return { label: 'Verzonden', tone: 'muted' }
  return { label: 'In wachtrij', tone: 'muted' }
}

function BroadcastDetail() {
  const { id } = Route.useParams()
  const b = useQuery(api.broadcasts.get, { broadcastId: id as Id<'broadcasts'> })
  const preview = useQuery(api.broadcasts.previewHtml, { broadcastId: id as Id<'broadcasts'> })
  const cancel = useMutation(api.broadcasts.cancel)
  const schedule = useMutation(api.broadcasts.schedule)
  const restore = useMutation(api.broadcasts.restoreDraft)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  useEffect(() => {
    const date = b?.status === 'scheduled' && b.scheduledAt !== undefined ? new Date(b.scheduledAt) : null
    setScheduleAt(date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
  }, [b?.scheduledAt, b?.status])

  const recipients = usePaginatedQuery(
    api.broadcasts.recipientsPage,
    b && b.stats.total > 0 ? { broadcastId: id as Id<'broadcasts'> } : 'skip',
    { initialNumItems: 50 },
  )

  if (b === undefined) return <Skeleton className="m-4 h-64" />
  if (b === null) return <p className="p-4 text-sm text-zinc-500">Broadcast niet gevonden.</p>
  if (editing && b.status === 'draft') return (
    <BroadcastEditor workspaceId={b.workspaceId} initialId={b._id}
      initialName={b.name} initialSubject={b.subject} initialSegmentId={b.segmentId}
      initialBlocks={(b.bodyBlocks as EmailBlock[] | undefined) ?? htmlToBlocks(b.body ?? '')}
      onClose={() => setEditing(false)} />
  )

  async function changeStatus(action: 'cancel' | 'restore') {
    setBusy(true)
    setScheduleError(null)
    try {
      await (action === 'cancel' ? cancel : restore)({ broadcastId: b!._id })
    } catch (err) {
      setScheduleError(humanizeConvexError(err, 'Wijzigen mislukt.'))
    } finally { setBusy(false) }
  }

  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-zinc-200 p-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )

  async function handleSchedule() {
    setScheduleError(null)
    const when = new Date(scheduleAt).getTime()
    if (!scheduleAt || Number.isNaN(when)) {
      setScheduleError('Kies een datum en tijd.')
      return
    }
    try {
      setBusy(true)
      await schedule({ broadcastId: b!._id, scheduledAt: when })
    } catch (err) {
      setScheduleError(humanizeConvexError(err, 'Inplannen mislukt.'))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6 p-4">
      <Link to="/crm/campaigns" className="inline-flex items-center gap-1 text-sm text-zinc-500">
        <ArrowLeft className="h-4 w-4" /> Campagnes
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{b.name}</h1>
          <p className="text-sm text-zinc-500">{b.subject}</p>
          {b.status === 'scheduled' && b.scheduledAt !== undefined && (
            <p className="mt-1 text-sm font-medium text-violet-700">
              Ingepland voor {formatMoment(b.scheduledAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge>{{ draft: 'Concept', scheduled: 'Ingepland', sending: 'Wordt verzonden', sent: 'Verzonden', cancelled: 'Geannuleerd', failed: 'Mislukt' }[b.status]}</Badge>
          {b.status === 'draft' && <Button onClick={() => setEditing(true)}>Mail bewerken</Button>}
          {(b.status === 'scheduled' || b.status === 'cancelled') && b.startedAt === undefined && b.stats.total === 0 && (
            <Button variant="outline" disabled={busy} onClick={() => void changeStatus('restore')}>
              {b.status === 'cancelled' ? 'Herstellen als concept' : 'Terug naar concept'}
            </Button>
          )}
          {(b.status === 'sending' || b.status === 'scheduled') && (
            <Button variant="outline" disabled={busy} onClick={() => void changeStatus('cancel')}>Annuleren</Button>
          )}
        </div>
      </div>

      {scheduleError && <p role="alert" className="text-sm text-red-600">{scheduleError}</p>}
      {(b.status === 'draft' || b.status === 'scheduled') && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{b.status === 'scheduled' ? 'Verzendmoment aanpassen' : 'Inplannen'}</CardTitle>
            <p className="text-sm text-zinc-500">{b.status === 'scheduled' ? 'Kies een nieuw tijdstip of zet de campagne terug naar concept om de mail te bewerken.' : 'Uw concept wordt pas verzonden nadat u het inplant of zelf verstuurt.'}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <input
              type="datetime-local"
              aria-label="Verzenddatum en tijd"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <span className="text-xs text-zinc-500">Tijdzone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
            <Button disabled={busy} onClick={() => void handleSchedule()}>{b.status === 'scheduled' ? 'Nieuw tijdstip opslaan' : 'Inplannen'}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Voorbeeld van de mail</CardTitle></CardHeader>
        <CardContent>
          {preview === undefined && <Skeleton className="h-64 w-full" />}
          {preview === null && (
            <p className="text-sm text-zinc-500">Geen voorbeeld beschikbaar.</p>
          )}
          {preview && (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-zinc-500">Onderwerp:</span>{' '}
                <span className="font-medium">{preview.subject}</span>
              </p>
              {/* Sandbox zonder scripts: de mail-HTML rendert exact zoals bij
                  de ontvanger, maar kan niets uitvoeren of navigeren. */}
              <iframe
                title="Mailvoorbeeld"
                sandbox=""
                srcDoc={preview.html}
                className="h-[640px] w-full rounded-lg border border-zinc-200 bg-white"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Statistieken (live)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 md:grid-cols-7">
          {stat('Totaal', b.stats.total)}
          {stat('Verzonden', b.stats.sent)}
          {stat('Afgeleverd', b.stats.delivered)}
          {stat('Geopend', b.stats.opened ?? 0)}
          {stat('Gebounced', b.stats.bounced)}
          {stat('Afgemeld', b.stats.unsubscribed)}
          {stat('Mislukt', b.stats.failed)}
        </CardContent>
      </Card>

      {b.stats.total > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Ontvangers</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="py-2 pr-4 font-medium">E-mail</th>
                  <th className="py-2 pr-4 font-medium">Naam</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recipients.results.map((r) => {
                  const d = deliveryLabel(r)
                  return (
                    <tr key={r._id} className="border-b border-zinc-100">
                      <td className="py-2 pr-4">{r.email}</td>
                      <td className="py-2 pr-4 text-zinc-600">{r.name}</td>
                      <td className="py-2">
                        <span
                          className={
                            d.tone === 'warn'
                              ? 'font-medium text-red-600'
                              : d.tone === 'ok'
                                ? 'text-emerald-700'
                                : 'text-zinc-500'
                          }
                        >
                          {d.label}
                        </span>
                        {(r.bounceReason ?? r.errorMessage) && (
                          <span className="ml-2 text-xs text-zinc-400">
                            {r.bounceReason ?? r.errorMessage}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {recipients.status === 'CanLoadMore' && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => recipients.loadMore(100)}
              >
                Meer laden
              </Button>
            )}
            {recipients.status === 'LoadingFirstPage' && (
              <Skeleton className="mt-3 h-16 w-full" />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
