import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Clock,
  Zap,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { cn } from '#/lib/utils.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/workflows_/$id')({
  component: ExecutionDetailPage,
})

function ExecutionDetailPage() {
  const { id } = Route.useParams()
  const detail = useQuery(api.workflows.getExecutionDetail, {
    executionId: id as Id<'workflowExecutions'>,
  })

  if (detail === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (detail === null) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-zinc-500">
          Execution niet gevonden.{' '}
          <Link
            to="/crm/workflows"
            className="text-blue-600 hover:underline"
          >
            Terug
          </Link>
        </CardContent>
      </Card>
    )
  }

  const { workflow, execution, logs } = detail
  const totalMs = execution.completedAt
    ? execution.completedAt - execution.startedAt
    : Date.now() - execution.startedAt

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          to="/crm/workflows"
          className="mt-1 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Terug naar workflows"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
          <Zap className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-zinc-900">
            {workflow.name}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <ExecutionStatusBadge status={execution.status} />
            {execution.entityType === 'contact' && execution.contactName && (
              <>
                <span>·</span>
                <Link
                  to="/crm/contacts/$id"
                  params={{ id: execution.entityId }}
                  className="text-blue-600 hover:underline"
                >
                  {execution.contactName}
                </Link>
              </>
            )}
            <span>·</span>
            <span>{new Date(execution.startedAt).toLocaleString('nl-NL')}</span>
            <span>·</span>
            <span>{formatDuration(totalMs)}</span>
          </div>
        </div>
      </div>

      {/* Pause-info */}
      {execution.status === 'paused' && execution.pausedUntil && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center gap-3 py-3 text-sm text-amber-800">
            <PauseCircle className="h-4 w-4 shrink-0" />
            <span>
              Wachten tot{' '}
              <strong>
                {new Date(execution.pausedUntil).toLocaleString('nl-NL')}
              </strong>
              {' — '}
              {Math.max(
                0,
                Math.ceil((execution.pausedUntil - Date.now()) / 1000),
              )}{' '}
              seconden te gaan
            </span>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">
              Geen log-events
            </p>
          ) : (
            <ol className="space-y-3">
              {logs.map((log, idx) => (
                <LogStep key={log._id} log={log} isLast={idx === logs.length - 1} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LogStep({
  log,
  isLast,
}: {
  log: {
    _creationTime: number
    nodeId: string
    nodeType: string
    nodeLabel: string
    nodeSubType?: string
    status: string
    output?: unknown
    error?: string
    durationMs?: number
  }
  isLast: boolean
}) {
  return (
    <li className="relative flex gap-3">
      {/* Timeline rail */}
      {!isLast && (
        <div
          aria-hidden
          className="absolute left-3 top-7 bottom-[-12px] w-0.5 bg-zinc-200"
        />
      )}

      {/* Status circle */}
      <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
        <LogStatusIcon status={log.status} nodeType={log.nodeType} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-zinc-900">{log.nodeLabel}</span>
          <Badge variant="secondary" className="font-mono text-xs">
            {log.nodeSubType ?? log.nodeType}
          </Badge>
          <span className="text-xs text-zinc-400">
            {new Date(log._creationTime).toLocaleTimeString('nl-NL', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          {log.durationMs !== undefined && (
            <span className="text-xs text-zinc-400">
              ({log.durationMs}ms)
            </span>
          )}
        </div>

        {log.error && (
          <div className="mt-1 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />
            <p className="text-xs text-red-800">{log.error}</p>
          </div>
        )}
        {log.output !== undefined && log.output !== null && !log.error && (
          <pre className="mt-1 overflow-x-auto rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
            {JSON.stringify(log.output, null, 2)}
          </pre>
        )}
      </div>
    </li>
  )
}

function LogStatusIcon({
  status,
  nodeType,
}: {
  status: string
  nodeType: string
}) {
  const baseClass = 'h-5 w-5 rounded-full bg-white p-0.5'
  if (status === 'success') {
    return (
      <CheckCircle2 className={cn(baseClass, 'text-emerald-500')} />
    )
  }
  if (status === 'failed') {
    return <XCircle className={cn(baseClass, 'text-red-500')} />
  }
  if (status === 'skipped') {
    return <ChevronRight className={cn(baseClass, 'text-zinc-400')} />
  }
  if (nodeType === 'delay') {
    return <Clock className={cn(baseClass, 'text-amber-500')} />
  }
  return <PlayCircle className={cn(baseClass, 'text-blue-500')} />
}

function ExecutionStatusBadge({ status }: { status: string }) {
  const meta: Record<
    string,
    { label: string; icon: typeof CheckCircle2; className: string }
  > = {
    running: {
      label: 'Loopt',
      icon: PlayCircle,
      className: 'bg-blue-100 text-blue-700',
    },
    paused: {
      label: 'Gepauzeerd',
      icon: PauseCircle,
      className: 'bg-amber-100 text-amber-700',
    },
    completed: {
      label: 'Voltooid',
      icon: CheckCircle2,
      className: 'bg-emerald-100 text-emerald-700',
    },
    failed: {
      label: 'Gefaald',
      icon: XCircle,
      className: 'bg-red-100 text-red-700',
    },
    cancelled: {
      label: 'Geannuleerd',
      icon: XCircle,
      className: 'bg-zinc-100 text-zinc-700',
    },
  }
  const m = meta[status] ?? {
    label: status,
    icon: Clock,
    className: 'bg-zinc-100 text-zinc-700',
  }
  const Icon = m.icon
  return (
    <Badge className={cn('border-0', m.className)}>
      <Icon className="mr-1 h-3 w-3" /> {m.label}
    </Badge>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}
