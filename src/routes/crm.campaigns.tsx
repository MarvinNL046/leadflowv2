import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { BroadcastList } from '#/components/crm/campaigns/broadcast-list.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/campaigns')({ component: CampaignsPage })

function CampaignsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined

  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!workspaceId) return <p className="p-4 text-sm text-amber-700">Geen workspace gekoppeld.</p>

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold">Campagnes</h1>
      <BroadcastList workspaceId={workspaceId} />
    </div>
  )
}
