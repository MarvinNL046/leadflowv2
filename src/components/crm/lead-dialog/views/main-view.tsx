import {
  AlertCircle,
  CheckCircle2,
  MapPinOff,
  PhoneOff,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { ActionButton } from '../parts/action-button'
import type { IncomingLead } from '../types'

interface Props {
  lead: IncomingLead
  processing: string | null
  onOutsideArea: () => void
  onAnswered: () => void
  onNotAnswered: () => void
  onInvalid: () => void
  onCancel: () => void
}

export function MainView({
  lead,
  processing,
  onOutsideArea,
  onAnswered,
  onNotAnswered,
  onInvalid,
  onCancel,
}: Props) {
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
