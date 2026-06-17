import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { Plus, Trash2, CheckCircle2, RotateCcw, Mail, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

interface Props {
  workspaceId: Id<'workspaces'>
  onMakeBroadcast: (draft: { name: string; subject: string; blocks?: unknown }) => void
}

export function BacklogList({ workspaceId, onMakeBroadcast }: Props) {
  const items = useQuery(api.emailBacklog.list, { workspaceId })
  const seedDefaults = useMutation(api.emailBacklog.seedDefaults)
  const seedBacklogDrafts = useMutation(api.emailBacklog.seedBacklogDrafts)
  const createItem = useMutation(api.emailBacklog.create)
  const setStatus = useMutation(api.emailBacklog.setStatus)
  const removeItem = useMutation(api.emailBacklog.remove)

  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formType, setFormType] = useState('')
  const [formTiming, setFormTiming] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [saving, setSaving] = useState(false)

  if (items === undefined) return <Skeleton className="h-64 w-full" />

  const handleSeed = async () => {
    try {
      const result = await seedDefaults({ workspaceId })
      if (result.seeded === 0) {
        toast.info('Backlog al gevuld — geen duplicaten aangemaakt.')
      } else {
        toast.success(`${result.seeded} standaard-onderwerpen geïmporteerd!`)
      }
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Importeren mislukt'))
    }
  }

  const handleSeedDrafts = async () => {
    try {
      const res = await seedBacklogDrafts({ workspaceId })
      toast.success(`${res.updated} concept-mails toegevoegd`)
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Concept-mails importeren mislukt'))
    }
  }

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      toast.error('Titel is verplicht')
      return
    }
    setSaving(true)
    try {
      await createItem({
        workspaceId,
        title: formTitle.trim(),
        type: formType.trim() || undefined,
        timing: formTiming.trim() || undefined,
        category: formCategory.trim() || undefined,
      })
      toast.success('Onderwerp toegevoegd')
      setFormTitle('')
      setFormType('')
      setFormTiming('')
      setFormCategory('')
      setShowForm(false)
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Aanmaken mislukt'))
    } finally {
      setSaving(false)
    }
  }

  const handleSetStatus = async (
    id: Id<'emailBacklog'>,
    status: 'open' | 'sent',
  ) => {
    try {
      await setStatus({ id, status })
      toast.success(status === 'sent' ? 'Gemarkeerd als verzonden' : 'Heropend')
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Status wijzigen mislukt'))
    }
  }

  const handleRemove = async (id: Id<'emailBacklog'>) => {
    if (!window.confirm('Onderwerp verwijderen?')) return
    try {
      await removeItem({ id })
      toast.success('Verwijderd')
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Verwijderen mislukt'))
    }
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-zinc-500">Nog geen onderwerpen.</p>
            <Button onClick={handleSeed}>
              Importeer 31 standaard-onderwerpen
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Group by category
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const cat = item.category ?? 'Overig'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nieuw onderwerp
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSeedDrafts}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          Importeer concept-mails
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label>Titel *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Onderwerp van de mail"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Type</Label>
                <Input
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  placeholder="bv. Educational"
                />
              </div>
              <div>
                <Label>Timing</Label>
                <Input
                  value={formTiming}
                  onChange={(e) => setFormTiming(e.target.value)}
                  placeholder="bv. Mei-juni"
                />
              </div>
              <div>
                <Label>Categorie</Label>
                <Input
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="bv. Seizoens"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving}>
                Toevoegen
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Annuleren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {category}
          </h2>
          {categoryItems.map((item) => (
            <Card
              key={item._id}
              className={item.status === 'sent' ? 'opacity-60' : ''}
            >
              <CardContent className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{item.title}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1 items-center">
                    {item.type && (
                      <span className="text-xs text-zinc-400 bg-zinc-100 rounded px-1.5 py-0.5">
                        {item.type}
                      </span>
                    )}
                    {item.timing && (
                      <span className="text-xs text-zinc-400">{item.timing}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge
                    variant={item.status === 'sent' ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    {item.status === 'sent' ? 'verzonden' : 'open'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Maak broadcast"
                    onClick={() => onMakeBroadcast({ name: item.title, subject: item.subject || item.title, blocks: item.bodyBlocks })}
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                  {item.status === 'open' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Markeer verzonden"
                      onClick={() => handleSetStatus(item._id, 'sent')}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Heropen"
                      onClick={() => handleSetStatus(item._id, 'open')}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Verwijderen"
                    onClick={() => handleRemove(item._id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  )
}
