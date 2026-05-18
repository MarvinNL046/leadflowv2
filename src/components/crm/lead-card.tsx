import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  Phone,
  PhoneOff,
  PhoneMissed,
  Mail,
  Building2,
  MapPin,
  MapPinOff,
  Megaphone,
  Globe,
  Clock,
  StickyNote,
  Copy,
  Check,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { cn } from '#/lib/utils.ts'
import { getMetaFormLabel } from '#/lib/meta-forms.ts'
import { AnsweredDialog } from './answered-dialog'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

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
  const [answeredOpen, setAnsweredOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const recordCallNoAnswer = useMutation(api.contacts.recordCallNoAnswer)
  const markInvalidNumber = useMutation(api.contacts.markInvalidNumber)
  const markOutsideArea = useMutation(api.contacts.markOutsideArea)

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

  async function runAction(
    key: string,
    fn: () => Promise<unknown>,
    successMsg: string,
  ) {
    if (busy) return
    setBusy(key)
    try {
      await fn()
      toast.success(successMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mislukt')
    } finally {
      setBusy(null)
    }
  }

  function handleNoAnswer() {
    void runAction(
      'no-answer',
      () =>
        recordCallNoAnswer({ contactId: lead._id as Id<'contacts'> }),
      'Niet bereikt — volgende belpoging over 2 dagen',
    )
  }

  function handleInvalid() {
    void runAction(
      'invalid',
      () =>
        markInvalidNumber({ contactId: lead._id as Id<'contacts'> }),
      'Ongeldig nummer gemarkeerd',
    )
  }

  function handleOutsideArea() {
    void runAction(
      'outside',
      () => markOutsideArea({ contactId: lead._id as Id<'contacts'> }),
      'Lead buiten werkgebied gemarkeerd',
    )
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

        {/* Action row — 5 acties + Copy */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Bel: opens tel: + native call-app */}
          <Button
            type="button"
            asChild
            className="flex-1 min-w-[100px] bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700"
          >
            <a href={lead.phone ? `tel:${lead.phone}` : undefined}>
              <Phone className="h-4 w-4" />
              Bel
            </a>
          </Button>

          {/* Opgenomen → AnsweredDialog */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setAnsweredOpen(true)}
            disabled={!!busy}
            title="Heeft opgenomen"
            className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">Opgenomen</span>
          </Button>

          {/* Niet bereikt → direct execute */}
          <Button
            type="button"
            variant="outline"
            onClick={handleNoAnswer}
            disabled={!!busy}
            title="Niet bereikt — bump call-count, follow-up over 2 dagen"
            className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
          >
            <PhoneMissed className="h-4 w-4" />
            <span className="hidden sm:inline">
              {busy === 'no-answer' ? '…' : 'Niet bereikt'}
            </span>
          </Button>

          {/* Ongeldig nummer */}
          <Button
            type="button"
            variant="outline"
            onClick={handleInvalid}
            disabled={!!busy}
            title="Ongeldig telefoonnummer"
            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">
              {busy === 'invalid' ? '…' : 'Ongeldig'}
            </span>
          </Button>

          {/* Buiten gebied */}
          <Button
            type="button"
            variant="outline"
            onClick={handleOutsideArea}
            disabled={!!busy}
            title="Buiten werkgebied"
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
          >
            <MapPinOff className="h-4 w-4" />
            <span className="hidden sm:inline">
              {busy === 'outside' ? '…' : 'Buiten gebied'}
            </span>
          </Button>

          {/* Copy */}
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

      <AnsweredDialog
        contactId={lead._id as Id<'contacts'>}
        contactName={displayName}
        open={answeredOpen}
        onOpenChange={setAnsweredOpen}
      />
    </Card>
  )
}
