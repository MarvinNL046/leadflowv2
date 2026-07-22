import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAction, useMutation, useQuery } from 'convex/react'
import { ArrowLeft, MapPin, Phone } from "@/components/icons"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { htmlToPlainText } from '#/lib/templates.ts'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { Channel, DialogView, LeadDialogProps } from './types'
import { MainView } from './views/main-view'
import { AnsweredOptionsView } from './views/answered-options'
import { AppointmentDateView } from './views/appointment-date'
import { CallbackOptionsView } from './views/callback-options'
import { OutsideAreaView } from './views/outside-area'
import { NotAnsweredView } from './views/not-answered'
import { InvalidNumberView } from './views/invalid-number'
import { LoadingView } from './views/loading-view'

export type { DialogView } from './types'

/**
 * LeadDialog — Bel Nu-modal met sub-view-router. Sub-views in /views,
 * shared parts in /parts. Component-based per Marvin's expliciete regel
 * (zie memory feedback-components-based).
 */
export function LeadDialog({
  lead,
  open,
  onOpenChange,
  initialView = 'main',
}: LeadDialogProps) {
  const [processing, setProcessing] = useState<string | null>(null)
  const [view, setView] = useState<DialogView>(initialView)

  useEffect(() => {
    if (open) setView(initialView)
  }, [open, initialView])

  const recordCallNoAnswer = useMutation(api.contacts.recordCallNoAnswer)
  const recordCallAnswered = useMutation(api.contacts.recordCallAnswered)
  const markInvalidNumber = useMutation(api.contacts.markInvalidNumber)
  const markOutsideArea = useMutation(api.contacts.markOutsideArea)
  const sendMessage = useAction(api.messaging.send)

  const tenants = useQuery(api.userProfiles.myTenants)
  const workspaceId = tenants?.find((t) => t.workspace !== null)?.workspace
    ?.id as Id<'workspaces'> | undefined
  const callbackSettings = useQuery(
    api.crmSettings.get,
    workspaceId ? { workspaceId } : 'skip',
  )

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
    if (view === 'callback_options' || view === 'appointment_date')
      return 'answered_options'
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

        {view === 'outside_area' &&
          (workspaceId ? (
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
          ) : (
            <LoadingView />
          ))}

        {view === 'answered_options' && (
          <AnsweredOptionsView
            processing={processing}
            onScheduleNow={() => setView('appointment_date')}
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

        {view === 'appointment_date' && (
          <AppointmentDateView
            processing={processing}
            onSubmit={(followUpAt) =>
              runAction(
                'schedule_now',
                () =>
                  recordCallAnswered({
                    contactId: lead._id as Id<'contacts'>,
                    outcome: 'appointment',
                    followUpAt,
                  }),
                'Afspraak ingepland — in agenda + opp naar Voorstel',
              )
            }
          />
        )}

        {view === 'callback_options' && (
          <CallbackOptionsView
            processing={processing}
            presets={callbackSettings?.callbackPresets ?? []}
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

        {view === 'not_answered' &&
          (workspaceId ? (
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
                  successWithSend: 'Niet bereikt — volgende belpoging ingepland',
                  successWithoutSend:
                    'Niet bereikt — volgende belpoging ingepland (geen bericht)',
                })
              }
            />
          ) : (
            <LoadingView />
          ))}

        {view === 'invalid_number' &&
          (workspaceId ? (
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
          ) : (
            <LoadingView />
          ))}
      </DialogContent>
    </Dialog>
  )
}
