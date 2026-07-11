import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Euro, Loader2, Pencil, Plus, Route as RouteIcon, Trash2 } from "@/components/icons"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

interface PageWithForms {
  id: Id<'metaPages'>
  pageId: string
  pageName: string
  forms: Array<{
    id: Id<'metaForms'>
    formId: string
    formName: string
  }>
}

interface LeadRoutingSectionProps {
  orgId: Id<'orgs'>
  pages: PageWithForms[]
}

const NONE = '__none__'

export function LeadRoutingSection({
  orgId,
  pages,
}: LeadRoutingSectionProps) {
  const routes = useQuery(api.integrations.listLeadIngestRoutes, { orgId })
  const workspaces = useQuery(api.integrations.listWorkspacesForOrg, { orgId })
  const members = useQuery(api.integrations.listOrgMembers, { orgId })
  const deleteRoute = useMutation(api.integrations.deleteLeadIngestRoute)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<
    NonNullable<typeof routes>[number] | null
  >(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setEditingRoute(null)
    setDialogOpen(true)
  }
  function openEdit(route: NonNullable<typeof routes>[number]) {
    setEditingRoute(route)
    setDialogOpen(true)
  }

  async function handleDelete(id: Id<'leadIngestRoutes'>) {
    if (!window.confirm('Route verwijderen?')) return
    setDeletingId(id)
    try {
      await deleteRoute({ id })
      toast.success('Route verwijderd')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Verwijderen mislukt'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Lead-routing per formulier</CardTitle>
          <Button size="sm" onClick={openCreate} disabled={pages.length === 0}>
            <Plus className="h-4 w-4" />
            Route toevoegen
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pages.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            Geen Meta-pagina&apos;s gekoppeld — koppel eerst Meta voor je
            routes maakt.
          </div>
        ) : routes === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : routes.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            Nog geen routes — leads vallen terug op de page-default of de
            workspace-default.
          </div>
        ) : (
          <div className="space-y-2">
            {routes.map((r) => (
              <RouteRow
                key={r.id}
                route={r}
                onEdit={() => openEdit(r)}
                onDelete={() => handleDelete(r.id)}
                deleting={deletingId === r.id}
              />
            ))}
          </div>
        )}
      </CardContent>

      {dialogOpen && (
        <RouteDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          orgId={orgId}
          pages={pages}
          workspaces={workspaces ?? []}
          members={members ?? []}
          route={editingRoute}
        />
      )}
    </Card>
  )
}

