import { useState, useEffect } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Mail,
  MessageSquare,
  MessageCircle,
  Clock,
  Zap,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { cn } from '#/lib/utils.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

type TriggerType =
  | 'contact_created'
  | 'opportunity_won'
  | 'opportunity_lost'
  | 'lead_unreachable'
  | 'follow_up_due'

interface Props {
  workspaceId: Id<'workspaces'>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Als gepaseerd: edit-mode i.p.v. create. */
  editing?: {
    workflowId: Id<'workflows'>
    name: string
    description?: string
    triggerType: TriggerType
    nodes: BuilderNode[]
  }
}

type BuilderNode =
  | { type: 'delay'; delaySeconds: number }
  | {
      type: 'action'
      subType: 'send_email'
      subject: string
      body: string
    }
  | { type: 'action'; subType: 'send_sms'; body: string }
  | { type: 'action'; subType: 'send_whatsapp'; body: string }

const TRIGGER_OPTIONS: Array<{ value: TriggerType; label: string; desc: string }> = [
  {
    value: 'contact_created',
    label: 'Nieuw contact',
    desc: 'Vuur wanneer een lead binnenkomt (Meta, website-form, handmatig)',
  },
  {
    value: 'opportunity_won',
    label: 'Opportunity gewonnen',
    desc: 'Vuur wanneer een opp naar Gewonnen-stage wordt gesleept',
  },
  {
    value: 'opportunity_lost',
    label: 'Opportunity verloren',
    desc: 'Vuur wanneer een opp naar Verloren-stage wordt gesleept (incl. ongeldig nummer, buiten gebied, niet geïnteresseerd)',
  },
  {
    value: 'lead_unreachable',
    label: 'Lead onbereikbaar (3x niet bereikt)',
    desc: 'Specifiek na 3e mislukte belpoging. Bv. excuus-WhatsApp naar klant',
  },
  {
    value: 'follow_up_due',
    label: 'Follow-up klaar (2d na niet bereikt)',
    desc: 'Vuurt 2 dagen na "Niet bereikt"-actie ALS lead nog open is. Bv. reminder-SMS naar jezelf',
  },
]

const NODE_TEMPLATES: Record<
  string,
  { label: string; icon: typeof Mail; make: () => BuilderNode }
> = {
  delay: {
    label: 'Wacht',
    icon: Clock,
    make: () => ({ type: 'delay', delaySeconds: 180 }),
  },
  email: {
    label: 'Email',
    icon: Mail,
    make: () => ({
      type: 'action',
      subType: 'send_email',
      subject: 'Bedankt voor je aanvraag',
      body: 'Hoi {{contact.firstName}},\n\n',
    }),
  },
  sms: {
    label: 'SMS',
    icon: MessageSquare,
    make: () => ({
      type: 'action',
      subType: 'send_sms',
      body: 'Hoi {{contact.firstName}}, bedankt voor je aanvraag.',
    }),
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    make: () => ({
      type: 'action',
      subType: 'send_whatsapp',
      body: 'Hoi {{contact.firstName}}! 👋',
    }),
  },
}

