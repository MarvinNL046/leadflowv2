import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useAction } from 'convex/react'
import {
  AlertCircle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  MapPin,
  MapPinOff,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Send,
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
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import {
  htmlToPlainText,
  leadTemplateVars,
  renderTemplate,
} from '#/lib/templates.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { IncomingLead } from './lead-card'

interface LeadDialogProps {
  lead: IncomingLead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DialogView =
  | 'main'
  | 'outside_area'
  | 'answered_options'
  | 'callback_options'
  | 'not_answered'
  | 'invalid_number'

type Channel = 'email' | 'sms'

export function LeadDialog({ lead, open, onOpenChange }: LeadDialogProps) {
  const [processing, setProcessing] = useState<string | null>(null)
  const [view, setView] = useState<DialogView>('main')
  const recordCallNoAnswer = useMutation(api.contacts.recordCallNoAnswer)
  const recordCallAnswered = useMutation(api.contacts.recordCallAnswered)
  const markInvalidNumber = useMutation(api.contacts.markInvalidNumber)
  const markOutsideArea = useMutation(api.contacts.markOutsideArea)
  const sendMessage = useAction(api.messaging.send)

  // Get workspace voor template-lookup
  const tenants = useQuery(api.userProfiles.myTenants)
  const workspaceId = tenants?.find((t) => t.workspace !== null)?.workspace
    ?.id as Id<'workspaces'> | undefined

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

  async function markAndSend(opts: {
    label: string
    mark: () => Promise<unknown>
    channel?: Channel
    subject?: string
    body?: string
    successWithSend: string
    successWithoutSend: string
  }) {
    if (!lead) return
    const currentLead = lead
    setProcessing(opts.label)
    try {
      await opts.mark()
      let sentNote = ''
      if (opts.body && opts.channel) {
        try {
          await sendMessage({
            contactId: currentLead._id as Id<'contacts'>,
            channel: opts.channel,
            body:
              opts.channel === 'sms' ? htmlToPlainText(opts.body) : opts.body,
            subject: opts.channel === 'email' ? opts.subject : undefined,
            htmlBody: opts.channel === 'email' ? opts.body : undefined,
          })
          sentNote = ` (${opts.channel === 'email' ? 'Email' : 'SMS'} verzonden)`
        } catch (sendErr) {
          toast.warning(
            `Markering OK maar verzenden mislukte: ${humanizeConvexError(sendErr, 'onbekende fout')}`,
          )
        }
      }
      toast.success(
        opts.body && opts.channel
          ? opts.successWithSend + sentNote
          : opts.successWithoutSend,
      )
      handleClose(false)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Actie mislukt'))
    } finally {
      setProcessing(null)
    }
  }

  function backTarget(): DialogView {
    if (view === 'callback_options') return 'answered_options'
    return 'main'
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {view !== 'main' && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-8 w-8 p-0"
                onClick={() => setView(backTarget())}
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
            onOutsideArea={() => setView('outside_area')}
            onAnswered={() => setView('answered_options')}
            onNotAnswered={() => setView('not_answered')}
            onInvalid={() => setView('invalid_number')}
            onCancel={() => handleClose(false)}
          />
        )}

        {view === 'outside_area' && workspaceId && (
          <OutsideAreaView
            lead={lead}
            workspaceId={workspaceId}
            processing={processing}
            onSubmit={(channel, subject, body) =>
              markAndSend({
                label: 'outside_area',
                mark: () =>
                  markOutsideArea({ contactId: lead._id as Id<'contacts'> }),
                channel,
                subject,
                body,
                successWithSend: 'Lead gemarkeerd buiten werkgebied',
                successWithoutSend:
                  'Lead gemarkeerd buiten werkgebied (geen bericht)',
              })
            }
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
                'Afspraak vastgelegd — opp naar Voorstel',
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
                `Terugbelafspraak over ${days} ${days === 1 ? 'dag' : 'dagen'}`,
              )
            }
          />
        )}

        {view === 'not_answered' && workspaceId && (
          <NotAnsweredView
            lead={lead}
            workspaceId={workspaceId}
            processing={processing}
            onSubmit={(channel, subject, body) =>
              markAndSend({
                label: 'not_answered',
                mark: () =>
                  recordCallNoAnswer({
                    contactId: lead._id as Id<'contacts'>,
                  }),
                channel,
                subject,
                body,
                successWithSend: `Niet bereikt — volgende belpoging ingepland`,
                successWithoutSend:
                  'Niet bereikt — volgende belpoging ingepland (geen bericht)',
              })
            }
          />
        )}

        {view === 'invalid_number' && workspaceId && (
          <InvalidNumberView
            lead={lead}
            workspaceId={workspaceId}
            processing={processing}
            onSubmit={(channel, subject, body) =>
              markAndSend({
                label: 'invalid_number',
                mark: () =>
                  markInvalidNumber({
                    contactId: lead._id as Id<'contacts'>,
                  }),
                channel,
                subject,
                body,
                successWithSend: 'Nummer gemarkeerd ongeldig',
                successWithoutSend:
                  'Nummer gemarkeerd ongeldig (geen bericht)',
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Main view — 4 keuze-knoppen
// ════════════════════════════════════════════════════════════════════════

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
        subtitle="Markeert contact + optioneel email versturen (template: Buiten Werkgebied)"
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
        subtitle={`Bumpt callCount naar ${lead.callCount + 1} + optioneel SMS/email (template: Niet Bereikt)`}
        color="amber"
        disabled={processing !== null}
        onClick={onNotAnswered}
      />

      <ActionButton
        icon={AlertCircle}
        title="Ongeldig nummer"
        subtitle="Lead naar Verloren + optioneel email (template: Afscheidsmail)"
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

// ════════════════════════════════════════════════════════════════════════
// Answered options
// ════════════════════════════════════════════════════════════════════════

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
        subtitle="Opp naar Voorstel-stage"
        color="violet"
        primary
        disabled={processing !== null}
        onClick={onScheduleNow}
      />

      <ActionButton
        icon={Clock}
        title="Klant belt terug — later"
        subtitle="Kies periode (1 / 3 / 7 / 14 / 30 dgn)"
        color="blue"
        disabled={processing !== null}
        onClick={onCallbackLater}
      />

      <ActionButton
        icon={PhoneIncoming}
        title="Klant belt zelf terug"
        subtitle="Telt als 1× gebeld + 7-dag safety-net"
        color="amber"
        disabled={processing !== null}
        onClick={onCustomerWillCallback}
      />

      <ActionButton
        icon={ThumbsDown}
        title="Niet geïnteresseerd"
        subtitle="Opp gesloten als Verloren"
        color="zinc"
        disabled={processing !== null}
        onClick={onNotInterested}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Callback options
// ════════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════════════
// Outside-area view — laadt "Buiten Werkgebied" template, alleen email
// ════════════════════════════════════════════════════════════════════════

function OutsideAreaView({
  lead,
  workspaceId,
  processing,
  onSubmit,
}: {
  lead: IncomingLead
  workspaceId: Id<'workspaces'>
  processing: string | null
  onSubmit: (
    channel: Channel | undefined,
    subject: string | undefined,
    body: string | undefined,
  ) => void
}) {
  return (
    <MessageComposeView
      lead={lead}
      workspaceId={workspaceId}
      templateName="Buiten Werkgebied"
      forcedChannel="email"
      processing={processing}
      title="Vriendelijke email naar lead (optioneel)"
      onSubmit={onSubmit}
      skipLabel="Alleen markeren (geen email)"
      sendLabel="Markeer + verstuur email"
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// Not-answered view — laadt "Niet Bereikt" template, email of sms
// ════════════════════════════════════════════════════════════════════════

function NotAnsweredView({
  lead,
  workspaceId,
  processing,
  onSubmit,
}: {
  lead: IncomingLead
  workspaceId: Id<'workspaces'>
  processing: string | null
  onSubmit: (
    channel: Channel | undefined,
    subject: string | undefined,
    body: string | undefined,
  ) => void
}) {
  return (
    <MessageComposeView
      lead={lead}
      workspaceId={workspaceId}
      templateName="Niet Bereikt"
      forcedChannel={null}
      processing={processing}
      title="Bericht naar lead (optioneel)"
      onSubmit={onSubmit}
      skipLabel="Alleen markeren (geen bericht)"
      sendLabel="Markeer + verstuur"
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// Invalid-number view — laadt "Afscheidsmail (Deal Verloren)" template
// ════════════════════════════════════════════════════════════════════════

function InvalidNumberView({
  lead,
  workspaceId,
  processing,
  onSubmit,
}: {
  lead: IncomingLead
  workspaceId: Id<'workspaces'>
  processing: string | null
  onSubmit: (
    channel: Channel | undefined,
    subject: string | undefined,
    body: string | undefined,
  ) => void
}) {
  return (
    <MessageComposeView
      lead={lead}
      workspaceId={workspaceId}
      templateName="Afscheidsmail (Deal Verloren)"
      forcedChannel="email"
      processing={processing}
      title="Afscheids-email naar lead (optioneel)"
      onSubmit={onSubmit}
      skipLabel="Alleen markeren (geen email)"
      sendLabel="Markeer + verstuur email"
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// Generic message-compose — gebruikt door alle 3 messaging sub-views
// ════════════════════════════════════════════════════════════════════════

function MessageComposeView({
  lead,
  workspaceId,
  templateName,
  forcedChannel,
  processing,
  title,
  skipLabel,
  sendLabel,
  onSubmit,
}: {
  lead: IncomingLead
  workspaceId: Id<'workspaces'>
  templateName: string
  forcedChannel: Channel | null
  processing: string | null
  title: string
  skipLabel: string
  sendLabel: string
  onSubmit: (
    channel: Channel | undefined,
    subject: string | undefined,
    body: string | undefined,
  ) => void
}) {
  const template = useQuery(api.emailTemplates.getByName, {
    workspaceId,
    name: templateName,
  })

  const [channel, setChannel] = useState<Channel>(
    forcedChannel ?? (lead.email ? 'email' : 'sms'),
  )
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (template) {
      const vars = leadTemplateVars({
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        company: lead.company,
      })
      setSubject(renderTemplate(template.subject, vars))
      const rendered = renderTemplate(template.body, vars)
      setBody(channel === 'sms' ? htmlToPlainText(rendered) : rendered)
    }
  }, [
    template,
    channel,
    lead.firstName,
    lead.lastName,
    lead.email,
    lead.phone,
    lead.city,
    lead.company,
  ])

  const recipient =
    channel === 'email' ? lead.email : lead.phone
  const canSend = Boolean(recipient && body.trim())

  if (template === undefined) {
    return <div className="py-4 text-center text-sm text-zinc-400">Laden…</div>
  }

  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm font-medium text-zinc-700">{title}</p>

      {forcedChannel === null && (lead.email || lead.phone) && (
        <div className="flex gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1">
          {lead.email && (
            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                channel === 'email'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Mail className="mr-1 inline h-3 w-3" />
              Email
            </button>
          )}
          {lead.phone && (
            <button
              type="button"
              onClick={() => setChannel('sms')}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                channel === 'sms'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <MessageSquare className="mr-1 inline h-3 w-3" />
              SMS
            </button>
          )}
        </div>
      )}

      {template === null ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Template <code>"{templateName}"</code> niet gevonden. Maak 'm aan in{' '}
          <code>/crm/settings/templates</code>.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
            <Send className="h-3 w-3" />
            Naar: <span className="font-mono">{recipient || '(geen)'}</span>
          </div>

          {channel === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="msg-subject" className="text-xs">
                Onderwerp
              </Label>
              <Input
                id="msg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="msg-body" className="text-xs">
              Bericht
            </Label>
            <textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={channel === 'sms' ? 4 : 8}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            {channel === 'email' && (
              <p className="text-[10px] text-zinc-500">
                HTML toegestaan — wordt zo verzonden via Resend
              </p>
            )}
          </div>
        </>
      )}

      <div className="grid gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          disabled={processing !== null}
          onClick={() => onSubmit(undefined, undefined, undefined)}
          className="h-10"
        >
          {skipLabel}
        </Button>
        <Button
          type="button"
          disabled={processing !== null || !canSend}
          onClick={() => onSubmit(channel, subject, body)}
          className="h-10 bg-emerald-600 hover:bg-emerald-700"
        >
          <Send className="h-4 w-4" />
          {sendLabel}
        </Button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ActionButton — generieke knop met titel + subtitle
// ════════════════════════════════════════════════════════════════════════

const COLOR_STYLES = {
  orange:
    'border-orange-200 text-orange-700 hover:bg-orange-50 [&_svg]:text-orange-500',
  green: 'bg-green-600 text-white hover:bg-green-700 [&_svg]:text-white',
  amber:
    'border-amber-200 text-amber-700 hover:bg-amber-50 [&_svg]:text-amber-500',
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
