import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  Zap,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Clock,
  Plus,
  Archive,
  Play,
  Pause,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { NewWorkflowDialog } from '../components/crm/new-workflow-dialog'

export const Route = createFileRoute('/crm/workflows')({
  component: WorkflowsPage,
})

function WorkflowsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined

  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
        </CardContent>
      </Card>
    )
  }
  return <WorkflowsContent workspaceId={workspaceId} />
}

function WorkflowsContent({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>
}) {
  const workflows = useQuery(api.workflows.listForDashboard, { workspaceId })
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
            <Zap className="h-4.5 w-4.5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Workflows</h1>
            <p className="text-xs text-zinc-500">
              Automations die triggeren op events
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Nieuwe workflow
        </Button>
      </div>

      {workflows === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
            <Zap className="h-10 w-10 text-zinc-300" />
            <h2 className="text-lg font-semibold text-zinc-700">
              Nog geen workflows
            </h2>
            <p className="max-w-md text-center text-sm text-zinc-500">
              Run{' '}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
                npx tsx scripts/seed-workflows.ts
              </code>{' '}
              om de Snelle Response workflow aan te maken.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {workflows.map((wf) => (
            <WorkflowCard key={wf._id} workflow={wf} />
          ))}
        </div>
      )}

      <NewWorkflowDialog
        workspaceId={workspaceId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  )
}

function WorkflowCard({
  workflow,
}: {
  workflow: {
    _id: Id<'workflows'>
    name: string
    description?: string
    status: string
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    lastExecutedAt?: number
    triggerTypes: string[]
    recentExecutions: Array<{
      _id: string
      status: string
      contactName: string
      entityType: string
      entityId: string
      startedAt: number
      completedAt?: number
      pausedUntil?: number
      currentNodeId?: string
    }>
  }
}) {
  const setStatus = useMutation(api.workflows.setStatus)
  const successRate =
    workflow.totalExecutions > 0
      ? Math.round(
          (workflow.successfulExecutions / workflow.totalExecutions) * 100,
        )
      : null

  async function changeStatus(
    newStatus: 'active' | 'paused' | 'archived',
  ) {
    try {
      await setStatus({ workflowId: workflow._id, status: newStatus })
      toast.success(`Workflow ${newStatus}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kon niet wijzigen')
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {workflow.name}
              <StatusBadge status={workflow.status} />
            </CardTitle>
            {workflow.description && (
              <p className="mt-1 text-sm text-zinc-500">
                {workflow.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            {workflow.status === 'active' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => changeStatus('paused')}
                title="Pauzeren"
              >
                <Pause className="h-3.5 w-3.5" />
              </Button>
            )}
            {(workflow.status === 'paused' ||
              workflow.status === 'draft') && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => changeStatus('active')}
                title="Activeren"
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            )}
            {workflow.status !== 'archived' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => changeStatus('archived')}
                title="Archiveren"
                className="text-zinc-500 hover:text-zinc-700"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>
            <strong className="text-zinc-700">{workflow.totalExecutions}</strong>{' '}
            executions
          </span>
          {successRate !== null && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {successRate}% succes
            </span>
          )}
          {workflow.failedExecutions > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" />
              {workflow.failedExecutions} failed
            </span>
          )}
          {workflow.lastExecutedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              laatst {new Date(workflow.lastExecutedAt).toLocaleString('nl-NL')}
            </span>
          )}
          <span className="flex flex-wrap gap-1">
            {workflow.triggerTypes.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="text-xs font-mono"
              >
                {t}
              </Badge>
            ))}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Recente executions
        </h4>
        {workflow.recentExecutions.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            Nog geen executions
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {workflow.recentExecutions.map((e) => (
              <li key={e._id}>
                <Link
                  to="/crm/workflows/$id"
                  params={{ id: e._id }}
                  className="flex items-center gap-3 py-2 text-sm transition-colors hover:bg-zinc-50/60 -mx-2 px-2 rounded-md first:pt-0 last:pb-0"
                >
                  <ExecutionStatusIcon status={e.status} />
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
                    {e.contactName}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {new Date(e.startedAt).toLocaleString('nl-NL')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; className: string }> = {
    active: { label: 'Actief', className: 'bg-emerald-100 text-emerald-700' },
    paused: { label: 'Gepauzeerd', className: 'bg-amber-100 text-amber-700' },
    draft: { label: 'Concept', className: 'bg-zinc-100 text-zinc-700' },
    archived: { label: 'Gearchiveerd', className: 'bg-zinc-100 text-zinc-500' },
  }
  const m = meta[status] ?? { label: status, className: 'bg-zinc-100' }
  return (
    <Badge className={cn('border-0 text-xs', m.className)}>{m.label}</Badge>
  )
}

function ExecutionStatusIcon({ status }: { status: string }) {
  if (status === 'completed')
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
  if (status === 'failed')
    return <XCircle className="h-4 w-4 shrink-0 text-red-500" />
  if (status === 'paused')
    return <PauseCircle className="h-4 w-4 shrink-0 text-amber-500" />
  if (status === 'running')
    return <PlayCircle className="h-4 w-4 shrink-0 text-blue-500" />
  return <Clock className="h-4 w-4 shrink-0 text-zinc-400" />
}
