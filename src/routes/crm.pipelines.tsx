import { createFileRoute } from '@tanstack/react-router'
import { Kanban } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card.tsx'

export const Route = createFileRoute('/crm/pipelines')({
  component: PipelinesPlaceholder,
})

function PipelinesPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Pipelines</h1>
        <p className="mt-1 text-sm text-zinc-500">Kanban-board voor opportunities</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <Kanban className="h-10 w-10 text-zinc-300" />
          <h2 className="text-lg font-semibold text-zinc-700">Komt eraan</h2>
          <p className="max-w-md text-center text-sm text-zinc-500">
            Kanban-board met pipeline-stages en opportunities. V1 had dit
            als hoofd-dashboard feature. Port-volgorde: na contacts CRUD,
            voor messaging.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
