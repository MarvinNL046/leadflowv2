import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Phone, ChevronDown } from "@/components/icons"
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { LeadCard, type IncomingLead } from '../components/crm/lead-card'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/crm/')({ component: CrmDashboard })

const LEADS_PER_PAGE = 5

type Tab = 'all' | 'follow_up' | 'new' | 'concepten'

function CrmDashboard() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id

  // Einde-van-vandaag, stabiel per mount → een verlopen follow-up telt mee
  // zonder dat de query-arg elke render verandert (geen refetch-thrash).
  const dueBefore = useMemo(() => {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    return d.getTime()
  }, [])

  const leads = useQuery(
    api.contacts.listIncomingLeads,
    workspaceId ? { workspaceId, limit: 200, dueBefore } : 'skip',
  )

  // Contact-IDs met een wachtend AI-concept → voedt de Concepten-tab.
  const pendingIds = useQuery(
    api.aiLeadResponse.pendingConceptContactIds,
    workspaceId ? { workspaceId } : 'skip',
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20">
          <Phone className="h-4.5 w-4.5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Nieuwe leads</h1>
          <p className="text-xs text-zinc-500">
            {leads === undefined
              ? 'Laden…'
              : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'} om op te volgen`}
          </p>
        </div>
      </div>

      {leads === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : leads.length === 0 ? (
        <EmptyState />
      ) : (
        <LeadsList
          leads={leads as IncomingLead[]}
          pendingIds={pendingIds ?? []}
        />
      )}
    </div>
  )
}

function LeadsList({
  leads,
  pendingIds,
}: {
  leads: IncomingLead[]
  pendingIds: string[]
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [visibleCount, setVisibleCount] = useState(LEADS_PER_PAGE)

  // Buckets — niet mutually exclusive (lead kan in meerdere zitten)
  const newOnly = leads.filter((l) => l.callCount === 0)
  const followUp = leads.filter(
    (l) => l.callCount > 0 && l.callCount < 3, // bel-pogingen gedaan, niet uitgeput
  )
  const pendingSet = new Set(pendingIds)
  const conceptLeads = leads.filter((l) => pendingSet.has(l._id))

  const filtered =
    tab === 'concepten'
      ? conceptLeads
      : tab === 'follow_up'
        ? followUp
        : tab === 'new'
          ? newOnly
          : leads

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-100 p-1">
        <TabButton
          active={tab === 'all'}
          onClick={() => {
            setTab('all')
            setVisibleCount(LEADS_PER_PAGE)
          }}
        >
          Alle
          <Badge variant="secondary" className="ml-1 bg-white">
            {leads.length}
          </Badge>
        </TabButton>
        <TabButton
          active={tab === 'follow_up'}
          onClick={() => {
            setTab('follow_up')
            setVisibleCount(LEADS_PER_PAGE)
          }}
        >
          Vervolg
          <Badge variant="secondary" className="ml-1 bg-white">
            {followUp.length}
          </Badge>
        </TabButton>
        <TabButton
          active={tab === 'new'}
          onClick={() => {
            setTab('new')
            setVisibleCount(LEADS_PER_PAGE)
          }}
        >
          Nieuw
          <Badge variant="secondary" className="ml-1 bg-white">
            {newOnly.length}
          </Badge>
        </TabButton>
        <TabButton
          active={tab === 'concepten'}
          onClick={() => {
            setTab('concepten')
            setVisibleCount(LEADS_PER_PAGE)
          }}
        >
          Concepten
          <Badge
            variant="secondary"
            className={cn(
              'ml-1',
              pendingIds.length > 0 ? 'bg-blue-600 text-white' : 'bg-white',
            )}
          >
            {pendingIds.length}
          </Badge>
        </TabButton>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          Geen leads in dit filter
        </div>
      ) : (
        <>
          {visible.map((lead) => (
            <LeadCard key={lead._id} lead={lead} />
          ))}

          {hasMore && (
            <Button
              variant="outline"
              onClick={() => setVisibleCount((n) => n + LEADS_PER_PAGE)}
              className="h-12 w-full border-dashed"
            >
              <ChevronDown className="mr-2 h-4 w-4" />
              Toon {filtered.length - visibleCount} meer
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm'
          : 'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200'
      }
    >
      {children}
    </button>
  )
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20">
          <Phone className="h-6 w-6 text-green-500" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-700">Geen nieuwe leads</h2>
        <p className="max-w-md text-center text-sm text-zinc-500">
          Zodra Meta-leads, website-form inzendingen of handmatig
          toegevoegde contacts binnenkomen verschijnen ze hier.
          Voeg test-contact toe via Contacts in de sidebar.
        </p>
      </CardContent>
    </Card>
  )
}
