import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { MapPin, Phone, Mail, User, Clock } from "@/components/icons"
import { Badge } from '#/components/ui/badge.tsx'
import { Card, CardContent, CardHeader } from '#/components/ui/card.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { toast } from 'sonner'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/feed/purchased')({
  component: PurchasedPage,
})

function euro(cents: number): string {
  return `€${(cents / 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const BUYER_STATUS_LABELS: Record<string, string> = {
  new: 'Nieuw',
  contacted: 'Contact gelegd',
  appointment: 'Afspraak',
  completed: 'Afgerond',
  no_contact: 'Geen contact',
  rejected: 'Afgewezen',
}

// Mirror of buyerStatus.ts TRANSITIONS — drives the allowed next-status
// buttons. Server re-validates via isValidTransition; this is UX only.
const TRANSITIONS: Record<string, string[]> = {
  new: ['contacted', 'no_contact', 'rejected'],
  contacted: ['appointment', 'completed', 'no_contact', 'rejected'],
  appointment: ['completed', 'rejected'],
  no_contact: ['contacted'],
  completed: [],
  rejected: [],
}

type Purchase = {
  purchaseId: Id<'marketplacePurchases'>
  leadId: Id<'marketplaceLeads'>
  mode: 'exclusive' | 'shared'
  priceCents: number
  purchasedAt: number
  buyerStatus: string
  nicheLabel: string
  serviceType: string | null
  city: string | null
  postalCode: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
}

function PurchasedPage() {
  const purchases = useQuery(api.marketplace.purchase.listMyPurchases)

  if (purchases === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Ontgrendelde leads</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {purchases.length}{' '}
          {purchases.length === 1 ? 'aanvraag' : 'aanvragen'}
        </p>
      </div>

      {purchases.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-zinc-500">
            Je hebt nog geen leads ontgrendeld.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {purchases.map((p) => (
            <PurchaseCard key={p.purchaseId} purchase={p as Purchase} />
          ))}
        </div>
      )}
    </div>
  )
}

function PurchaseCard({ purchase: p }: { purchase: Purchase }) {
  const setStatus = useMutation(api.marketplace.buyerStatus.setBuyerStatus)
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—'
  const nextStatuses = TRANSITIONS[p.buyerStatus] ?? []

  async function changeStatus(status: string) {
    try {
      const res = await setStatus({
        purchaseId: p.purchaseId,
        status: status as
          | 'new'
          | 'contacted'
          | 'appointment'
          | 'completed'
          | 'no_contact'
          | 'rejected',
      })
      if (!res.success) {
        toast.error('Deze statuswijziging is niet toegestaan.')
        return
      }
      toast.success(`Status: ${BUYER_STATUS_LABELS[status] ?? status}`)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Status bijwerken mislukt.'))
    }
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{p.nicheLabel}</Badge>
          <Badge variant="outline">
            {p.mode === 'exclusive' ? 'Exclusief' : 'Gedeeld'}
          </Badge>
          <Badge variant="secondary">
            {BUYER_STATUS_LABELS[p.buyerStatus] ?? p.buyerStatus}
          </Badge>
          <span className="ml-auto text-sm text-zinc-500">
            {euro(p.priceCents)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-900">
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {name}
          </span>
          {p.phone && (
            <a
              href={`tel:${p.phone}`}
              className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {p.phone}
            </a>
          )}
          {p.email && (
            <a
              href={`mailto:${p.email}`}
              className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
            >
              <Mail className="h-3.5 w-3.5" />
              {p.email}
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
          {(p.city || p.postalCode) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {[p.postalCode, p.city].filter(Boolean).join(' ')}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {new Date(p.purchasedAt).toLocaleDateString('nl-NL')}
          </span>
        </div>

        {nextStatuses.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeStatus(s)}
                  className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
                >
                  → {BUYER_STATUS_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
