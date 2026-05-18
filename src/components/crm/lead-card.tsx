import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Phone,
  PhoneOff,
  Mail,
  Building2,
  MapPin,
  Megaphone,
  Globe,
  Clock,
  StickyNote,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { cn } from '#/lib/utils.ts'
import { getMetaFormLabel } from '#/lib/meta-forms.ts'
import { LeadDialog } from './lead-dialog'

export interface IncomingLead {
  _id: string
  _creationTime: number
  firstName: string | null | undefined
  lastName: string | null | undefined
  email: string | null | undefined
  phone: string | null | undefined
  company: string | null | undefined
  city: string | null | undefined
  callCount: number
  lastCallAt: number | undefined | null
  leadSource: string | null
  metaFormId: string | null
  latestNote: string | null
  leadCreatedAt: number
}

interface LeadCardProps {
  lead: IncomingLead
  isNew?: boolean
}

export function LeadCard({ lead, isNew = false }: LeadCardProps) {
  const [copied, setCopied] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const displayName =
    [lead.firstName, lead.lastName].filter(Boolean).join(' ') ||
    lead.email ||
    'Onbekend'
  const initial =
    (lead.firstName?.[0] ?? lead.email?.[0] ?? '?').toUpperCase()

  async function handleCopy() {
    const lines = [
      displayName,
      lead.email,
      lead.phone,
      lead.company,
      lead.city,
    ].filter(Boolean)
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Contactgegevens gekopieerd')
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      toast.error('Kopiëren mislukt')
    }
  }

  function handleCall() {
    // Opent modal met call-flow opties (heeft opgenomen / niet opgenomen /
    // ongeldig nummer / buiten werkgebied). In de modal staat het tel:
    // link bovenaan zodat operator eerst belt, dan uitkomst registreert.
    setDialogOpen(true)
  }

  // Relatieve tijd, kort (b.v. "5 min geleden", "2u geleden", "3d geleden")
  const minutesAgo = Math.floor(
    (Date.now() - lead.leadCreatedAt) / (1000 * 60),
  )
  const ago =
    minutesAgo < 60
      ? `${minutesAgo} min`
      : minutesAgo < 24 * 60
        ? `${Math.floor(minutesAgo / 60)}u`
        : `${Math.floor(minutesAgo / (24 * 60))}d`

  const metaFormLabel = getMetaFormLabel(lead.metaFormId)

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all',
        isNew && 'ring-2 ring-green-500/50 ring-offset-2',
      )}
    >
      <CardContent className="p-4">
        {isNew && (
          <Badge className="absolute right-2 top-2 animate-pulse border-0 bg-green-500 text-white">
            Nieuw
          </Badge>
        )}

        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-medium text-white">
            {initial}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/crm/contacts/$id"
                params={{ id: lead._id }}
                className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
              >
                {displayName}
              </Link>
              {lead.leadSource === 'meta' && (
                <Badge
                  variant="secondary"
                  className="border-0 bg-blue-100 text-blue-700"
                  title={lead.metaFormId ? `Form-ID: ${lead.metaFormId}` : undefined}
                >
                  <Megaphone className="mr-1 h-3 w-3" />
                  {metaFormLabel ? `Meta · ${metaFormLabel}` : 'Meta'}
                </Badge>
              )}
              {lead.leadSource === 'api' && (
                <Badge
                  variant="secondary"
                  className="border-0 bg-emerald-100 text-emerald-700"
                >
                  <Globe className="mr-1 h-3 w-3" />
                  Website
                </Badge>
              )}
              {lead.leadSource === 'manual' && (
                <Badge
                  variant="secondary"
                  className="border-0 bg-zinc-100 text-zinc-700"
                >
                  <UserPlus className="mr-1 h-3 w-3" />
                  Handmatig
                </Badge>
              )}
              {lead.callCount > 0 && (
                <Badge
                  variant="secondary"
                  className="border-0 bg-amber-100 text-amber-700"
                >
                  <PhoneOff className="mr-1 h-3 w-3" />
                  {lead.callCount}× gebeld
                </Badge>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {ago} geleden
              </span>
              {lead.company && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {lead.company}
                </span>
              )}
              {lead.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lead.city}
                </span>
              )}
              {lead.email && (
                <span className="flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3" />
                  {lead.email}
                </span>
              )}
            </div>

            {lead.latestNote && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                <p className="line-clamp-2 text-xs text-amber-800">
                  {lead.latestNote}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action row */}
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            onClick={handleCall}
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700"
          >
            <Phone className="h-4 w-4" />
            Bel Nu
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCopy}
            title="Kopieer contactgegevens"
            className="shrink-0"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>

      <LeadDialog
        lead={lead}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Card>
  )
}
