import { Link } from '@tanstack/react-router'
import { MapPin, Phone, Mail, User, Clock } from "@/components/icons"
import { Badge } from '#/components/ui/badge.tsx'
import {
  Card,
  CardContent,
  CardHeader,
} from '#/components/ui/card.tsx'

/**
 * Masked lead-card for the buyer feed. Shows ONLY the masked PII the
 * server query returned (maskedName/Phone/Email) plus the non-PII
 * fields. Never receives raw contact data.
 */

export interface FeedLead {
  id: string
  niche: string
  nicheLabel: string
  serviceType: string | null
  serviceTypeLabel: string | null
  segment: string
  segmentLabel: string
  region: string | null
  score: string
  city: string | null
  postalCodePrefix: string | null
  urgency: string | null
  message: string | null
  maskedName: string
  maskedPhone: string
  maskedEmail: string | null
  priceExclusiveCents: number
  priceSharedCents: number
  maxSharedBuyers: number
  sharedSlotsAvailable: number
  allowExclusive: boolean
  allowShared: boolean
  createdAt: number
}

function euro(cents: number): string {
  return `€${(cents / 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const SCORE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  high: 'default',
  medium: 'secondary',
  low: 'outline',
}

const SCORE_LABEL: Record<string, string> = {
  high: 'Hoge kwaliteit',
  medium: 'Gemiddeld',
  low: 'Basis',
}

export function LeadCard({ lead }: { lead: FeedLead }) {
  return (
    <Link
      to="/feed/lead/$id"
      params={{ id: lead.id }}
      className="block"
    >
      <Card className="transition-colors hover:border-[#9dd3cd]">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{lead.nicheLabel}</Badge>
            {lead.serviceTypeLabel && (
              <Badge variant="secondary">{lead.serviceTypeLabel}</Badge>
            )}
            <Badge variant="outline">{lead.segmentLabel}</Badge>
            <Badge variant={SCORE_VARIANT[lead.score] ?? 'outline'}>
              {SCORE_LABEL[lead.score] ?? lead.score}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
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
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
            {(lead.city || lead.postalCodePrefix) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[lead.city, lead.postalCodePrefix].filter(Boolean).join(' · ')}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(lead.createdAt).toLocaleDateString('nl-NL')}
            </span>
          </div>

          {lead.message && (
            <p className="line-clamp-2 text-sm text-zinc-700">{lead.message}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 text-sm">
            {lead.allowExclusive && (
              <span className="font-medium text-zinc-900">
                Exclusief {euro(lead.priceExclusiveCents)}
              </span>
            )}
            {lead.allowShared && (
              <span className="text-zinc-700">
                Gedeeld {euro(lead.priceSharedCents)}
                <span className="ml-1 text-xs text-zinc-500">
                  ({lead.sharedSlotsAvailable} van {lead.maxSharedBuyers} plekken)
                </span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
