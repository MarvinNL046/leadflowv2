import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Plus, MapPin, GripVertical, Kanban as KanbanIcon } from "@/components/icons"
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { NewOpportunityDialog } from '../components/crm/new-opportunity-dialog'
import { InlineEditText } from '../components/crm/inline-edit-text'
import { CreatePipelineForm } from '../components/crm/create-pipeline-form'

export const Route = createFileRoute('/crm/pipelines')({
  component: PipelinesPage,
})

function PipelinesPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined

  if (tenants === undefined) {
    return <Skeleton className="h-96 w-full" />
  }
  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
        </CardContent>
      </Card>
    )
  }

  return <KanbanBoard workspaceId={workspaceId} />
}

function KanbanBoard({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const pipeline = useQuery(api.pipelines.getDefault, { workspaceId })
  const board = useQuery(
    api.opportunities.listForKanban,
    pipeline?.pipeline ? { pipelineId: pipeline.pipeline._id } : 'skip',
  )
  const moveToStage = useMutation(api.opportunities.moveToStage)
  const renamePipeline = useMutation(api.pipelines.renamePipeline)
  const renameStage = useMutation(api.pipelines.renameStage)
  const [addOpen, setAddOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  if (pipeline === undefined || (pipeline && board === undefined)) {
    return <Skeleton className="h-96 w-full" />
  }
  if (pipeline === null) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <KanbanIcon className="h-10 w-10 text-zinc-300" />
          <h2 className="text-lg font-semibold text-zinc-700">
            Geen pipeline aangemaakt
          </h2>
          <p className="max-w-md text-center text-sm text-zinc-500">
            Maak je eerste pipeline aan om leads in een kanban te beheren. Je
            krijgt 5 standaard-stages die je daarna kunt aanpassen.
          </p>
          <CreatePipelineForm workspaceId={workspaceId} />
        </CardContent>
      </Card>
    )
  }

  const stages = board!.stages
  const opps = board!.opportunities
  const byStage = new Map<string, typeof opps>()
  for (const s of stages) byStage.set(s._id, [])
  for (const o of opps) byStage.get(o.stageId)?.push(o)

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const oppId = active.id as Id<'opportunities'>
    const toStageId = over.id as Id<'pipelineStages'>
    const opp = opps.find((o) => o._id === oppId)
    if (!opp || opp.stageId === toStageId) return
    try {
      await moveToStage({ opportunityId: oppId, toStageId })
      const targetStage = stages.find((s) => s._id === toStageId)
      toast.success(`Verplaatst naar ${targetStage?.name ?? 'stage'}`)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Verplaatsen mislukt'))
    }
  }

  const totalValue = opps.reduce((sum, o) => sum + (o.value ?? 0), 0)

  return (
    <div className="flex h-full min-w-0 flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            <InlineEditText
              value={pipeline.pipeline.name}
              maxLength={80}
              ariaLabel="Pipeline-naam bewerken"
              className="text-xl font-semibold text-zinc-900"
              inputClassName="text-xl font-semibold text-zinc-900 w-72"
              onSave={async (next) => {
                try {
                  await renamePipeline({
                    pipelineId: pipeline.pipeline._id,
                    name: next,
                  })
                  toast.success('Pipeline hernoemd')
                } catch (err) {
                  toast.error(
                    humanizeConvexError(err, 'Hernoemen mislukt'),
                  )
                  throw err
                }
              }}
            />
          </h1>
          <p className="text-xs text-zinc-500">
            {opps.length} {opps.length === 1 ? 'opportunity' : 'opportunities'}
            {totalValue > 0 && ` · totaal € ${totalValue.toLocaleString('nl-NL')}`}
          </p>
        </div>
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Nieuwe opportunity
        </Button>
      </div>

      <PipelineStatsBar pipelineId={pipeline.pipeline._id} />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage._id}
              stage={stage}
              opportunities={byStage.get(stage._id) ?? []}
              onRename={async (next) => {
                try {
                  await renameStage({ stageId: stage._id, name: next })
                  toast.success('Stage hernoemd')
                } catch (err) {
                  toast.error(
                    humanizeConvexError(err, 'Hernoemen mislukt'),
                  )
                  throw err
                }
              }}
            />
          ))}
        </div>
      </DndContext>

      <NewOpportunityDialog
        workspaceId={workspaceId}
        pipelineId={pipeline.pipeline._id}
        firstStageId={
          stages.find((s) => !s.isWonStage && !s.isLostStage)?._id ??
          stages[0]?._id
        }
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  )
}

