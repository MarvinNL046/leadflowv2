import { useState, useMemo } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Search, Plus } from 'lucide-react'
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
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

interface Props {
  workspaceId: Id<'workspaces'>
  pipelineId: Id<'pipelines'>
  firstStageId: Id<'pipelineStages'> | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewOpportunityDialog({
  workspaceId,
  pipelineId,
  firstStageId,
  open,
  onOpenChange,
}: Props) {
  const contacts = useQuery(api.contacts.list, { workspaceId })
  const createOpp = useMutation(api.opportunities.create)

  const [query, setQuery] = useState('')
  const [contactId, setContactId] = useState<Id<'contacts'> | null>(null)
  const [title, setTitle] = useState('Airco-installatie')
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const filtered = useMemo(() => {
    if (!contacts) return []
    const q = query.trim().toLowerCase()
    if (!q) return contacts.slice(0, 8)
    return contacts
      .filter((c) =>
        [c.firstName, c.lastName, c.email, c.phone, c.company, c.city]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(q)),
      )
      .slice(0, 12)
  }, [contacts, query])

  function resetAndClose() {
    setQuery('')
    setContactId(null)
    setTitle('Airco-installatie')
    setValue('')
    onOpenChange(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contactId || !firstStageId) return
    setSubmitting(true)
    try {
      await createOpp({
        workspaceId,
        contactId,
        pipelineId,
        stageId: firstStageId,
        title,
        value: value ? Number(value) : undefined,
      })
      toast.success('Opportunity aangemaakt')
      resetAndClose()
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Kon niet aanmaken'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : resetAndClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe opportunity</DialogTitle>
          <DialogDescription>
            Kies een contact en geef titel + waarde op. Wordt aangemaakt in
            de eerste stage.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact picker */}
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op naam, email, telefoon…"
                className="pl-8"
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-200">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-400">
                  Geen contacts gevonden
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {filtered.map((c) => {
                    const name =
                      [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                      c.email ||
                      c.phone ||
                      'Onbekend'
                    const isSelected = contactId === c._id
                    return (
                      <li key={c._id}>
                        <button
                          type="button"
                          onClick={() => setContactId(c._id)}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50',
                            isSelected && 'bg-blue-50 hover:bg-blue-50',
                          )}
                        >
                          <div className="truncate font-medium text-zinc-900">
                            {name}
                          </div>
                          <div className="truncate text-xs text-zinc-500">
                            {c.email || c.phone || '—'}
                            {c.city && ` · ${c.city}`}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="opp-title">Titel</Label>
            <Input
              id="opp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Value */}
          <div className="space-y-1.5">
            <Label htmlFor="opp-value">Waarde (EUR, optioneel)</Label>
            <Input
              id="opp-value"
              type="number"
              min="0"
              step="50"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="2500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={resetAndClose}
              disabled={submitting}
            >
              Annuleer
            </Button>
            <Button
              type="submit"
              disabled={submitting || !contactId || !title.trim()}
            >
              <Plus className="h-4 w-4" />
              {submitting ? 'Aanmaken…' : 'Aanmaken'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
