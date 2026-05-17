import { createFileRoute } from '@tanstack/react-router'
import { MessageSquare } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card.tsx'

export const Route = createFileRoute('/crm/messages')({
  component: MessagesPlaceholder,
})

function MessagesPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Messages</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Unified inbox: SMS + WhatsApp + email + Messenger
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <MessageSquare className="h-10 w-10 text-zinc-300" />
          <h2 className="text-lg font-semibold text-zinc-700">Komt eraan</h2>
          <p className="max-w-md text-center text-sm text-zinc-500">
            Eén-table `messages` met channel enum (email/sms/whatsapp/messenger).
            Vervangt v1's 4 aparte logs. Schema staat klaar — UI volgt zodra
            inbound webhooks zijn ge-port (Voidfix WA + SMS, Resend, Meta).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
