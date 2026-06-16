import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { RichTextEditor } from './rich-text-editor.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

type Template = {
  _id: Id<'emailTemplates'>
  name: string
  subject: string
  body: string
  description?: string
  isSystem: boolean
}

interface TemplateEditorProps {
  initial?: Template
  workspaceId: Id<'workspaces'>
  onDone: () => void
}

function TemplateEditor({ initial, workspaceId, onDone }: TemplateEditorProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [busy, setBusy] = useState(false)

  const create = useMutation(api.emailTemplates.create)
  const update = useMutation(api.emailTemplates.update)

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Naam is verplicht'); return }
    if (!subject.trim()) { toast.error('Onderwerp is verplicht'); return }
    if (!body.trim()) { toast.error('Body is verplicht'); return }

    setBusy(true)
    try {
      if (initial) {
        await update({ templateId: initial._id, name, subject, body })
      } else {
        await create({ workspaceId, name, subject, body })
      }
      toast.success(initial ? 'Template bijgewerkt' : 'Template aangemaakt')
      onDone()
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Opslaan mislukt'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
      <div>
        <Label>Naam</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="bv. Welkomstmail"
        />
      </div>
      <div>
        <Label>Onderwerp</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="bv. Welkom bij StayCool Airco"
        />
      </div>
      <div>
        <Label>Body</Label>
        <RichTextEditor value={body} onChange={setBody} />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={busy}>
          <Check className="mr-1 h-4 w-4" />
          {initial ? 'Bijwerken' : 'Opslaan'}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          <X className="mr-1 h-4 w-4" />
          Annuleren
        </Button>
      </div>
    </div>
  )
}

export function TemplateList({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const templates = useQuery(api.emailTemplates.list, { workspaceId })
  const remove = useMutation(api.emailTemplates.remove)

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<Id<'emailTemplates'> | null>(null)

  if (templates === undefined) return <Skeleton className="h-48 w-full" />

  return (
    <div className="space-y-4">
      {!creating && editingId === null && (
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nieuw template
        </Button>
      )}

      {creating && (
        <TemplateEditor
          workspaceId={workspaceId}
          onDone={() => setCreating(false)}
        />
      )}

      {templates.length === 0 && !creating && (
        <Card>
          <CardContent className="p-6 text-sm text-zinc-500">
            Nog geen templates. Klik op "Nieuw template" om er één aan te maken.
          </CardContent>
        </Card>
      )}

      {templates.map((t) => {
        const isEditing = editingId === t._id

        if (isEditing) {
          return (
            <TemplateEditor
              key={t._id}
              initial={t}
              workspaceId={workspaceId}
              onDone={() => setEditingId(null)}
            />
          )
        }

        return (
          <Card key={t._id}>
            <CardContent className="flex items-start justify-between p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-zinc-500">{t.subject}</p>
                {t.description && (
                  <p className="mt-1 text-xs text-zinc-400">{t.description}</p>
                )}
              </div>
              <div className="ml-4 flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Bewerken"
                  onClick={() => {
                    setCreating(false)
                    setEditingId(t._id)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Verwijderen"
                  onClick={async () => {
                    if (!window.confirm(`Template "${t.name}" verwijderen?`)) return
                    try {
                      await remove({ templateId: t._id })
                      toast.success('Template verwijderd')
                    } catch (e) {
                      toast.error(humanizeConvexError(e, 'Verwijderen mislukt'))
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
