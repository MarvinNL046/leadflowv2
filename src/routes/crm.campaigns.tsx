import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { cn } from '#/lib/utils.ts'
import { SegmentList } from '#/components/crm/campaigns/segment-list.tsx'
import { BroadcastList } from '#/components/crm/campaigns/broadcast-list.tsx'
import { TemplateList } from '#/components/crm/campaigns/template-list.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/campaigns')({ component: CampaignsPage })

const TABS = [
  { key: 'broadcasts', label: 'Broadcasts' },
  { key: 'segments', label: 'Segmenten' },
  { key: 'templates', label: 'Templates' },
] as const

function CampaignsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('broadcasts')

  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!workspaceId)
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
        </CardContent>
      </Card>
    )

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">Campagnes</h1>
      <div className="flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.key
                ? 'border-violet-600 text-violet-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'broadcasts' && <BroadcastList workspaceId={workspaceId} />}
      {tab === 'segments' && <SegmentList workspaceId={workspaceId} />}
      {tab === 'templates' && <TemplateList workspaceId={workspaceId} />}
    </div>
  )
}