export function NewWorkflowDialog({
  workspaceId,
  open,
  onOpenChange,
  editing,
}: Props) {
  const create = useMutation(api.workflows.createLinear)
  const replace = useMutation(api.workflows.replaceContent)
  const isEditing = !!editing
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [triggerType, setTriggerType] = useState<TriggerType>(
    editing?.triggerType ?? 'contact_created',
  )
  const [nodes, setNodes] = useState<BuilderNode[]>(
    editing?.nodes ?? [
      NODE_TEMPLATES.delay.make(),
      NODE_TEMPLATES.whatsapp.make(),
    ],
  )
  const [activate, setActivate] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Resync wanneer editing-prop wijzigt (b.v. ander workflow geopend)
  useEffect(() => {
    if (editing) {
      setName(editing.name)
      setDescription(editing.description ?? '')
      setTriggerType(editing.triggerType)
      setNodes(editing.nodes)
    }
  }, [editing])

  function reset() {
    if (!isEditing) {
      setName('')
      setDescription('')
      setTriggerType('contact_created')
      setNodes([NODE_TEMPLATES.delay.make(), NODE_TEMPLATES.whatsapp.make()])
      setActivate(true)
    }
    onOpenChange(false)
  }

  function addNode(templateKey: keyof typeof NODE_TEMPLATES) {
    setNodes((prev) => [...prev, NODE_TEMPLATES[templateKey].make()])
  }

  function removeNode(idx: number) {
    setNodes((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateNode(idx: number, patch: Partial<BuilderNode>) {
    setNodes((prev) =>
      prev.map((n, i) => (i === idx ? ({ ...n, ...patch } as BuilderNode) : n)),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      if (isEditing) {
        await replace({
          workflowId: editing.workflowId,
          name,
          description: description || undefined,
          triggerType,
          nodes,
        })
        toast.success(`Workflow "${name}" bijgewerkt`)
      } else {
        await create({
          workspaceId,
          name,
          description: description || undefined,
          triggerType,
          nodes,
          activate,
        })
        toast.success(`Workflow "${name}" aangemaakt`)
      }
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kon niet opslaan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : reset())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            {isEditing ? 'Workflow bewerken' : 'Nieuwe workflow'}
          </DialogTitle>
          <DialogDescription>
            Lineair: trigger → nodes in volgorde. Bij edit van een lopende
            workflow: actieve executions die pauseren kunnen falen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wf-name">Naam</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Welkom Email"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-trigger">Trigger</Label>
            <select
              id="wf-trigger"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as TriggerType)}
              className="block h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              {TRIGGER_OPTIONS.find((t) => t.value === triggerType)?.desc}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-desc">Beschrijving (optioneel)</Label>
            <Input
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Wat doet deze workflow?"
            />
          </div>

          {/* Nodes */}
          <div className="space-y-2">
            <Label>Nodes (sequentieel)</Label>
            <ul className="space-y-2">
              {nodes.map((node, idx) => (
                <NodeRow
                  key={idx}
                  index={idx}
                  node={node}
                  onChange={(patch) => updateNode(idx, patch)}
                  onRemove={() => removeNode(idx)}
                />
              ))}
            </ul>

            <div className="flex flex-wrap gap-2 pt-1">
              {(Object.keys(NODE_TEMPLATES) as Array<
                keyof typeof NODE_TEMPLATES
              >).map((key) => {
                const t = NODE_TEMPLATES[key]
                const Icon = t.icon
                return (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addNode(key)}
                  >
                    <Plus className="h-3 w-3" />
                    <Icon className="h-3 w-3" />
                    {t.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Activate (alleen bij create) */}
          {!isEditing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600"
              />
              <span>Direct activeren (anders status=draft)</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={reset}
              disabled={submitting}
            >
              Annuleer
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || nodes.length === 0 || name.trim().length === 0
              }
            >
              <Plus className="h-4 w-4" />
              {submitting
                ? isEditing
                  ? 'Opslaan…'
                  : 'Aanmaken…'
                : isEditing
                  ? 'Wijzigingen opslaan'
                  : 'Workflow aanmaken'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NodeRow({
  index,
  node,
  onChange,
  onRemove,
}: {
  index: number
  node: BuilderNode
  onChange: (patch: Partial<BuilderNode>) => void
  onRemove: () => void
}) {
  const meta =
    node.type === 'delay'
      ? NODE_TEMPLATES.delay
      : node.subType === 'send_email'
        ? NODE_TEMPLATES.email
        : node.subType === 'send_sms'
          ? NODE_TEMPLATES.sms
          : NODE_TEMPLATES.whatsapp
  const Icon = meta.icon

  return (
    <li className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-400">#{index + 1}</span>
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
        <span className="text-sm font-medium text-zinc-700">{meta.label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="ml-auto h-6 w-6 p-0 text-zinc-400 hover:text-red-600"
          title="Node verwijderen"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {node.type === 'delay' && (
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs text-zinc-500">
            Vertraging
          </Label>
          <Input
            type="number"
            min="1"
            value={node.delaySeconds}
            onChange={(e) =>
              onChange({
                type: 'delay',
                delaySeconds: Number(e.target.value),
              })
            }
            className="h-8 w-32"
          />
          <span className="text-xs text-zinc-500">seconden</span>
        </div>
      )}

      {node.type === 'action' && node.subType === 'send_email' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-zinc-500">Onderwerp</Label>
            <Input
              value={node.subject}
              onChange={(e) =>
                onChange({
                  type: 'action',
                  subType: 'send_email',
                  subject: e.target.value,
                  body: node.body,
                })
              }
              className="h-8"
            />
          </div>
          <NodeBodyTextarea
            value={node.body}
            onChange={(v) =>
              onChange({
                type: 'action',
                subType: 'send_email',
                subject: node.subject,
                body: v,
              })
            }
            rows={4}
          />
        </div>
      )}

      {node.type === 'action' &&
        (node.subType === 'send_sms' || node.subType === 'send_whatsapp') && (
          <NodeBodyTextarea
            value={node.body}
            onChange={(v) =>
              onChange({
                type: 'action',
                subType: node.subType,
                body: v,
              } as BuilderNode)
            }
            rows={node.subType === 'send_sms' ? 2 : 3}
            showCharCount={node.subType === 'send_sms'}
          />
        )}
    </li>
  )
}

function NodeBodyTextarea({
  value,
  onChange,
  rows,
  showCharCount = false,
}: {
  value: string
  onChange: (v: string) => void
  rows: number
  showCharCount?: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-zinc-500">Bericht</Label>
        {showCharCount && (
          <span
            className={cn(
              'text-xs',
              value.length > 160
                ? 'font-medium text-red-600'
                : 'text-zinc-400',
            )}
          >
            {value.length}/160
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="block w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        placeholder="Gebruik {{contact.firstName}} voor personalisatie"
      />
    </div>
  )
}