function PipelineStatsBar({ pipelineId }: { pipelineId: Id<'pipelines'> }) {
  const stats = useQuery(api.opportunities.pipelineStats, { pipelineId })
  if (stats === undefined) {
    return <Skeleton className="h-[68px] w-full" />
  }
  const items = [
    { label: 'Open', value: String(stats.openCount), tone: 'text-zinc-900' },
    {
      label: 'Gewonnen',
      value: String(stats.wonCount),
      tone: 'text-emerald-600',
    },
    { label: 'Verloren', value: String(stats.lostCount), tone: 'text-rose-600' },
    {
      label: 'Win-rate',
      value: stats.winRate === null ? '—' : `${stats.winRate}%`,
      tone: 'text-blue-600',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-zinc-200 bg-card px-4 py-3 shadow-sm"
        >
          <div className="text-xs text-zinc-500">{it.label}</div>
          <div className={cn('mt-0.5 text-xl font-semibold', it.tone)}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function StageColumn({
  stage,
  opportunities,
  onRename,
}: {
  stage: Doc<'pipelineStages'>
  opportunities: Array<{
    _id: string
    title: string
    value?: number
    contactId: Id<'contacts'>
    contactName: string
    contactCity: string | null
  }>
  onRename: (next: string) => Promise<void>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage._id })
  const stageValue = opportunities.reduce((s, o) => s + (o.value ?? 0), 0)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50/60 p-3',
        isOver && 'border-blue-300 bg-blue-50/60',
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: stage.color ?? '#94a3b8' }}
          aria-hidden
        />
        <h3 className="text-sm font-medium text-zinc-700">
          <InlineEditText
            value={stage.name}
            maxLength={50}
            ariaLabel="Stage-naam bewerken"
            className="text-sm font-medium text-zinc-700"
            inputClassName="text-sm font-medium text-zinc-700 w-40"
            onSave={onRename}
          />
        </h3>
        <span className="text-xs text-zinc-400">{opportunities.length}</span>
        {stageValue > 0 && (
          <span className="ml-auto text-xs text-zinc-500">
            € {stageValue.toLocaleString('nl-NL')}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {opportunities.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 py-6 text-center text-xs text-zinc-400">
            Sleep een opportunity hierheen
          </p>
        ) : (
          opportunities.map((opp) => (
            <OpportunityCard key={opp._id} opp={opp} />
          ))
        )}
      </div>
    </div>
  )
}

function OpportunityCard({
  opp,
}: {
  opp: {
    _id: string
    title: string
    value?: number
    contactId: Id<'contacts'>
    contactName: string
    contactCity: string | null
  }
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: opp._id })
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'group cursor-grab touch-none rounded-md border border-zinc-200 bg-white p-3 shadow-xs hover:border-zinc-300 active:cursor-grabbing',
        isDragging && 'opacity-40 shadow-md',
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-zinc-400" />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-zinc-900">
            {opp.title}
          </h4>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            <Link
              to="/crm/contacts/$id"
              params={{ id: opp.contactId }}
              className="truncate hover:text-blue-600 hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {opp.contactName}
            </Link>
            {opp.contactCity && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {opp.contactCity}
              </span>
            )}
          </div>
          {opp.value !== undefined && (
            <p className="mt-1.5 text-sm font-semibold text-zinc-700">
              € {opp.value.toLocaleString('nl-NL')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
