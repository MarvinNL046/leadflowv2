import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  User,
  Clock,
  Briefcase,
  Lock,
  Users,
  CheckCircle2,
} from "@/components/icons"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import {
  PurchaseModal,
  type FullContact,
} from '#/components/marketplace/purchase-modal.tsx'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/feed/lead_/$id')({
  component: LeadDetailPage,
})

function euro(cents: number): string {
  return `€${(cents / 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const SCORE_LABEL: Record<string, string> = {
  high: 'Hoge kwaliteit',
  medium: 'Gemiddeld',
  low: 'Basis',
}

const JOB_SIZE_LABEL: Record<string, string> = {
  s: 'Kleine klus',
  m: 'Middelgroot',
  l: 'Grote klus',
  xl: 'Zeer groot',
}

const INTENT_LABEL: Record<string, string> = {
  yes: 'Actief op zoek',
  unknown: 'Nog niet duidelijk',
  no: 'Nog aan het oriënteren',
}

function LeadDetailPage() {
  const { id } = Route.useParams()
  const leadId = id as Id<'marketplaceLeads'>

  const lead = useQuery(api.marketplace.feed.getMaskedLeadDetail, { leadId })
  const trackView = useMutation(api.marketplace.leadViews.trackLeadView)

  // Purchase flow state. `revealed` holds the unmasked contact after a
  // successful buy (the masked-detail query then returns null because the
  // org owns the lead, so we render from `revealed` instead).
  const [modalMode, setModalMode] = useState<'exclusive' | 'shared' | null>(
    null,
  )
  const [revealed, setRevealed] = useState<FullContact | null>(null)

  // View tracking: a write, so it runs in an effect (loaders can't write).
  // 5-min dedup lives server-side. Fire-and-forget; failures are silent.
  useEffect(() => {
    if (!lead) return
    void trackView({ leadId }).catch(() => {})
  }, [lead, leadId, trackView])

  if (lead === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (lead === null) {
    // If we just bought it, the masked query returns null (org owns it).
    // Show the unlocked confirmation instead of "not available".
    if (revealed) {
      return (
        <div className="space-y-4">
          <BackLink />
          <UnlockedCard contact={revealed} />
        </div>
      )
    }
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="p-8 text-center text-sm text-zinc-500">
            Deze aanvraag is niet (meer) beschikbaar.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackLink />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{lead.nicheLabel}</Badge>
            {lead.serviceTypeLabel && (
              <Badge variant="secondary">{lead.serviceTypeLabel}</Badge>
            )}
            <Badge variant="outline">{lead.segmentLabel}</Badge>
            <Badge variant="outline">
              {SCORE_LABEL[lead.score] ?? lead.score}
            </Badge>
          </div>
          <CardTitle className="text-xl">
            {lead.projectType ?? lead.nicheLabel}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
            {(lead.city || lead.postalCodePrefix) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[lead.city, lead.postalCodePrefix]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(lead.createdAt).toLocaleDateString('nl-NL')}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Contact — masked until purchase, revealed after. */}
          {revealed ? (
            <section className="space-y-1.5">
              <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Ontgrendeld
              </h3>
              <RevealedContact contact={revealed} />
            </section>
          ) : (
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold text-zinc-500">
                Contact (afgeschermd tot aankoop)
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-700">
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {lead.maskedName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {lead.maskedPhone}
                </span>
                {lead.maskedEmail && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {lead.maskedEmail}
                  </span>
                )}
              </div>
            </section>
          )}

          {(lead.projectDescription || lead.message) && (
            <>
              <Separator />
              <section className="space-y-1.5">
                <h3 className="text-sm font-semibold text-zinc-500">
                  Opdracht
                </h3>
                {lead.projectDescription && (
                  <p className="text-sm text-zinc-700">
                    {lead.projectDescription}
                  </p>
                )}
                {lead.message && (
                  <p className="text-sm text-zinc-700">{lead.message}</p>
                )}
              </section>
            </>
          )}

          {(lead.jobSize || lead.buyerIntention || lead.urgency) && (
            <>
              <Separator />
              <section className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-700">
                <Briefcase className="h-3.5 w-3.5 text-zinc-400" />
                {lead.jobSize && (
                  <span>{JOB_SIZE_LABEL[lead.jobSize] ?? lead.jobSize}</span>
                )}
                {lead.buyerIntention && (
                  <span>
                    {INTENT_LABEL[lead.buyerIntention] ?? lead.buyerIntention}
                  </span>
                )}
                {lead.urgency && <span>Urgentie: {lead.urgency}</span>}
              </section>
            </>
          )}

          <Separator />
          {revealed ? (
            <p className="text-sm font-medium text-emerald-600">
              Je hebt deze aanvraag ontgrendeld.
            </p>
          ) : (
            <section className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              {lead.allowExclusive && (
                <Button
                  className="flex-1"
                  onClick={() => setModalMode('exclusive')}
                >
                  <Lock className="h-4 w-4" />
                  Koop exclusief {euro(lead.priceExclusiveCents)}
                </Button>
              )}
              {lead.allowShared && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setModalMode('shared')}
                >
                  <Users className="h-4 w-4" />
                  Koop gedeeld {euro(lead.priceSharedCents)}
                  <span className="ml-1 text-xs text-zinc-500">
                    ({lead.sharedSlotsAvailable}/{lead.maxSharedBuyers})
                  </span>
                </Button>
              )}
            </section>
          )}
        </CardContent>
      </Card>

      <PurchaseModal
        leadId={leadId}
        mode={modalMode}
        priceCents={
          modalMode === 'exclusive'
            ? lead.priceExclusiveCents
            : lead.priceSharedCents
        }
        open={modalMode !== null}
        onOpenChange={(open) => {
          if (!open) setModalMode(null)
        }}
        onPurchased={(full) => setRevealed(full)}
      />
    </div>
  )
}

function RevealedContact({ contact }: { contact: FullContact }) {
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-900">
      <span className="inline-flex items-center gap-1">
        <User className="h-3.5 w-3.5" />
        {name}
      </span>
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          className="inline-flex items-center gap-1 font-medium text-[#2a7a81] hover:underline"
        >
          <Phone className="h-3.5 w-3.5" />
          {contact.phone}
        </a>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="inline-flex items-center gap-1 font-medium text-[#2a7a81] hover:underline"
        >
          <Mail className="h-3.5 w-3.5" />
          {contact.email}
        </a>
      )}
      {(contact.city || contact.postalCode) && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {[contact.postalCode, contact.city].filter(Boolean).join(' ')}
        </span>
      )}
    </div>
  )
}

function UnlockedCard({ contact }: { contact: FullContact }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" />
          Aanvraag ontgrendeld
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <RevealedContact contact={contact} />
        <p className="text-sm text-zinc-500">
          De volledige gegevens staan nu ook als contact in je CRM, klaar voor
          opvolging.
        </p>
        <Link
          to="/feed"
          className="text-sm font-medium text-[#2a7a81] hover:underline"
        >
          Terug naar de feed
        </Link>
      </CardContent>
    </Card>
  )
}

function BackLink() {
  return (
    <Link
      to="/feed"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
    >
      <ArrowLeft className="h-4 w-4" />
      Terug naar feed
    </Link>
  )
}
