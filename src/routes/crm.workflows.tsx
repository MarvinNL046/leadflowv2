import { createFileRoute } from '@tanstack/react-router'
import { Zap } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card.tsx'

export const Route = createFileRoute('/crm/workflows')({
  component: WorkflowsPlaceholder,
})

function WorkflowsPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Workflows</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Auto-responses op nieuwe leads (Snelle Response & co)
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <Zap className="h-10 w-10 text-zinc-300" />
          <h2 className="text-lg font-semibold text-zinc-700">Komt eraan</h2>
          <p className="max-w-md text-center text-sm text-zinc-500">
            Workflow-engine port van v1 (5 workflows, 294 executions, 98.3%
            success). "Snelle Response" trigger=contact_created → delay 3min
            → email + WhatsApp wordt v2's vervanger van Mia. Convex scheduler
            vervangt QStash.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
