import type { Id } from '../../../../../convex/_generated/dataModel'
import type { Channel, IncomingLead } from '../types'
import { MessageComposeView } from './message-compose'

interface Props {
  lead: IncomingLead
  workspaceId: Id<'workspaces'>
  processing: string | null
  onSubmit: (
    channel: Channel | undefined,
    subject: string | undefined,
    body: string | undefined,
  ) => void
}

export function InvalidNumberView(props: Props) {
  return (
    <MessageComposeView
      {...props}
      templateName="Afscheidsmail (Deal Verloren)"
      forcedChannel="email"
      title="Afscheids-email naar lead (optioneel)"
      skipLabel="Alleen markeren (geen email)"
      sendLabel="Markeer + verstuur email"
    />
  )
}
