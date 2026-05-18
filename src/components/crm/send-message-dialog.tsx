import { useState, useEffect } from 'react'
import { useAction } from 'convex/react'
import { toast } from 'sonner'
import { Send, Mail, MessageCircle, MessageSquare } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export type Channel = 'email' | 'sms' | 'whatsapp'

interface Props {
  contactId: Id<'contacts'>
  channel: Channel | null
  recipient: string | null | undefined
  contactName: string
  onClose: () => void
}

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: typeof Mail; placeholder: string }
> = {
  email: {
    label: 'E-mail',
    icon: Mail,
    placeholder: 'Hallo {{naam}}, …',
  },
  sms: {
    label: 'SMS',
    icon: MessageSquare,
    placeholder: 'Korte SMS-tekst (max ±160 tekens)',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    placeholder: 'WhatsApp-bericht via Voidfix Web',
  },
}

export function SendMessageDialog({
  contactId,
  channel,
  recipient,
  contactName,
  onClose,
}: Props) {
  const send = useAction(api.messaging.send)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  // Reset velden wanneer dialog opent (channel verandert van null → channel)
  useEffect(() => {
    if (channel) {
      setSubject('')
      setBody('')
    }
  }, [channel])

  if (!channel) return null
  const meta = CHANNEL_META[channel]
  const Icon = meta.icon

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    try {
      await send({
        contactId,
        channel: channel!,
        body,
        ...(channel === 'email' ? { subject } : {}),
      })
      toast.success(`${meta.label} verstuurd`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Versturen mislukt')
    } finally {
      setSending(false)
    }
  }

  const charCount = body.length
  const smsOverLimit = channel === 'sms' && charCount > 160

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {meta.label} versturen
          </DialogTitle>
          <DialogDescription>
            Naar <span className="font-medium">{contactName}</span>
            {recipient && ` · ${recipient}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSend} className="space-y-3">
          {channel === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="msg-subject">Onderwerp</Label>
              <Input
                id="msg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="msg-body">Bericht</Label>
              {channel === 'sms' && (
                <span
                  className={
                    smsOverLimit
                      ? 'text-xs font-medium text-red-600'
                      : 'text-xs text-zinc-400'
                  }
                >
                  {charCount}/160
                </span>
              )}
            </div>
            <textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={meta.placeholder}
              rows={channel === 'email' ? 6 : 4}
              required
              className="block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={sending}
            >
              Annuleer
            </Button>
            <Button
              type="submit"
              disabled={
                sending ||
                body.trim().length === 0 ||
                (channel === 'email' && subject.trim().length === 0)
              }
            >
              <Send className="h-4 w-4" />
              {sending ? 'Versturen…' : 'Verstuur'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
