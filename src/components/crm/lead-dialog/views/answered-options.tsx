import { CalendarPlus, Clock, PhoneIncoming, ThumbsDown } from 'lucide-react'
import { ActionButton } from '../parts/action-button'

interface Props {
  processing: string | null
  onScheduleNow: () => void
  onCallbackLater: () => void
  onCustomerWillCallback: () => void
  onNotInterested: () => void
}

export function AnsweredOptionsView({
  processing,
  onScheduleNow,
  onCallbackLater,
  onCustomerWillCallback,
  onNotInterested,
}: Props) {
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
