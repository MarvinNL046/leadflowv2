import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Route as RouteIcon,
  Plus,
  Trash2,
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
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/settings_/lead-flow')({
  component: LeadFlowSettingsPage,
})

const DEFAULTS = {
  maxCallAttempts: 3,
  defaultFollowUpDays: 2,
  followUpReminderDays: 2,
  customerCallbackDays: 7,
  sendEmailOnUnreachable: false,
  dashboardWindowDays: 90,
}

function LeadFlowSettingsPage() {
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
  return <LeadFlowForm workspaceId={workspaceId} />
}

function LeadFlowForm({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const settings = useQuery(api.crmSettings.get, { workspaceId })
  const update = useMutation(api.crmSettings.update)

  const [maxCallAttempts, setMax] = useState(DEFAULTS.maxCallAttempts)
  const [defaultFollowUpDays, setFollowUp] = useState(
    DEFAULTS.defaultFollowUpDays,
  )
  const [followUpReminderDays, setReminder] = useState(
    DEFAULTS.followUpReminderDays,
  )
  const [customerCallbackDays, setSafetyNet] = useState(
    DEFAULTS.customerCallbackDays,
  )
  const [callbackPresets, setPresets] = useState<
    Array<{ days: number; label: string }>
  >([])
  const [sendEmailOnUnreachable, setSendEmail] = useState(false)
  const [dashboardWindowDays, setWindow] = useState(
    DEFAULTS.dashboardWindowDays,
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) {
      setMax(settings.maxCallAttempts)
      setFollowUp(settings.defaultFollowUpDays)
      setReminder(settings.followUpReminderDays)
      setSafetyNet(settings.customerCallbackDays)
      setPresets(settings.callbackPresets)
      setSendEmail(settings.sendEmailOnUnreachable)
      setWindow(settings.dashboardWindowDays)
    }
  }, [settings])

  function resetToDefaults() {
    setMax(DEFAULTS.maxCallAttempts)
    setFollowUp(DEFAULTS.defaultFollowUpDays)
    setReminder(DEFAULTS.followUpReminderDays)
    setSafetyNet(DEFAULTS.customerCallbackDays)
    setPresets([])
    setSendEmail(false)
    setWindow(DEFAULTS.dashboardWindowDays)
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
        customerCallbackDays,
        callbackPresets,
        sendEmailOnUnreachable,
        dashboardWindowDays,
      })
      toast.success('Instellingen opgeslagen')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
    } finally {
      setSaving(false)
    }
  }

  if (settings === undefined) {
    return <Skeleton className="h-64 w-full" />
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100">
            <RouteIcon className="h-4.5 w-4.5 text-cyan-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Lead-flow</h1>
            <p className="text-xs text-zinc-500">
              3-strike regel + follow-up timing voor deze workspace
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drempelwaarden</CardTitle>
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
            <div className="space-y-1.5">
              <Label>Auto-afscheidsmail bij 3-strike</Label>
              <div>
                <button
                  type="button"
                  onClick={() => setSendEmail((v) => !v)}
                  className={
                    sendEmailOnUnreachable
                      ? 'rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700'
                      : 'rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50'
                  }
                  aria-pressed={sendEmailOnUnreachable}
                >
                  {sendEmailOnUnreachable ? 'Aan' : 'Uit'}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Stuurt automatisch de "Afscheidsmail (Deal Verloren)"-template
                wanneer een lead na {maxCallAttempts} mislukte belpogingen
                onbereikbaar wordt (alleen als er een e-mailadres is). Let op:
                gebruik dit óf hier óf via een "onbereikbaar"-workflow met
                e-mail — niet allebei (dubbele mail).
              </p>
            </div>
            <Field
              label="Dashboard-venster"
              hint="Nooit-opgevolgde leads ouder dan dit aantal dagen verdwijnen van het speed-to-lead-dashboard (ze blijven in de pipeline). Leads met een openstaande follow-up blijven altijd zichtbaar."
              value={dashboardWindowDays}
              onChange={setWindow}
              min={7}
              max={730}
              suffix="dagen"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Terugbel-knoppen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-500">
              De knoppen die verschijnen bij "Bel → opgenomen → bel later".
              Leeg = standaardlijst.
            </p>
            <div className="space-y-2">
              {callbackPresets.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={p.days}
                    onChange={(e) =>
                      setPresets((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? { ...x, days: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-zinc-500">dagen</span>
                  <Input
                    value={p.label}
                    maxLength={40}
                    placeholder="Label (bv. Over een week)"
                    onChange={(e) =>
                      setPresets((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPresets((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Knop verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {callbackPresets.length < 8 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPresets((prev) => [...prev, { days: 7, label: '' }])
                }
              >
                <Plus className="h-4 w-4" />
                Knop toevoegen
              </Button>
            )}
            <Field
              label="Safety-net 'klant belt zelf terug' (dagen)"
              hint="Als een klant zegt zelf terug te bellen, wordt na N dagen toch een follow-up ingepland zodat de lead niet verdwijnt."
              value={customerCallbackDays}
              onChange={setSafetyNet}
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
