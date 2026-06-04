import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useAction } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, Bot, Save, RotateCcw, Zap } from 'lucide-react'
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
import { Switch } from '#/components/ui/switch.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/settings_/ai-agent')({
  component: AiAgentSettingsPage,
})

type ChannelOption = 'whatsapp' | 'sms' | 'email'

const CHANNEL_LABELS: Record<ChannelOption, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'E-mail',
}

const DEFAULTS = {
  enabled: false,
  mode: 'suggest' as 'off' | 'suggest' | 'auto',
  channelOrder: ['sms', 'email'] as ChannelOption[],
  bookingUrl: 'https://afspraken.staycoolairco.nl/',
  model: 'claude-sonnet-4-6',
  tone: 'vriendelijk, professioneel, kort, Nederlands',
  signature: 'Met vriendelijke groet, StayCool Airconditioning',
  businessContext: '',
  whatsappTemplateName: '',
  quietHoursStart: 21,
  quietHoursEnd: 8,
  dailyCap: 200,
}

function AiAgentSettingsPage() {
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
  return <AiAgentForm workspaceId={workspaceId} />
}

function AiAgentForm({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const config = useQuery(api.aiAgentConfig.get, { workspaceId })
  const update = useMutation(api.aiAgentConfig.update)
  const doPreview = useAction(api.aiLeadResponse.previewMessage)

  // Form state
  const [enabled, setEnabled] = useState(DEFAULTS.enabled)
  const [mode, setMode] = useState<'off' | 'suggest' | 'auto'>(DEFAULTS.mode)
  const [channelOrder, setChannelOrder] = useState<ChannelOption[]>(
    DEFAULTS.channelOrder,
  )
  const [bookingUrl, setBookingUrl] = useState(DEFAULTS.bookingUrl)
  const [model, setModel] = useState(DEFAULTS.model)
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [businessContext, setBusinessContext] = useState(
    DEFAULTS.businessContext,
  )
  const [tone, setTone] = useState(DEFAULTS.tone)
  const [signature, setSignature] = useState(DEFAULTS.signature)
  const [whatsappTemplateName, setWhatsappTemplateName] = useState(
    DEFAULTS.whatsappTemplateName,
  )
  const [quietHoursStart, setQuietHoursStart] = useState(
    DEFAULTS.quietHoursStart,
  )
  const [quietHoursEnd, setQuietHoursEnd] = useState(DEFAULTS.quietHoursEnd)
  const [dailyCap, setDailyCap] = useState(DEFAULTS.dailyCap)
  const [saving, setSaving] = useState(false)

  // Preview state
  const [previewing, setPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Sync form with loaded config
  useEffect(() => {
    if (!config) return
    setEnabled(config.enabled)
    setMode(config.mode)
    setChannelOrder(config.channelOrder as ChannelOption[])
    setBookingUrl(config.bookingUrl)
    setModel(config.model)
    setBusinessContext(config.businessContext ?? '')
    setTone(config.tone ?? DEFAULTS.tone)
    setSignature(config.signature ?? DEFAULTS.signature)
    setWhatsappTemplateName(config.whatsappTemplateName ?? '')
    setQuietHoursStart(config.quietHoursStart ?? DEFAULTS.quietHoursStart)
    setQuietHoursEnd(config.quietHoursEnd ?? DEFAULTS.quietHoursEnd)
    setDailyCap(config.dailyCap ?? DEFAULTS.dailyCap)
  }, [config])

  function setChannelAt(index: number, value: ChannelOption) {
    setChannelOrder((prev) => {
      const next = [...prev] as ChannelOption[]
      next[index] = value
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await update({
        workspaceId,
        enabled,
        mode,
        channelOrder,
        bookingUrl,
        model,
        businessContext: businessContext || undefined,
        tone: tone || undefined,
        signature: signature || undefined,
        whatsappTemplateName: whatsappTemplateName || undefined,
        quietHoursStart,
        quietHoursEnd,
        dailyCap,
        ...(anthropicApiKey ? { anthropicApiKey } : {}),
      })
      setAnthropicApiKey('')
      toast.success('Instellingen opgeslagen')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
    } finally {
      setSaving(false)
    }
  }

  async function handlePreview() {
    if (previewing) return
    setPreviewing(true)
    setPreviewResult(null)
    setPreviewError(null)
    try {
      const result = await doPreview({ workspaceId })
      if (result.error) {
        setPreviewError(result.error)
      } else {
        setPreviewResult(result.text ?? '(leeg)')
      }
    } catch (err) {
      setPreviewError(humanizeConvexError(err, 'Preview mislukt'))
    } finally {
      setPreviewing(false)
    }
  }

  if (config === undefined) {
    return <Skeleton className="h-64 w-full" />
  }

  const channelOptions: ChannelOption[] = ['whatsapp', 'sms', 'email']

  return (
    <div className="space-y-6">
      {/* Header */}
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
            <Bot className="h-4.5 w-4.5 text-violet-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">AI-agent</h1>
            <p className="text-xs text-zinc-500">
              Automatische eerste reactie op nieuwe leads (speed-to-lead)
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Aan/uit + modus */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activatie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Agent ingeschakeld</Label>
                <p className="text-xs text-zinc-500">
                  Schakel de automatische lead-reactie aan of uit.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mode">Modus</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger id="mode" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Uit</SelectItem>
                  <SelectItem value="suggest">Concept (handmatig goedkeuren)</SelectItem>
                  <SelectItem value="auto">Automatisch versturen</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                <strong>Concept:</strong> AI maakt een draft die jij goedkeurt.{' '}
                <strong>Automatisch:</strong> bericht gaat direct — let op quiet-hours + dagcap.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Kanaalvolgorde */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kanaalvolgorde</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-500">
              Eerste kanaal met geldig contactgegeven wint. WhatsApp vereist
              een template-naam.
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-center text-sm font-medium text-zinc-400">
                  {i + 1}
                </span>
                <Select
                  value={channelOrder[i] ?? channelOptions[i]}
                  onValueChange={(v) => setChannelAt(i, v as ChannelOption)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channelOptions.map((ch) => (
                      <SelectItem key={ch} value={ch}>
                        {CHANNEL_LABELS[ch]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="whatsappTemplateName">
                WhatsApp template-naam
              </Label>
              <Input
                id="whatsappTemplateName"
                value={whatsappTemplateName}
                onChange={(e) => setWhatsappTemplateName(e.target.value)}
                placeholder="bv. welkom_airco_nl"
                className="max-w-xs"
              />
              <p className="text-xs text-zinc-500">
                Verplicht als WhatsApp in de kanaalvolgorde staat.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Anthropic + model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI-model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="anthropicApiKey">Anthropic API-key</Label>
              <Input
                id="anthropicApiKey"
                type="password"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder={
                  config.hasApiKey
                    ? '••• gezet — leeg laten = niet wijzigen'
                    : 'sk-ant-…'
                }
                className="max-w-sm font-mono"
                autoComplete="off"
              />
              {config.hasApiKey && (
                <p className="text-xs text-emerald-600">
                  Key is ingesteld. Vul alleen in als je 'm wilt wijzigen.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-sonnet-4-6">
                    claude-sonnet-4-6 (aanbevolen)
                  </SelectItem>
                  <SelectItem value="claude-haiku-4-5">
                    claude-haiku-4-5 (snel + goedkoop)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Promptinstellingen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bericht-instelling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bookingUrl">Afspraak-URL</Label>
              <Input
                id="bookingUrl"
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                placeholder="https://afspraken.staycoolairco.nl/"
                className="max-w-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="businessContext">Bedrijfscontext</Label>
              <textarea
                id="businessContext"
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                rows={3}
                placeholder="bv. StayCool Airconditioning — specialist in airco-installatie in Limburg, F-gas gecertificeerd, partners: Daikin, Mitsubishi, Toshiba"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <p className="text-xs text-zinc-500">
                Korte omschrijving van het bedrijf die het AI-model als context
                krijgt.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tone">Toon</Label>
              <textarea
                id="tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                rows={2}
                placeholder="bv. vriendelijk, professioneel, kort, Nederlands"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signature">Afsluiting / handtekening</Label>
              <textarea
                id="signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                rows={2}
                placeholder="bv. Met vriendelijke groet, StayCool Airconditioning"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Guardrails */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guardrails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="quietHoursStart">Stilte vanaf (uur)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="quietHoursStart"
                    type="number"
                    min={0}
                    max={23}
                    value={quietHoursStart}
                    onChange={(e) =>
                      setQuietHoursStart(Number(e.target.value))
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-zinc-500">u</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quietHoursEnd">Stilte tot (uur)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="quietHoursEnd"
                    type="number"
                    min={0}
                    max={23}
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(Number(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-sm text-zinc-500">u</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dailyCap">Dagcap (auto-modus)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="dailyCap"
                    type="number"
                    min={1}
                    max={10000}
                    value={dailyCap}
                    onChange={(e) => setDailyCap(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-zinc-500">berichten/dag</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              Quiet-hours en dagcap gelden alleen in auto-modus. Berichten
              buiten het stille venster worden uitgesteld (niet overgeslagen).
            </p>
          </CardContent>
        </Card>

        {/* Test-bericht knop */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test bericht genereren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-500">
              Genereert een voorbeeld-bericht met dummy-lead Pascal Hendriks
              uit Reuver. Vereist een ingestelde Anthropic-key.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={previewing}
            >
              <Zap className="h-4 w-4" />
              {previewing ? 'Genereren…' : 'Test bericht genereren'}
            </Button>

            {previewError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-sm text-red-700">{previewError}</p>
              </div>
            )}
            {previewResult && (
              <div className="rounded-md bg-zinc-50 border border-zinc-200 px-3 py-3">
                <p className="mb-1 text-xs font-medium text-zinc-500">
                  Gegenereerd voorbeeld:
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-800">
                  {previewResult}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (!config) return
              setEnabled(config.enabled)
              setMode(config.mode)
              setChannelOrder(config.channelOrder as ChannelOption[])
              setBookingUrl(config.bookingUrl)
              setModel(config.model)
              setBusinessContext(config.businessContext ?? '')
              setTone(config.tone ?? DEFAULTS.tone)
              setSignature(config.signature ?? DEFAULTS.signature)
              setWhatsappTemplateName(config.whatsappTemplateName ?? '')
              setQuietHoursStart(config.quietHoursStart ?? DEFAULTS.quietHoursStart)
              setQuietHoursEnd(config.quietHoursEnd ?? DEFAULTS.quietHoursEnd)
              setDailyCap(config.dailyCap ?? DEFAULTS.dailyCap)
              setAnthropicApiKey('')
            }}
            disabled={saving}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
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
