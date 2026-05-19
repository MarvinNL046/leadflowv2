import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { Mail, MessageSquare, Send } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  htmlToPlainText,
  leadTemplateVars,
  renderTemplate,
} from '#/lib/templates.ts'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import type { Channel, IncomingLead } from '../types'

interface Props {
  lead: IncomingLead
  workspaceId: Id<'workspaces'>
  templateName: string
  /** Als null → user kan kiezen tussen email/SMS waar mogelijk. */
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
}

/**
 * Generieke compose-view voor email/SMS-template-flow. Laadt template
 * uit emailTemplates-tabel op naam, vult variabelen in op lead-data,
 * laat user editen, en biedt 2 knoppen: "Alleen markeren" (skip) of
 * "Markeer + verstuur".
 *
 * Voor SMS: HTML-body wordt naar plain text geconverteerd voordat
 * verzonden — Voidfix accepteert geen HTML.
 */
export function MessageComposeView({
  lead,
  workspaceId,
  templateName,
  forcedChannel,
  processing,
  title,
  skipLabel,
  sendLabel,
  onSubmit,
}: Props) {
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

  const recipient = channel === 'email' ? lead.email : lead.phone
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
