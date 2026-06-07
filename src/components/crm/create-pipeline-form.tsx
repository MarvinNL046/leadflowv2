import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export function CreatePipelineForm({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>
}) {
  const create = useMutation(api.pipelines.createPipeline)
  const [name, setName] = useState('Sales')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await create({ workspaceId, name: trimmed })
      toast.success('Pipeline aangemaakt')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Aanmaken mislukt'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm items-center gap-2"
    >
      <Input
        value={name}
        maxLength={80}
        placeholder="Pipeline-naam (bijv. Sales)"
        onChange={(e) => setName(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" disabled={saving || !name.trim()}>
        <Plus className="h-4 w-4" />
        {saving ? 'Aanmaken…' : 'Pipeline aanmaken'}
      </Button>
    </form>
  )
}