function RouteRow({
  route,
  onEdit,
  onDelete,
  deleting,
}: {
  route: NonNullable<
    ReturnType<typeof useQuery<typeof api.integrations.listLeadIngestRoutes>>
  >[number]
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const source = route.formInfo
    ? `${route.formInfo.pageName} / ${route.formInfo.formName}`
    : route.sourceIdentifier
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#d7ece8]">
        <RouteIcon className="h-4 w-4 text-[#328f97]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{source}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
          <span>→ {route.workspaceName}</span>
          {route.pipelineName && (
            <>
              <span className="text-zinc-300">·</span>
              <span>
                {route.pipelineName}
                {route.stageName ? ` / ${route.stageName}` : ''}
              </span>
            </>
          )}
          {route.assigneeName && (
            <>
              <span className="text-zinc-300">·</span>
              <span>👤 {route.assigneeName}</span>
            </>
          )}
          {route.defaultLeadValue != null && (
            <>
              <span className="text-zinc-300">·</span>
              <span>
                €{' '}
                {route.defaultLeadValue.toLocaleString('nl-NL', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </>
          )}
        </div>
      </div>
      <Badge variant={route.isActive ? 'secondary' : 'outline'}>
        {route.isActive ? 'Actief' : 'Inactief'}
      </Badge>
      <Button variant="ghost" size="icon" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={deleting}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

function RouteDialog({
  open,
  onOpenChange,
  orgId,
  pages,
  workspaces,
  members,
  route,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: Id<'orgs'>
  pages: PageWithForms[]
  workspaces: Array<{ id: Id<'workspaces'>; name: string; isDefault: boolean }>
  members: Array<{ userId: Id<'users'>; name: string; email: string }>
  route: NonNullable<
    ReturnType<typeof useQuery<typeof api.integrations.listLeadIngestRoutes>>
  >[number] | null
}) {
  const upsert = useMutation(api.integrations.upsertLeadIngestRoute)
  const [saving, setSaving] = useState(false)

  // Init state from route (edit) or sensible defaults (create)
  const [pageId, setPageId] = useState<string>('')
  const [formId, setFormId] = useState<string>('') // Meta form-id string
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [pipelineId, setPipelineId] = useState<string>(NONE)
  const [stageId, setStageId] = useState<string>(NONE)
  const [assigneeId, setAssigneeId] = useState<string>(NONE)
  const [leadValue, setLeadValue] = useState<string>('')
  const [isActive, setIsActive] = useState(true)

  // Init effect — only on dialog open or route change
  useEffect(() => {
    if (!open) return
    if (route) {
      // Find the page that owns this form
      const ownerPage = pages.find((p) =>
        p.forms.some((f) => f.formId === route.sourceIdentifier),
      )
      setPageId(ownerPage?.id ?? '')
      setFormId(route.sourceIdentifier)
      setWorkspaceId(route.targetWorkspaceId)
      setPipelineId(route.defaultPipelineId ?? NONE)
      setStageId(route.defaultStageId ?? NONE)
      setAssigneeId(route.assignToUserId ?? NONE)
      setLeadValue(
        route.defaultLeadValue != null ? String(route.defaultLeadValue) : '',
      )
      setIsActive(route.isActive)
    } else {
      // Create-mode defaults
      const defaultWs = workspaces.find((w) => w.isDefault) ?? workspaces[0]
      setPageId(pages[0]?.id ?? '')
      setFormId('')
      setWorkspaceId(defaultWs?.id ?? '')
      setPipelineId(NONE)
      setStageId(NONE)
      setAssigneeId(NONE)
      setLeadValue('')
      setIsActive(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id])

  const selectedPage = useMemo(
    () => pages.find((p) => p.id === pageId),
    [pages, pageId],
  )

  // Load pipelines for selected workspace
  const pipelines = useQuery(
    api.integrations.listPipelinesWithStages,
    workspaceId ? { workspaceId: workspaceId as Id<'workspaces'> } : 'skip',
  )

  const selectedPipeline = useMemo(
    () =>
      pipelineId !== NONE
        ? pipelines?.find((p) => p.id === pipelineId)
        : undefined,
    [pipelineId, pipelines],
  )

  // Reset stage if pipeline changes en de huidige stage hoort niet bij die pipeline
  useEffect(() => {
    if (!selectedPipeline) {
      setStageId(NONE)
      return
    }
    if (
      stageId !== NONE &&
      !selectedPipeline.stages.some((s) => s.id === stageId)
    ) {
      setStageId(NONE)
    }
  }, [selectedPipeline, stageId])

  async function handleSave() {
    if (!formId) {
      toast.error('Kies een specifiek formulier')
      return
    }
    if (!workspaceId) {
      toast.error('Kies een workspace')
      return
    }
    setSaving(true)
    try {
      await upsert({
        id: route?.id,
        orgId,
        sourceType: 'meta_form',
        sourceIdentifier: formId,
        targetWorkspaceId: workspaceId as Id<'workspaces'>,
        defaultPipelineId:
          pipelineId !== NONE ? (pipelineId as Id<'pipelines'>) : undefined,
        defaultStageId:
          stageId !== NONE ? (stageId as Id<'pipelineStages'>) : undefined,
        assignToUserId:
          assigneeId !== NONE ? (assigneeId as Id<'users'>) : undefined,
        defaultLeadValue: leadValue ? Number(leadValue) : undefined,
        isActive,
      })
      toast.success(route ? 'Route bijgewerkt' : 'Route toegevoegd')
      onOpenChange(false)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {route ? 'Route bewerken' : 'Nieuwe lead-route'}
          </DialogTitle>
          <DialogDescription>
            Bepaal waar leads van een specifiek Meta-formulier landen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Bron-pagina</Label>
            <Select
              value={pageId}
              onValueChange={(v) => {
                setPageId(v)
                setFormId('') // form-keuze resetten bij andere pagina
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Kies pagina" />
              </SelectTrigger>
              <SelectContent>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.pageName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPage && (
            <div className="space-y-1.5">
              <Label>Formulier</Label>
              <Select value={formId} onValueChange={setFormId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies formulier" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPage.forms.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-zinc-500">
                      Nog geen formulieren — sync ze eerst via "Forms
                      synchroniseren" op de pagina.
                    </div>
                  ) : (
                    selectedPage.forms.map((f) => (
                      <SelectItem key={f.id} value={f.formId}>
                        {f.formName}{' '}
                        <span className="text-xs text-zinc-400">
                          ({f.formId})
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Target workspace</Label>
            <Select
              value={workspaceId}
              onValueChange={(v) => {
                setWorkspaceId(v)
                setPipelineId(NONE) // reset bij andere workspace
                setStageId(NONE)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Kies workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                    {w.isDefault ? ' (default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pipeline (optioneel)</Label>
              <Select value={pipelineId} onValueChange={setPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Workspace default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Workspace default</SelectItem>
                  {(pipelines ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.isDefault ? ' (default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start-stage (optioneel)</Label>
              <Select
                value={stageId}
                onValueChange={setStageId}
                disabled={!selectedPipeline}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Eerste open stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Eerste open stage</SelectItem>
                  {(selectedPipeline?.stages ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Auto-toewijzen aan (optioneel)</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Niemand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Niemand</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name} <span className="text-xs text-zinc-400">{m.email}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Default opportunity-waarde (optioneel)</Label>
            <div className="relative">
              <Euro className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={leadValue}
                onChange={(e) => setLeadValue(e.target.value)}
                placeholder="0.00"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-zinc-500">
              Wordt automatisch op opportunity.value gezet bij intake.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-zinc-200 p-3">
            <div>
              <Label>Actief</Label>
              <p className="text-xs text-zinc-500">
                Uit = leads vallen terug op page-default / workspace-default.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              saving || !formId || !workspaceId
            }
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {route ? 'Bijwerken' : 'Aanmaken'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
