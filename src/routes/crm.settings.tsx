import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Settings, Save, RotateCcw } from 'lucide-react'
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
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/settings')({
  component: SettingsPage,
})

const DEFAULTS = {
  maxCallAttempts: 3,
  defaultFollowUpDays: 2,
  followUpReminderDays: 2,
}

function SettingsPage() {
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
  return <SettingsForm workspaceId={workspaceId} />
}

function SettingsForm({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const settings = useQuery(api.crmSettings.get, { workspaceId })
  const update = useMutation(api.crmSettings.update)

  const [maxCallAttempts, setMax] = useState(DEFAULTS.maxCallAttempts)
  const [defaultFollowUpDays, setFollowUp] = useState(
    DEFAULTS.defaultFollowUpDays,
  )
  const [followUpReminderDays, setReminder] = useState(
    DEFAULTS.followUpReminderDays,
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) {
      setMax(settings.maxCallAttempts)
      setFollowUp(settings.defaultFollowUpDays)
      setReminder(settings.followUpReminderDays)
    }
  }, [settings])

  function resetToDefaults() {
    setMax(DEFAULTS.maxCallAttempts)
    setFollowUp(DEFAULTS.defaultFollowUpDays)
    setReminder(DEFAULTS.followUpReminderDays)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await update({
        workspaceId,
        maxCallAttempts,
        defaultFollowUpDays,
        followUpReminderDays,
      })
      toast.success('Instellingen opgeslagen')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Opslaan mislukt',
      )
    } finally {
      setSaving(false)
    }
  }

  if (settings === undefined) {
    return <Skeleton className="h-64 w-full" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-500/20 to-zinc-700/20">
          <Settings className="h-4.5 w-4.5 text-zinc-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Instellingen</h1>
          <p className="text-xs text-zinc-500">
            Configuratie voor jouw workspace
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead-flow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Max belpogingen voor lead naar Verloren"
              hint="Bij dit aantal mislukte calls wordt lead automatisch onbereikbaar gemarkeerd en verdwijnt uit dashboard."
              value={maxCallAttempts}
              onChange={setMax}
              min={1}
              max={20}
              suffix="pogingen"
            />
            <Field
              label="Dagen tussen mislukte belpogingen"
              hint="Volgende belpoging wordt N dagen later ingepland (nextFollowUpAt)."
              value={defaultFollowUpDays}
              onChange={setFollowUp}
              min={1}
              max={60}
              suffix="dagen"
            />
            <Field
              label="Reminder-trigger na 'Niet bereikt'"
              hint="Wanneer triggert 'follow_up_due' workflow (bv. SMS naar jezelf). Skipt als lead ondertussen afgehandeld."
              value={followUpReminderDays}
              onChange={setReminder}
              min={1}
              max={60}
              suffix="dagen"
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={resetToDefaults}
            disabled={saving}
          >
            <RotateCcw className="h-4 w-4" />
            Reset naar standaard
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string
  hint: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  suffix: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32"
        />
        <span className="text-sm text-zinc-500">{suffix}</span>
      </div>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  )
}
