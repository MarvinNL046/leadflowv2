import { createFileRoute, Link } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'

export const Route = createFileRoute('/feed/sold')({ component: SoldLeadsPage })

function SoldLeadsPage() {
  const { results, status, loadMore } = usePaginatedQuery(api.marketplace.feed.getSoldLeads, {}, { initialNumItems: 30 })
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Verkochte aanvragen</h1>
      <p className="mt-2 text-sm text-zinc-600">Gekochte aanvragen binnen je diensten en werkgebied, nieuwste aanvragen eerst. Bij gedeelde verkoop kunnen nog koopplaatsen beschikbaar zijn.</p>
    </div>
    {results.map(lead => <Card key={lead.id}>
      <CardHeader><CardTitle><Link to="/feed/lead/$id" params={{ id: lead.id }} className="hover:underline">{lead.nicheLabel}{lead.city ? ` · ${lead.city}` : ''}</Link></CardTitle></CardHeader>
      <CardContent className="space-y-3"><p className="text-sm font-medium">Gekocht door</p>
        <ul className="space-y-1 text-sm">{lead.buyers.map((buyer, index) => <li key={index}>{buyer.companyName} · {buyer.mode === 'exclusive' ? 'Exclusief' : 'Gedeeld'}</li>)}</ul>
        <Link to="/feed/lead/$id" params={{ id: lead.id }} className="inline-block text-sm underline">Bekijk aanvraag</Link>
      </CardContent>
    </Card>)}
    {status === 'LoadingFirstPage' && <p role="status">Aanvragen laden…</p>}
    {results.length === 0 && status !== 'LoadingFirstPage' && <p className="text-sm text-zinc-600">{status === 'Exhausted' ? 'Geen verkochte aanvragen binnen je diensten en werkgebied.' : 'Nog geen passende verkochte aanvragen in dit deel van het overzicht. Laad meer om verder te kijken.'}</p>}
    {status !== 'Exhausted' && status !== 'LoadingFirstPage' && <Button variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(30)}>{status === 'LoadingMore' ? 'Laden…' : 'Meer aanvragen laden'}</Button>}
    <p className="text-sm text-zinc-500">Contactgegevens van de aanvrager blijven afgeschermd voor bedrijven die de aanvraag niet hebben gekocht.</p>
  </div>
}
