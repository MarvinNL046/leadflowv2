import { useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { Link } from '@tanstack/react-router'
import { Plus } from "@/components/icons"
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { BroadcastEditor } from './broadcast-editor.tsx'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { EmailBlock } from '../../../../convex/emailBlocks'

export function BroadcastList({
  workspaceId,
  prefill,
  onPrefillConsumed,
}: {
  workspaceId: Id<'workspaces'>
  prefill?: { name: string; subject: string; blocks?: unknown } | null
  onPrefillConsumed?: () => void
}) {
  const broadcasts = useQuery(api.broadcasts.list, { workspaceId })
  const [creating, setCreating] = useState(false)

  // When a prefill arrives, open the composer
  useEffect(() => {
    if (prefill) {
      setCreating(true)
    }
  }, [prefill])

  if (broadcasts === undefined) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> Nieuwe broadcast</Button>
      )}
      {creating && (
        <BroadcastEditor
          key={prefill ? `${prefill.name}::${prefill.subject}::${Array.isArray(prefill.blocks) ? prefill.blocks.length : 0}` : 'new'}
          workspaceId={workspaceId}
          initialName={prefill?.name}
          initialSubject={prefill?.subject}
          initialBlocks={prefill?.blocks as EmailBlock[] | undefined}
          onClose={() => {
            setCreating(false)
            onPrefillConsumed?.()
          }}
        />
      )}

      {broadcasts.length === 0 && !creating && (
        <Card><CardContent className="p-6 text-sm text-zinc-500">Nog geen broadcasts.</CardContent></Card>
      )}

      {broadcasts.map((b) => (
        <Link key={b._id} to="/crm/campaigns/$id" params={{ id: b._id }}>
          <Card className="transition-colors hover:bg-zinc-50">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-zinc-500">{b.subject}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{b.stats.sent}/{b.stats.total} verzonden</span>
                <Badge>{b.status}</Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
