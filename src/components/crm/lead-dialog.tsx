import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import {
  AlertCircle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  MapPinOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  ThumbsDown,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IncomingLead } from './lead-card'

interface LeadDialogProps {
  lead: IncomingLead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DialogView = 'main' | 'answered_options' | 'callback_options'

export function LeadDialog({ lead, open, onOpenChange }: LeadDialogProps) {
  const [processing, setProcessing] = useState<string | null>(null)
  const [view, setView] = useState<DialogView>('main')
  const recordCallNoAnswer = useMutation(api.contacts.recordCallNoAnswer)
  const recordCallAnswered = useMutation(api.contacts.recordCallAnswered)
  const markInvalidNumber = useMutation(api.contacts.markInvalidNumber)
  const markOutsideArea = useMutation(api.contacts.markOutsideArea)

  if (!lead) return null

  const displayName =
    [lead.firstName, lead.lastName].filter(Boolean).join(' ') ||
    lead.email ||
    'Onbekend'

  function handleClose(open: boolean) {
    if (!open) {
      setView('main')
      setProcessing(null)
    }
    onOpenChange(open)
  }

  async function runAction(
    label: string,
    action: () => Promise<unknown>,
    successMsg: string,
  ) {
    setProcessing(label)
    try {
      await action()
      toast.success(successMsg)
      handleClose(false)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Actie mislukt'))
    } finally {
      setProcessing(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {view !== 'main' && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-8 w-8 p-0"
                onClick={() =>
                  setView(view === 'callback_options' ? 'answered_options' : 'main')
                }
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-500">
              <Phone className="h-5 w-5 text-white" />
            </div>
            <span>{displayName}</span>
          </DialogTitle>
          <DialogDescription className="flex flex-col gap-1 pt-2">
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-green-500/10 to-emerald-500/10 px-3 py-2 text-base font-bold text-green-700 hover:from-green-500/20 hover:to-emerald-500/20"
              >
                <Phone className="h-4 w-4" />
                {lead.phone}
              </a>
            )}
            <div className="text-xs text-zinc-500 space-y-0.5">
              {lead.email && <div>{lead.email}</div>}
              {lead.city && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lead.city}
                </div>
              )}
              {lead.callCount > 0 && (
                <div>Eerder gebeld: {lead.callCount}×</div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {view === 'main' && (
          <MainView
            lead={lead}
            processing={processing}
            onOutsideArea={() =>
              runAction(
                'outside',
                () => markOutsideArea({ contactId: lead._id as Id<'contacts'> }),
                'Gemarkeerd buiten werkgebied',
              )
            }
            onAnswered={() => setView('answered_options')}
            onNotAnswered={() =>
              runAction(
                'not_answered',
                () =>
                  recordCallNoAnswer({
                    contactId: lead._id as Id<'contacts'>,
                  }),
                'Niet bereikt — volgende belpoging ingepland',
              )
            }
            onInvalid={() =>
              runAction(
                'invalid',
                () =>
                  markInvalidNumber({
                    contactId: lead._id as Id<'contacts'>,
                  }),
                'Nummer gemarkeerd als ongeldig',
              )
            }
            onCancel={() => handleClose(false)}
          />
        )}

        {view === 'answered_options' && (
          <AnsweredOptionsView
            processing={processing}
            onScheduleNow={() =>
              runAction(
                'schedule_now',
                () =>
                  recordCallAnswered({
                    contactId: lead._id as Id<'contacts'>,
                    outcome: 'appointment',
                  }),
                'Afspraak vastgelegd — opp naar Voorstel-stage',
              )
            }
            onCallbackLater={() => setView('callback_options')}
            onCustomerWillCallback={() =>
              runAction(
                'customer_will_callback',
                () =>
                  recordCallAnswered({
                    contactId: lead._id as Id<'contacts'>,
                    outcome: 'customer_will_callback',
                  }),
                'Klant belt zelf terug — 7-dag safety-net follow-up',
              )
            }
            onNotInterested={() =>
              runAction(
                'not_interested',
                () =>
                  recordCallAnswered({
                    contactId: lead._id as Id<'contacts'>,
                    outcome: 'not_interested',
                  }),
                'Niet geïnteresseerd — opp gesloten als Verloren',
              )
            }
          />
        )}

        {view === 'callback_options' && (
          <CallbackOptionsView
            processing={processing}
            onPick={(days) =>
              runAction(
                `callback_${days}d`,
                () =>
                  recordCallAnswered({
                    contactId: lead._id as Id<'contacts'>,
                    outcome: 'callback',
                    followUpAt: Date.now() + days * 24 * 60 * 60 * 1000,
                  }),
                `Terugbel-afspraak vastgelegd over ${days} ${days === 1 ? 'dag' : 'dagen'}`,
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Main — 4 hoofd-acties + cancel. Geen email/SMS verstuurd; mutations
// markeren alleen state in Convex. Sub-text per knop maakt dat expliciet.
// ────────────────────────────────────────────────────────────────────────

function MainView({
  lead,
  processing,
  onOutsideArea,
  onAnswered,
  onNotAnswered,
  onInvalid,
  onCancel,
}: {
  lead: IncomingLead
  processing: string | null
  onOutsideArea: () => void
  onAnswered: () => void
  onNotAnswered: () => void
  onInvalid: () => void
  onCancel: () => void
}) {
  return (
    <div className="grid gap-2 pt-2">
      <ActionButton
        icon={MapPinOff}
        title="Buiten werkgebied"
        subtitle="Markeert contact als buiten werkgebied. Geen bericht verstuurd."
        color="orange"
        disabled={processing !== null}
        onClick={onOutsideArea}
      />

      <ActionButton
        icon={CheckCircle2}
        title="Heeft opgenomen"
        subtitle="Open vervolgopties: afspraak / terugbellen / niet geïnteresseerd"
        color="green"
        primary
        disabled={processing !== null}
        onClick={onAnswered}
      />

      <ActionButton
        icon={PhoneOff}
        title="Niet opgenomen"
        subtitle={`Bumpt callCount naar ${lead.callCount + 1}. Volgende belpoging ingepland.`}
        color="amber"
        disabled={processing !== null}
        onClick={onNotAnswered}
      />

      <ActionButton
        icon={AlertCircle}
        title="Ongeldig nummer"
        subtitle="Telefoonnummer onjuist. Lead naar Verloren-stage."
        color="red"
        disabled={processing !== null}
        onClick={onInvalid}
      />

      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={processing !== null}
        className="h-10 text-zinc-500"
      >
        <X className="h-4 w-4" />
        Annuleren
      </Button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Answered options — klant heeft opgenomen, wat nu?
// ────────────────────────────────────────────────────────────────────────

function AnsweredOptionsView({
  processing,
  onScheduleNow,
  onCallbackLater,
  onCustomerWillCallback,
  onNotInterested,
}: {
  processing: string | null
  onScheduleNow: () => void
  onCallbackLater: () => void
  onCustomerWillCallback: () => void
  onNotInterested: () => void
}) {
  return (
    <div className="grid gap-2 pt-2">
      <p className="text-center text-sm font-medium text-zinc-600">
        Hoe ging het gesprek?
      </p>

      <ActionButton
        icon={CalendarPlus}
        title="Afspraak nu inplannen"
        subtitle="Opp naar Voorstel-stage. Bouw afspraak-detail later in via opp-edit."
        color="violet"
        primary
        disabled={processing !== null}
        onClick={onScheduleNow}
      />

      <ActionButton
        icon={Clock}
        title="Klant belt terug — later"
        subtitle="Kies periode (1 / 3 / 7 dagen). Lead krijgt nextFollowUpAt."
        color="blue"
        disabled={processing !== null}
        onClick={onCallbackLater}
      />

      <ActionButton
        icon={PhoneIncoming}
        title="Klant belt zelf terug"
        subtitle="Telt als 1× gebeld + 7-dag safety-net follow-up zodat lead niet verdwijnt."
        color="amber"
        disabled={processing !== null}
        onClick={onCustomerWillCallback}
      />

      <ActionButton
        icon={ThumbsDown}
        title="Niet geïnteresseerd"
        subtitle="Opp gesloten als Verloren. Geen email verstuurd."
        color="zinc"
        disabled={processing !== null}
        onClick={onNotInterested}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Callback options — over hoeveel dagen?
// ────────────────────────────────────────────────────────────────────────

function CallbackOptionsView({
  processing,
  onPick,
}: {
  processing: string | null
  onPick: (days: number) => void
}) {
  const presets = [
    { days: 1, label: 'Morgen' },
    { days: 3, label: 'Over 3 dagen' },
    { days: 7, label: 'Over een week' },
    { days: 14, label: 'Over 2 weken' },
    { days: 30, label: 'Over een maand' },
  ]
  return (
    <div className="grid gap-2 pt-2">
      <p className="text-center text-sm font-medium text-zinc-600">
        Wanneer terugbellen?
      </p>
      {presets.map((p) => (
        <Button
          key={p.days}
          type="button"
          variant="outline"
          disabled={processing !== null}
          onClick={() => onPick(p.days)}
          className="h-12 justify-between border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="font-semibold">{p.label}</span>
          </span>
          <span className="text-xs opacity-60">
            {p.days} {p.days === 1 ? 'dag' : 'dagen'}
          </span>
        </Button>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// ActionButton — generieke knop met titel + subtitle voor transparantie
// ────────────────────────────────────────────────────────────────────────

const COLOR_STYLES = {
  orange:
    'border-orange-200 text-orange-700 hover:bg-orange-50 [&_svg]:text-orange-500',
  green:
    'bg-green-600 text-white hover:bg-green-700 [&_svg]:text-white',
  amber: 'border-amber-200 text-amber-700 hover:bg-amber-50 [&_svg]:text-amber-500',
  red: 'border-red-200 text-red-700 hover:bg-red-50 [&_svg]:text-red-500',
  violet:
    'bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-700 hover:to-blue-700 [&_svg]:text-white',
  blue: 'border-blue-200 text-blue-700 hover:bg-blue-50 [&_svg]:text-blue-500',
  zinc: 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 [&_svg]:text-zinc-500',
} as const

function ActionButton({
  icon: Icon,
  title,
  subtitle,
  color,
  primary = false,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  color: keyof typeof COLOR_STYLES
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? '' : 'bg-white'
      } ${COLOR_STYLES[color]}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p
          className={`mt-0.5 text-xs ${primary ? 'opacity-90' : 'opacity-70'}`}
        >
          {subtitle}
        </p>
      </div>
      <Info className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
    </button>
  )
}
