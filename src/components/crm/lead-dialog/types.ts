import type { IncomingLead } from '../lead-card'

export type DialogView =
  | 'main'
  | 'outside_area'
  | 'answered_options'
  | 'callback_options'
  | 'not_answered'
  | 'invalid_number'

export type Channel = 'email' | 'sms'

export type { IncomingLead }

export interface LeadDialogProps {
  lead: IncomingLead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Initial sub-view bij open — voor direct-deep-link uit lead-card. */
  initialView?: DialogView
}
