import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import {
  AlertCircle,
  CheckCircle2,
  MapPinOff,
  Phone,
  PhoneOff,
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
import { api } from '../../../convex/_generated/api'
import type { IncomingLead } from './lead-card'

interface LeadDialogProps {
  lead: IncomingLead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeadDialog({ lead, open, onOpenChange }: LeadDialogProps) {
  const [processing, setProcessing] = useState<string | null>(null)
  const recordCall = useMutation(api.contacts.recordCall)
  const markOutsideArea = useMutation(api.contacts.markOutsideArea)

  if (!lead) return null

  const displayName =
    [lead.firstName, lead.lastName].filter(Boolean).join(' ') ||
    lead.email ||
    'Onbekend'

  async function runAction(
    label: string,
    action: () => Promise<unknown>,
    successMsg: string,
  ) {
    setProcessing(label)
    try {
      await action()
      toast.success(successMsg)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Actie mislukt')
    } finally {
      setProcessing(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{displayName}</DialogTitle>
          <DialogDescription className="flex flex-col gap-1">
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />
                {lead.phone}
              </a>
            )}
            {lead.email && <span className="text-zinc-500">{lead.email}</span>}
            {lead.city && (
              <span className="text-zinc-500">📍 {lead.city}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={processing !== null}
            onClick={() =>
              runAction(
                'outside',
                () => markOutsideArea({ contactId: lead._id as any }),
                'Lead gemarkeerd als buiten werkgebied',
              )
            }
            className="h-12 justify-start border-orange-200 text-orange-700 hover:bg-orange-50"
          >
            <MapPinOff className="h-5 w-5" />
            Buiten werkgebied
          </Button>

          <Button
            type="button"
            disabled={processing !== null}
            onClick={() =>
              runAction(
                'answered',
                () =>
                  recordCall({
                    contactId: lead._id as any,
                    result: 'answered',
                  }),
                'Gesprek vastgelegd — heeft opgenomen',
              )
            }
            className="h-12 justify-start bg-green-600 text-white hover:bg-green-700"
          >
            <CheckCircle2 className="h-5 w-5" />
            Heeft opgenomen
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={processing !== null}
            onClick={() =>
              runAction(
                'not_answered',
                () =>
                  recordCall({
                    contactId: lead._id as any,
                    result: 'not_answered',
                  }),
                'Niet opgenomen — telt mee in volgpogingen',
              )
            }
            className="h-12 justify-start border-amber-200 text-amber-700 hover:bg-amber-50"
          >
            <PhoneOff className="h-5 w-5" />
            Niet opgenomen
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={processing !== null}
            onClick={() =>
              runAction(
                'invalid',
                () =>
                  recordCall({
                    contactId: lead._id as any,
                    result: 'invalid',
                  }),
                'Nummer gemarkeerd als ongeldig',
              )
            }
            className="h-12 justify-start border-red-200 text-red-700 hover:bg-red-50"
          >
            <AlertCircle className="h-5 w-5" />
            Ongeldig nummer
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={processing !== null}
            className="h-10 text-zinc-500"
          >
            <X className="h-4 w-4" />
            Annuleren
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
