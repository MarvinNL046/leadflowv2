import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Search } from 'lucide-react'
import { Input } from '#/components/ui/input.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { LeadCard, type FeedLead } from '#/components/marketplace/lead-card.tsx'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/feed/')({ component: FeedIndexPage })

type Tab = 'beschikbaar' | 'ontgrendeld'

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'beschikbaar', label: 'Beschikbaar' },
  { value: 'ontgrendeld', label: 'Ontgrendeld' },
]

function FeedIndexPage() {
  const navigate = useNavigate()
  const prefs = useQuery(api.marketplace.buyerPreferences.getBuyerPreferences)

  // Redirect to onboarding until completed. Wait for the query to resolve
  // (undefined) before deciding, so we don't bounce on first render.
  useEffect(() => {
    if (prefs === undefined) return
    if (!prefs || !prefs.onboardingCompletedAt) {
      void navigate({ to: '/feed/onboarding' })
    }
  }, [prefs, navigate])

  if (prefs === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (!prefs || !prefs.onboardingCompletedAt) {
    return (
      <p className="text-sm text-zinc-500">Doorsturen naar onboarding…</p>
    )
  }

  return <FeedContent />
}

function FeedContent() {
  const [tab, setTab] = useState<Tab>('beschikbaar')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const data = useQuery(api.marketplace.feed.getBuyerFeed, {
    tab,
    q: debounced || undefined,
    limit: 30,
  })

  const isLoading = data === undefined
  const leads = (data ?? []) as FeedLead[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Offerteaanvragen</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isLoading
            ? '…'
            : `${leads.length} ${leads.length === 1 ? 'aanvraag' : 'aanvragen'}`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1">
          {TAB_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.value
                  ? 'bg-violet-50 text-violet-800'
                  : 'text-zinc-600 hover:bg-zinc-100',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op naam…"
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-zinc-500">
            {tab === 'ontgrendeld'
              ? 'Je hebt nog geen leads ontgrendeld.'
              : 'Geen aanvragen die aan je voorkeuren voldoen. Pas je filters aan of kom later terug.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  )
}
