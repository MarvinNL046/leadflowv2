import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { ArrowLeft } from "@/components/icons"
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/campaigns_/$id')({ component: BroadcastDetail })

function BroadcastDetail() {
  const { id } = Route.useParams()
  const b = useQuery(api.broadcasts.get, { broadcastId: id as Id<'broadcasts'> })
  const cancel = useMutation(api.broadcasts.cancel)

  if (b === undefined) return <Skeleton className="m-4 h-64" />
  if (b === null) return <p className="p-4 text-sm text-zinc-500">Broadcast niet gevonden.</p>

  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-zinc-200 p-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )

  return (
    <div className="space-y-6 p-4">
      <Link to="/crm/campaigns" className="inline-flex items-center gap-1 text-sm text-zinc-500">
        <ArrowLeft className="h-4 w-4" /> Campagnes
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{b.name}</h1>
          <p className="text-sm text-zinc-500">{b.subject}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge>{b.status}</Badge>
          {(b.status === 'sending' || b.status === 'scheduled') && (
            <Button variant="outline" onClick={() => cancel({ broadcastId: b._id })}>Annuleren</Button>
          )}
        </div>
      </div>

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
    </div>
  )
}
