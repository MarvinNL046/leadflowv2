import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useAction, useMutation, useQuery } from 'convex/react'
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
  Bot,
  Send,
  X,
  ChevronDown,
} from "@/components/icons"
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { cn } from '#/lib/utils.ts'
import { getMetaFormLabel } from '#/lib/meta-forms.ts'
import { humanizeConvexError } from '#/lib/errors.ts'
import { AnsweredDialog } from './answered-dialog'
import { LeadDialog, type DialogView } from './lead-dialog'
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
  /** Welke sub-view van de LeadDialog moet open — null = gesloten. */
  const [quickActionView, setQuickActionView] = useState<DialogView | null>(
    null,
  )

  // AI suggest-modus: laad eventuele pending suggestie voor dit contact.
  const pending = useQuery(api.aiLeadResponse.pendingForContact, {
    contactId: lead._id as Id<'contacts'>,
  })
  const sendSuggestion = useAction(api.aiLeadResponse.sendSuggestion)
  const dismissSuggestion = useMutation(api.aiLeadResponse.dismissSuggestion)

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

  // Quick-action knoppen openen de LeadDialog met de juiste sub-view —
  // GEEN direct-mutation meer; gebruiker krijgt eerst preview met edit
  // van email/SMS template voordat hij Verstuur of Skip kiest.
  function openQuickAction(view: DialogView) {
    setQuickActionView(view)
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4fb8b2] to-[#328f97] text-sm font-medium text-white">
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
              {lead.callCount > 0 ? (
                <Badge
                  variant="secondary"
                  className="border-0 bg-amber-100 text-amber-700"
                >
                  <PhoneOff className="mr-1 h-3 w-3" />
                  {lead.callCount}× gebeld
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="border-0 bg-zinc-100 text-zinc-600"
                >
                  <Phone className="mr-1 h-3 w-3" />
                  Nog niet gebeld
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
                <p className="line-clamp-6 whitespace-pre-line text-xs text-amber-800">
                  {lead.latestNote}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* AI suggest-modus: toon pending suggestie als concept */}
        {pending && (
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <Bot className="h-3.5 w-3.5" />
              AI-concept ({pending.channel})
            </div>
            <p className="mb-2 whitespace-pre-wrap text-xs text-blue-900">
              {pending.body}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 bg-blue-600 px-3 text-xs text-white hover:bg-blue-700"
                onClick={async () => {
                  try {
                    await sendSuggestion({ suggestionId: pending._id })
                    toast.success('AI-bericht verstuurd')
                  } catch (err) {
                    toast.error(
                      humanizeConvexError(err, 'Versturen mislukt'),
                    )
                  }
                }}
              >
                <Send className="mr-1 h-3 w-3" />
                Verstuur
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-blue-200 px-3 text-xs text-blue-700 hover:bg-blue-100"
                onClick={async () => {
                  try {
                    await dismissSuggestion({ suggestionId: pending._id })
                    toast.success('AI-concept genegeerd')
                  } catch (err) {
                    toast.error(
                      humanizeConvexError(err, 'Negeren mislukt'),
                    )
                  }
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Negeer
              </Button>
            </div>
          </div>
        )}

        {/* Action row — primaire Bel + uitkomst-menu + copy */}
        <div className="mt-4 flex items-center gap-2">
          {/* Bel — opent LeadDialog 'main' (tel:-link prominent + vervolg-acties). */}
          <Button
            type="button"
            onClick={() => openQuickAction('main')}
            disabled={!lead.phone}
            title={lead.phone ? `Bel ${lead.phone}` : 'Geen telefoonnummer'}
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
          >
            <Phone className="h-4 w-4" />
            Bel
          </Button>

          {/* Uitkomst markeren — neutraal menu met de 4 dispositions. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="shrink-0">
                Uitkomst markeren
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setAnsweredOpen(true)}>
                <CheckCircle2 className="text-emerald-600" />
                Opgenomen
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openQuickAction('not_answered')}>
                <PhoneMissed />
                Niet bereikt
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openQuickAction('invalid_number')}
              >
                <AlertTriangle />
                Ongeldig nummer
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openQuickAction('outside_area')}>
                <MapPinOff />
                Buiten gebied
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

      <LeadDialog
        lead={lead}
        open={quickActionView !== null}
        onOpenChange={(open) => !open && setQuickActionView(null)}
        initialView={quickActionView ?? 'main'}
      />
    </Card>
  )
}
