import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Plus, Trash2 } from "@/components/icons"
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

type Condition = { field: string; op: string; value: string }
const FIELDS = [
  { key: 'tags', label: 'Tag', ops: ['contains'] },
  { key: 'city', label: 'Plaats', ops: ['eq', 'neq'] },
  { key: 'province', label: 'Provincie', ops: ['eq', 'neq'] },
  { key: 'source', label: 'Bron', ops: ['eq', 'neq'] },
  { key: 'stage', label: 'Pipeline-stage', ops: ['eq', 'neq'] },
  { key: 'callCount', label: 'Belpogingen', ops: ['eq', 'gt', 'lt'] },
]

export function SegmentBuilder({
  workspaceId,
  onDone,
}: {
  workspaceId: Id<'workspaces'>
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [match, setMatch] = useState<'all' | 'any'>('all')
  const [conditions, setConditions] = useState<Condition[]>([
    { field: 'tags', op: 'contains', value: '' },
  ])
  const create = useMutation(api.segments.create)

  // Coerce numerieke velden naar number voor de preview/rules.
  const rules = {
    match,
    conditions: conditions
      .filter((c) => c.value !== '')
      .map((c) => ({
        field: c.field,
        op: c.op,
        value: c.field === 'callCount' ? Number(c.value) : c.value,
      })),
  }
  const preview = useQuery(api.segments.preview, { workspaceId, rules })

  const setCond = (i: number, patch: Partial<Condition>) =>
    setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const save = async () => {
    if (!name.trim()) return toast.error('Geef het segment een naam')
    try {
      await create({ workspaceId, name: name.trim(), rules })
      toast.success('Segment opgeslagen')
      onDone()
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Opslaan mislukt'))
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
      <div>
        <Label>Naam</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Klanten Limburg" />
      </div>

      <div className="flex items-center gap-2 text-sm">
        Match
        <select
          className="rounded border px-2 py-1"
          value={match}
          onChange={(e) => setMatch(e.target.value as 'all' | 'any')}
        >
          <option value="all">alle</option>
          <option value="any">één van</option>
        </select>
        van de volgende:
      </div>

      {conditions.map((c, i) => {
        const field = FIELDS.find((f) => f.key === c.field) ?? FIELDS[0]
        return (
          <div key={i} className="flex items-center gap-2">
            <select className="rounded border px-2 py-1 text-sm" value={c.field}
              onChange={(e) => setCond(i, { field: e.target.value, op: FIELDS.find((f) => f.key === e.target.value)!.ops[0] })}>
              {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select className="rounded border px-2 py-1 text-sm" value={c.op}
              onChange={(e) => setCond(i, { op: e.target.value })}>
              {field.ops.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            <Input className="flex-1" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
            <Button variant="ghost" size="icon" onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button variant="outline" size="sm"
        onClick={() => setConditions((cs) => [...cs, { field: 'tags', op: 'contains', value: '' }])}>
        <Plus className="mr-1 h-4 w-4" /> Conditie
      </Button>

      <div className="rounded bg-zinc-50 p-3 text-sm">
        {preview === undefined ? 'Berekenen…' : (
          <>
            <strong>{preview.count}{preview.capped ? '+' : ''}</strong> contacten matchen
            {preview.capped && <span className="text-zinc-400"> (steekproef — exact aantal bij verzenden)</span>}.
            {preview.sample.length > 0 && (
              <span className="text-zinc-500"> Bv. {preview.sample.slice(0, 3).map((s) => s.name || s.email).join(', ')}…</span>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={save}>Segment opslaan</Button>
        <Button variant="ghost" onClick={onDone}>Annuleren</Button>
      </div>
    </div>
  )
}
