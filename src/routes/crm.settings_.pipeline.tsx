import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Kanban as KanbanIcon,
  Check,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { InlineEditText } from '../components/crm/inline-edit-text'
import { CreatePipelineForm } from '../components/crm/create-pipeline-form'

export const Route = createFileRoute('/crm/settings_/pipeline')({
  component: PipelineSettingsPage,
})

const PRESET_COLORS = [
  '#94a3b8', // slate
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
  '#fb923c', // orange
  '#facc15', // yellow
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#f87171', // red
]

function PipelineSettingsPage() {
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
  return <PipelineEditor workspaceId={workspaceId} />
}

function PipelineEditor({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const data = useQuery(api.pipelines.getDefault, { workspaceId })
  const renamePipeline = useMutation(api.pipelines.renamePipeline)
  const renameStage = useMutation(api.pipelines.renameStage)
  const addStage = useMutation(api.pipelines.addStage)
  const deleteStage = useMutation(api.pipelines.deleteStage)
  const reorderStages = useMutation(api.pipelines.reorderStages)
  const updateStageColor = useMutation(api.pipelines.updateStageColor)
  const setStageRole = useMutation(api.pipelines.setStageRole)
  const setStageNoResurface = useMutation(
    api.pipelines.setStageNoResurface,
  )

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [adding, setAdding] = useState(false)

  if (data === undefined) return <Skeleton className="h-96 w-full" />
  if (data === null) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="text-sm text-zinc-600">
            Nog geen pipeline aangemaakt voor deze workspace. Maak er een aan —
            je krijgt 5 standaard-stages die je daarna kunt aanpassen.
          </p>
          <CreatePipelineForm workspaceId={workspaceId} />
        </CardContent>
      </Card>
    )
  }

  const { pipeline, stages } = data
  const orderedStages = [...stages].sort((a, b) => a.order - b.order)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (adding) return
    const trimmed = newName.trim()
    if (!trimmed) return
    setAdding(true)
    try {
      await addStage({ pipelineId: pipeline._id, name: trimmed, color: newColor })
      setNewName('')
      setNewColor(PRESET_COLORS[0])
      toast.success('Stage toegevoegd')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Toevoegen mislukt'))
    } finally {
      setAdding(false)
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= orderedStages.length) return
    const next = [...orderedStages]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    try {
      await reorderStages({
        pipelineId: pipeline._id,
        stageIds: next.map((s) => s._id),
      })
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Verplaatsen mislukt'))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/crm/settings"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar instellingen
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
            <KanbanIcon className="h-4.5 w-4.5 text-violet-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              Pipeline-stages
            </h1>
            <p className="text-xs text-zinc-500">
              Volgorde, kleuren en Gewonnen/Verloren-markering voor{' '}
              <InlineEditText
                value={pipeline.name}
                maxLength={80}
                ariaLabel="Pipeline-naam bewerken"
                className="text-xs text-zinc-700 font-medium"
                inputClassName="text-xs font-medium w-56"
                onSave={async (next) => {
                  try {
                    await renamePipeline({
                      pipelineId: pipeline._id,
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
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {orderedStages.map((stage, idx) => (
            <StageRow
              key={stage._id}
              stage={stage}
              isFirst={idx === 0}
              isLast={idx === orderedStages.length - 1}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
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
              onColor={async (color) => {
                try {
                  await updateStageColor({ stageId: stage._id, color })
                } catch (err) {
                  toast.error(
                    humanizeConvexError(err, 'Kleur wijzigen mislukt'),
                  )
                }
              }}
              onRole={async (role) => {
                try {
                  await setStageRole({ stageId: stage._id, role })
                  toast.success('Rol bijgewerkt')
                } catch (err) {
                  toast.error(
                    humanizeConvexError(err, 'Rol wijzigen mislukt'),
                  )
                }
              }}
              onNoResurface={async (value) => {
                try {
                  await setStageNoResurface({ stageId: stage._id, value })
                  toast.success(
                    value
                      ? 'Stage wordt vastgehouden bij follow-up'
                      : 'Stage doet weer mee met follow-up',
                  )
                } catch (err) {
                  toast.error(humanizeConvexError(err, 'Wijzigen mislukt'))
                }
              }}
              onDelete={async () => {
                try {
                  await deleteStage({ stageId: stage._id })
                  toast.success('Stage verwijderd')
                } catch (err) {
                  toast.error(
                    humanizeConvexError(err, 'Verwijderen mislukt'),
                  )
                }
              }}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48 space-y-1.5">
              <Label htmlFor="new-stage-name">Naam</Label>
              <Input
                id="new-stage-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Bijv. Onderhandeling"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kleur</Label>
              <ColorSwatches value={newColor} onChange={setNewColor} />
            </div>
            <Button type="submit" disabled={adding || !newName.trim()}>
              <Plus className="h-4 w-4" />
              Toevoegen
            </Button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">
            Nieuwe stages worden vóór Gewonnen/Verloren ingevoegd.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function StageRow({
  stage,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRename,
  onColor,
  onRole,
  onNoResurface,
  onDelete,
}: {
  stage: Doc<'pipelineStages'>
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRename: (next: string) => Promise<void>
  onColor: (color: string) => Promise<void>
  onRole: (role: 'normal' | 'won' | 'lost') => Promise<void>
  onNoResurface: (value: boolean) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const role: 'normal' | 'won' | 'lost' = stage.isWonStage
    ? 'won'
    : stage.isLostStage
      ? 'lost'
      : 'normal'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white p-2.5">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Verplaats omhoog"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Verplaats omlaag"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <ColorSwatches
        value={stage.color ?? '#94a3b8'}
        onChange={(c) => void onColor(c)}
        compact
      />

      <div className="min-w-48 flex-1">
        <InlineEditText
          value={stage.name}
          maxLength={50}
          ariaLabel="Stage-naam bewerken"
          className="text-sm font-medium text-zinc-800"
          inputClassName="text-sm font-medium w-48"
          onSave={onRename}
        />
      </div>

      <RoleSelector value={role} onChange={onRole} />

      {!isFirst && role === 'normal' && (
        <button
          type="button"
          onClick={() => void onNoResurface(!stage.noResurface)}
          className={cn(
            'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
            stage.noResurface
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50',
          )}
          title="Niet auto-terugzetten naar Nieuw bij een verlopen follow-up"
          aria-pressed={stage.noResurface === true}
        >
          Vasthouden
        </button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void onDelete()}
        className="text-zinc-400 hover:text-red-600"
        aria-label="Stage verwijderen"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function RoleSelector({
  value,
  onChange,
}: {
  value: 'normal' | 'won' | 'lost'
  onChange: (role: 'normal' | 'won' | 'lost') => void | Promise<void>
}) {
  const opts: Array<{
    key: 'normal' | 'won' | 'lost'
    label: string
    activeClass: string
  }> = [
    {
      key: 'normal',
      label: 'Actief',
      activeClass: 'bg-zinc-200 text-zinc-800',
    },
    {
      key: 'won',
      label: 'Gewonnen',
      activeClass: 'bg-emerald-100 text-emerald-800',
    },
    {
      key: 'lost',
      label: 'Verloren',
      activeClass: 'bg-red-100 text-red-800',
    },
  ]
  return (
    <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => void onChange(o.key)}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            value === o.key
              ? o.activeClass
              : 'text-zinc-500 hover:text-zinc-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ColorSwatches({
  value,
  onChange,
  compact = false,
}: {
  value: string
  onChange: (color: string) => void
  compact?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Kleur ${c}`}
          className={cn(
            'relative rounded-full border transition-transform hover:scale-110',
            compact ? 'h-4 w-4' : 'h-6 w-6',
            value.toLowerCase() === c.toLowerCase()
              ? 'border-zinc-800 ring-2 ring-violet-300'
              : 'border-zinc-300',
          )}
          style={{ backgroundColor: c }}
        >
          {value.toLowerCase() === c.toLowerCase() && !compact && (
            <Check className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow" />
          )}
        </button>
      ))}
    </div>
  )
}
