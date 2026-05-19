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

export function OutsideAreaView(props: Props) {
  return (
    <MessageComposeView
      {...props}
      templateName="Buiten Werkgebied"
      forcedChannel="email"
      title="Vriendelijke email naar lead (optioneel)"
      skipLabel="Alleen markeren (geen email)"
      sendLabel="Markeer + verstuur email"
    />
  )
}
