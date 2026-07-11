import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { Lock, Users } from "@/components/icons"
import { toast } from 'sonner'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/**
 * Purchase flow modal. The buyer picks a mode (exclusive/shared) on the
 * lead-detail; this confirms + calls purchaseLead. On success it reveals
 * the full contact (via onPurchased) + a toast; on insufficient_credits
 * it prompts a top-up (link to /feed/wallet).
 */

export interface FullContact {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  city: string | null
  postalCode: string | null
}

function euro(cents: number): string {
  return `€${(cents / 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

interface PurchaseModalProps {
  leadId: Id<'marketplaceLeads'>
  mode: 'exclusive' | 'shared' | null
  priceCents: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPurchased: (full: FullContact) => void
}

export function PurchaseModal({
  leadId,
  mode,
  priceCents,
  open,
  onOpenChange,
  onPurchased,
}: PurchaseModalProps) {
  const navigate = useNavigate()
  const purchaseLead = useMutation(api.marketplace.purchase.purchaseLead)
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!mode) return
    setPending(true)
    try {
      const res = await purchaseLead({ leadId, mode })
      if (res.success && res.fullLead) {
        toast.success('Lead ontgrendeld! De gegevens staan nu in je CRM.')
        onPurchased(res.fullLead)
        onOpenChange(false)
        return
      }
      if (res.error === 'insufficient_credits') {
        toast.error(
          `Onvoldoende tegoed — je komt ${euro(res.shortfallCents ?? 0)} tekort.`,
          {
            action: {
              label: 'Opwaarderen',
              onClick: () => void navigate({ to: '/feed/wallet' }),
            },
          },
        )
        onOpenChange(false)
        return
      }
      const MESSAGES: Record<string, string> = {
        lead_not_available: 'Deze aanvraag is niet meer beschikbaar.',
        mode_not_allowed: 'Deze koop-optie is niet (meer) beschikbaar.',
        already_purchased: 'Je hebt deze aanvraag al ontgrendeld.',
        niche_not_allowed: 'Deze aanvraag valt buiten je niches.',
      }
      toast.error(MESSAGES[res.error ?? ''] ?? 'Aankoop mislukt.')
      onOpenChange(false)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Aankoop mislukt.'))
    } finally {
      setPending(false)
    }
  }

  const isExclusive = mode === 'exclusive'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isExclusive ? (
              <Lock className="h-5 w-5 text-violet-600" />
            ) : (
              <Users className="h-5 w-5 text-violet-600" />
            )}
            {isExclusive ? 'Exclusief kopen' : 'Gedeeld kopen'}
          </DialogTitle>
          <DialogDescription>
            {isExclusive
              ? 'Je krijgt deze aanvraag exclusief — geen andere vakman ontvangt hem.'
              : 'Je deelt deze aanvraag met maximaal een paar andere vakmensen.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">Te betalen</span>
            <span className="text-xl font-bold text-zinc-900">
              {euro(priceCents)}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Dit bedrag wordt van je tegoed afgeschreven. De volledige
            contactgegevens worden direct zichtbaar en in je CRM gezet.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Annuleren
          </Button>
          <Button onClick={confirm} disabled={pending || !mode}>
            {pending
              ? 'Bezig…'
              : isExclusive
                ? `Koop exclusief ${euro(priceCents)}`
                : `Koop gedeeld ${euro(priceCents)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
