import { useEffect } from 'react'
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
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Separator } from '#/components/ui/separator.tsx'
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
          {/* Masked contact — buyer unlocks the real data on purchase. */}
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
          <section className="flex flex-wrap items-center gap-4 text-sm">
            {lead.allowExclusive && (
              <span className="font-medium text-zinc-900">
                Exclusief {euro(lead.priceExclusiveCents)}
              </span>
            )}
            {lead.allowShared && (
              <span className="text-zinc-700">
                Gedeeld {euro(lead.priceSharedCents)}
                <span className="ml-1 text-xs text-zinc-500">
                  ({lead.sharedSlotsAvailable} van {lead.maxSharedBuyers}{' '}
                  plekken)
                </span>
              </span>
            )}
          </section>
          {/* TODO-FaseC: purchase (exclusive/shared) buttons + wallet check. */}
        </CardContent>
      </Card>
    </div>
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
