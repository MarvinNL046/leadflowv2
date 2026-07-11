import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { Plus, Trash2 } from "@/components/icons"
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { SegmentBuilder } from './segment-builder.tsx'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

export function SegmentList({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const segments = useQuery(api.segments.list, { workspaceId })
  const remove = useMutation(api.segments.remove)
  const [creating, setCreating] = useState(false)

  if (segments === undefined) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nieuw segment
        </Button>
      )}
      {creating && <SegmentBuilder workspaceId={workspaceId} onDone={() => setCreating(false)} />}

      {segments.length === 0 && !creating && (
        <Card><CardContent className="p-6 text-sm text-zinc-500">Nog geen segmenten.</CardContent></Card>
      )}

      {segments.map((s) => (
        <Card key={s._id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-zinc-500">
                Match {s.rules.match === 'all' ? 'alle' : 'één van'} · {s.rules.conditions.length} condities
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove({ segmentId: s._id })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
