import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react'
import { ArrowLeft } from "@/components/icons"
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

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
  const cancel = useMutation(api.broadcasts.cancel)
  const schedule = useMutation(api.broadcasts.schedule)
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  const recipients = usePaginatedQuery(
    api.broadcasts.recipientsPage,
    b && b.stats.total > 0 ? { broadcastId: id as Id<'broadcasts'> } : 'skip',
    { initialNumItems: 50 },
  )

  if (b === undefined) return <Skeleton className="m-4 h-64" />
  if (b === null) return <p className="p-4 text-sm text-zinc-500">Broadcast niet gevonden.</p>

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
      await schedule({ broadcastId: b!._id, scheduledAt: when })
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Inplannen mislukt.')
    }
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
          <Badge>{b.status}</Badge>
          {(b.status === 'sending' || b.status === 'scheduled') && (
            <Button variant="outline" onClick={() => cancel({ broadcastId: b._id })}>Annuleren</Button>
          )}
        </div>
      </div>

      {b.status === 'draft' && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Inplannen</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <Button onClick={() => void handleSchedule()}>Inplannen</Button>
            {scheduleError && <p className="text-sm text-red-600">{scheduleError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Statistieken (live)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {stat('Totaal', b.stats.total)}
          {stat('Verzonden', b.stats.sent)}
          {stat('Afgeleverd', b.stats.delivered)}
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
