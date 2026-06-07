import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  MapPin,
  Briefcase,
  Megaphone,
  Globe,
  UserPlus,
  StickyNote,
  Save,
  X,
  Pencil,
  PhoneOff,
  Send,
  MessageCircle,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import { LeadDialog } from '../components/crm/lead-dialog'
import type { IncomingLead } from '../components/crm/lead-card'
import {
  SendMessageDialog,
  type Channel,
} from '../components/crm/send-message-dialog'
import { Button } from '#/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { cn } from '#/lib/utils.ts'
import { humanizeConvexError } from '#/lib/errors.ts'
import { getMetaFormLabel } from '#/lib/meta-forms.ts'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/contacts_/$id')({
  component: ContactDetailPage,
})

function ContactDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const softDelete = useMutation(api.contacts.softDelete)
  const restore = useMutation(api.contacts.restore)
  const [callDialogOpen, setCallDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendChannel, setSendChannel] = useState<Channel | null>(null)

  const detail = useQuery(api.contacts.getDetail, {
    contactId: id as Id<'contacts'>,
  })
  const notes = useQuery(api.notes.listByContact, {
    contactId: id as Id<'contacts'>,
  })

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    const contactId = id as Id<'contacts'>
    try {
      await softDelete({ contactId })
      toast.success('Contact verwijderd', {
        action: {
          label: 'Ongedaan maken',
          onClick: () => {
            void restore({ contactId })
              .then(() => toast.success('Contact hersteld'))
              .catch((e) =>
                toast.error(
                  e instanceof Error ? e.message : 'Kon niet herstellen',
                ),
              )
          },
        },
        duration: 8000,
      })
      void navigate({ to: '/crm' })
    } catch (err) {
      toast.error(
        humanizeConvexError(err, 'Kon niet verwijderen'),
      )
      setDeleting(false)
    }
  }

  if (detail === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (detail === null) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-zinc-500">Contact niet gevonden.</p>
          <Link
            to="/crm"
            className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Terug naar dashboard
          </Link>
        </CardContent>
      </Card>
    )
  }

  const { contact, attribution, metaRaw } = detail
  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    contact.email ||
    'Naamloos'
  const initials = (
    (contact.firstName?.[0] ?? '') + (contact.lastName?.[0] ?? '') ||
    contact.email?.[0] ||
    '?'
  ).toUpperCase()
  const metaFormLabel = getMetaFormLabel(attribution?.metaFormId)

  // Construct IncomingLead-shape voor hergebruik van bestaande LeadDialog
  const incomingLead: IncomingLead = {
    _id: contact._id,
    _creationTime: contact._creationTime,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    city: contact.city,
    callCount: contact.callCount,
    lastCallAt: contact.lastCallAt,
    leadSource: attribution?.source ?? null,
    metaFormId: attribution?.metaFormId ?? null,
    latestNote: null,
    leadCreatedAt: attribution?._creationTime ?? contact._creationTime,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          to="/crm"
          className="mt-1 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Terug naar dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-base font-medium text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-zinc-900">
            {fullName}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
            {attribution?.source === 'meta' && (
              <Badge className="border-0 bg-blue-100 text-blue-700">
                <Megaphone className="mr-1 h-3 w-3" />
                {metaFormLabel ? `Meta · ${metaFormLabel}` : 'Meta'}
              </Badge>
            )}
            {attribution?.source === 'api' && (
              <Badge className="border-0 bg-emerald-100 text-emerald-700">
                <Globe className="mr-1 h-3 w-3" />
                Website
              </Badge>
            )}
            {attribution?.source === 'manual' && (
              <Badge className="border-0 bg-zinc-100 text-zinc-700">
                <UserPlus className="mr-1 h-3 w-3" />
                Handmatig
              </Badge>
            )}
            {contact.callCount > 0 && (
              <Badge className="border-0 bg-amber-100 text-amber-700">
                <PhoneOff className="mr-1 h-3 w-3" />
                {contact.callCount}× gebeld
              </Badge>
            )}
            {contact.outsideArea && (
              <Badge className="border-0 bg-orange-100 text-orange-700">
                Buiten werkgebied
              </Badge>
            )}
            {contact.tags?.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="border-zinc-300 text-zinc-600"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            size="sm"
            onClick={() => setCallDialogOpen(true)}
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700"
          >
            <Phone className="h-4 w-4" />
            Bel Nu
          </Button>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              title={contact.email ? `Email naar ${contact.email}` : 'Geen email'}
              disabled={!contact.email}
              onClick={() => setSendChannel('email')}
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              title={contact.phone ? `SMS naar ${contact.phone}` : 'Geen telefoon'}
              disabled={!contact.phone}
              onClick={() => setSendChannel('sms')}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              title={contact.phone ? `WA naar ${contact.phone}` : 'Geen telefoon'}
              disabled={!contact.phone}
              onClick={() => setSendChannel('whatsapp')}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            title="Contact verwijderen (8s undo)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DetailsSection contact={contact} />
      <OpportunitiesSection contactId={id as Id<'contacts'>} />
      <CustomFieldsSection contactId={id as Id<'contacts'>} />
      <ManualFieldsSection contactId={id as Id<'contacts'>} />
      <ConversationSection contactId={id as Id<'contacts'>} />
      <NotesSection
        contactId={id as Id<'contacts'>}
        notes={notes ?? null}
      />
      <WorkflowHistorySection contactId={id as Id<'contacts'>} />
      <ActivitySection
        contact={contact}
        attribution={attribution}
        metaRaw={metaRaw}
      />

      <LeadDialog
        lead={incomingLead}
        open={callDialogOpen}
        onOpenChange={setCallDialogOpen}
      />

      <SendMessageDialog
        contactId={id as Id<'contacts'>}
        channel={sendChannel}
        recipient={sendChannel === 'email' ? contact.email : contact.phone}
        contactName={fullName}
        onClose={() => setSendChannel(null)}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Details — view mode + edit mode
// ────────────────────────────────────────────────────────────────────────

type Contact = Doc<'contacts'>

function DetailsSection({ contact }: { contact: Contact }) {
  const [editing, setEditing] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Gegevens</CardTitle>
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Bewerken
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <EditForm contact={contact} onDone={() => setEditing(false)} />
        ) : (
          <ViewMode contact={contact} />
        )}
      </CardContent>
    </Card>
  )
}

function ViewMode({ contact }: { contact: Contact }) {
  const rows: Array<{
    icon: React.ReactNode
    label: string
    value: string | null | undefined
  }> = [
    {
      icon: <Mail className="h-3.5 w-3.5" />,
      label: 'E-mail',
      value: contact.email,
    },
    {
      icon: <Phone className="h-3.5 w-3.5" />,
      label: 'Telefoon',
      value: contact.phone,
    },
    {
      icon: <Building2 className="h-3.5 w-3.5" />,
      label: 'Bedrijf',
      value: contact.company,
    },
    {
      icon: <Briefcase className="h-3.5 w-3.5" />,
      label: 'Functie',
      value: contact.position,
    },
    {
      icon: <MapPin className="h-3.5 w-3.5" />,
      label: 'Adres',
      value:
        [contact.street, contact.houseNumber].filter(Boolean).join(' ') ||
        undefined,
    },
    {
      icon: <MapPin className="h-3.5 w-3.5" />,
      label: 'Plaats',
      value:
        [contact.postalCode, contact.city].filter(Boolean).join(' ') ||
        undefined,
    },
    {
      icon: <MapPin className="h-3.5 w-3.5" />,
      label: 'Provincie',
      value: contact.province,
    },
  ]

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 text-zinc-400">{r.icon}</span>
          <div className="min-w-0 flex-1">
            <dt className="text-xs text-zinc-500">{r.label}</dt>
            <dd
              className={cn(
                'truncate',
                r.value ? 'text-zinc-900' : 'italic text-zinc-400',
              )}
            >
              {r.value || '—'}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  )
}

function EditForm({
  contact,
  onDone,
}: {
  contact: Contact
  onDone: () => void
}) {
  const update = useMutation(api.contacts.update)
  const [f, setF] = useState({
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    company: contact.company ?? '',
    position: contact.position ?? '',
    street: contact.street ?? '',
    houseNumber: contact.houseNumber ?? '',
    postalCode: contact.postalCode ?? '',
    city: contact.city ?? '',
    province: contact.province ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: keyof typeof f) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await update({ contactId: contact._id, ...f })
      toast.success('Contact bijgewerkt')
      onDone()
    } catch (err) {
      toast.error(
        humanizeConvexError(err, 'Kon contact niet bijwerken'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SmallField label="Voornaam" value={f.firstName} onChange={set('firstName')} />
        <SmallField label="Achternaam" value={f.lastName} onChange={set('lastName')} />
        <SmallField label="E-mail" type="email" value={f.email} onChange={set('email')} />
        <SmallField label="Telefoon" type="tel" value={f.phone} onChange={set('phone')} />
        <SmallField label="Bedrijf" value={f.company} onChange={set('company')} />
        <SmallField label="Functie" value={f.position} onChange={set('position')} />
        <SmallField label="Straat" value={f.street} onChange={set('street')} />
        <SmallField label="Huisnr." value={f.houseNumber} onChange={set('houseNumber')} />
        <SmallField label="Postcode" value={f.postalCode} onChange={set('postalCode')} />
        <SmallField label="Plaats" value={f.city} onChange={set('city')} />
        <SmallField label="Provincie" value={f.province} onChange={set('province')} />
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDone}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" />
          Annuleer
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </div>
    </div>
  )
}

function SmallField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-500">{label}</Label>
      <Input type={type} value={value} onChange={onChange} className="h-9" />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Conversation — chat-bubbles inbound/outbound per kanaal
// ────────────────────────────────────────────────────────────────────────

function ConversationSection({
  contactId,
}: {
  contactId: Id<'contacts'>
}) {
  const messages = useQuery(api.messaging.listByContact, { contactId })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-sky-500" />
          Berichten
          {messages && (
            <Badge variant="secondary" className="text-xs">
              {messages.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {messages === undefined ? (
          <Skeleton className="h-32 w-full" />
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            Nog geen berichten verstuurd of ontvangen
          </p>
        ) : (
          <div className="space-y-2">
            {[...messages].reverse().map((m, idx, arr) => {
              const prev = idx > 0 ? arr[idx - 1] : null
              const showDate =
                !prev ||
                new Date(m._creationTime).toDateString() !==
                  new Date(prev._creationTime).toDateString()
              return (
                <div key={m._id}>
                  {showDate && (
                    <div className="my-3 flex items-center justify-center">
                      <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs text-zinc-500">
                        {new Date(m._creationTime).toLocaleDateString(
                          'nl-NL',
                          {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          },
                        )}
                      </span>
                    </div>
                  )}
                  <MessageBubble message={m} />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MessageBubble({
  message,
}: {
  message: {
    _creationTime: number
    channel: string
    direction: string
    status: string
    subject?: string
    body: string
    errorMessage?: string
  }
}) {
  const isOutbound = message.direction === 'outbound'
  const channelMeta: Record<
    string,
    { icon: typeof Mail; bg: string; label: string }
  > = {
    email: { icon: Mail, bg: 'bg-blue-50 border-blue-200', label: 'Email' },
    sms: {
      icon: MessageSquare,
      bg: 'bg-emerald-50 border-emerald-200',
      label: 'SMS',
    },
    whatsapp: {
      icon: MessageCircle,
      bg: 'bg-green-50 border-green-200',
      label: 'WhatsApp',
    },
    messenger: {
      icon: MessageCircle,
      bg: 'bg-violet-50 border-violet-200',
      label: 'Messenger',
    },
  }
  const m = channelMeta[message.channel] ?? channelMeta.sms
  const Icon = m.icon
  const failed = message.status === 'failed' || message.status === 'bounced'

  return (
    <div
      className={cn(
        'flex',
        isOutbound ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg border px-3 py-2 text-sm',
          isOutbound
            ? 'bg-zinc-900 text-white border-zinc-900'
            : `${m.bg} text-zinc-800`,
          failed && 'opacity-60',
        )}
      >
        <div
          className={cn(
            'mb-1 flex items-center gap-1.5 text-xs',
            isOutbound ? 'text-zinc-300' : 'text-zinc-500',
          )}
        >
          <Icon className="h-3 w-3" />
          <span>{m.label}</span>
          <span>·</span>
          <span>
            {new Date(message._creationTime).toLocaleTimeString('nl-NL', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {failed && (
            <Badge className="ml-1 border-0 bg-red-100 text-red-700 text-[10px]">
              {message.status}
            </Badge>
          )}
        </div>
        {message.subject && message.channel === 'email' && (
          <p
            className={cn(
              'mb-1 font-medium',
              isOutbound ? 'text-white' : 'text-zinc-900',
            )}
          >
            {message.subject}
          </p>
        )}
        <p className="whitespace-pre-line">{message.body}</p>
        {message.errorMessage && (
          <p
            className={cn(
              'mt-1 text-xs',
              isOutbound ? 'text-red-300' : 'text-red-600',
            )}
          >
            {message.errorMessage}
          </p>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Notes
// ────────────────────────────────────────────────────────────────────────

function NotesSection({
  contactId,
  notes,
}: {
  contactId: Id<'contacts'>
  notes: Array<{
    _id: string
    _creationTime: number
    body: string
  }> | null
}) {
  const create = useMutation(api.notes.create)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      await create({ contactId, body })
      setBody('')
      toast.success('Notitie toegevoegd')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Kon notitie niet opslaan'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4 text-amber-500" />
          Notities
          {notes && (
            <Badge variant="secondary" className="text-xs">
              {notes.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Voeg een notitie toe…"
            rows={3}
            className="block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={saving || body.trim().length === 0}
            >
              <Send className="h-3.5 w-3.5" />
              {saving ? 'Opslaan…' : 'Notitie toevoegen'}
            </Button>
          </div>
        </form>

        {notes === null ? (
          <Skeleton className="h-20 w-full" />
        ) : notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            Nog geen notities voor deze contact
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li
                key={n._id}
                className="rounded-md border border-amber-100 bg-amber-50/40 p-3"
              >
                <p className="whitespace-pre-line text-sm text-zinc-800">
                  {n.body}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {new Date(n._creationTime).toLocaleString('nl-NL')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Activity — calls + meta payload + attribution detail
// ────────────────────────────────────────────────────────────────────────

function ActivitySection({
  contact,
  attribution,
  metaRaw,
}: {
  contact: Contact
  attribution:
    | {
        source: string
        metaFormId?: string | null
        metaLeadgenId?: string | null
        metaAdId?: string | null
        metaCampaignId?: string | null
        _creationTime: number
      }
    | null
    | undefined
  metaRaw:
    | {
        fieldData: unknown
        payload: unknown
        adName?: string
        adsetName?: string
        campaignName?: string
      }
    | null
}) {
  const hasCalls = contact.callCount > 0
  const fieldEntries =
    metaRaw?.fieldData && typeof metaRaw.fieldData === 'object'
      ? Object.entries(metaRaw.fieldData as Record<string, string>)
      : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activiteit & bron</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Call samenvatting */}
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-zinc-700">
            {hasCalls
              ? `${contact.callCount}× gebeld`
              : 'Nog niet gebeld'}
          </span>
          {hasCalls && contact.lastCallAt && (
            <span className="text-xs text-zinc-400">
              · laatst {new Date(contact.lastCallAt).toLocaleString('nl-NL')}
              {contact.lastCallResult && ` (${contact.lastCallResult})`}
            </span>
          )}
        </div>

        {attribution && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-700">Bron</h3>
              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <DLRow label="Source" value={attribution.source} />
                <DLRow
                  label="Toegevoegd"
                  value={new Date(
                    attribution._creationTime,
                  ).toLocaleString('nl-NL')}
                />
                {attribution.metaFormId && (
                  <DLRow label="Form-ID" value={attribution.metaFormId} mono />
                )}
                {attribution.metaLeadgenId && (
                  <DLRow
                    label="Leadgen-ID"
                    value={attribution.metaLeadgenId}
                    mono
                  />
                )}
                {attribution.metaAdId && (
                  <DLRow label="Ad-ID" value={attribution.metaAdId} mono />
                )}
                {attribution.metaCampaignId && (
                  <DLRow
                    label="Campaign-ID"
                    value={attribution.metaCampaignId}
                    mono
                  />
                )}
                {metaRaw?.adName && (
                  <DLRow label="Ad" value={metaRaw.adName} />
                )}
                {metaRaw?.adsetName && (
                  <DLRow label="Adset" value={metaRaw.adsetName} />
                )}
                {metaRaw?.campaignName && (
                  <DLRow label="Campagne" value={metaRaw.campaignName} />
                )}
              </dl>
            </div>
          </>
        )}

        {fieldEntries.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-700">
                Form-antwoorden (rauw)
              </h3>
              <dl className="space-y-1">
                {fieldEntries.map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-1 gap-x-3 text-xs sm:grid-cols-[180px_1fr]"
                  >
                    <dt className="truncate text-zinc-500">{k}</dt>
                    <dd className="text-zinc-800">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DLRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={cn('truncate', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Opportunities — alle opps voor dit contact, sorted open-first
// ────────────────────────────────────────────────────────────────────────

function OpportunitiesSection({ contactId }: { contactId: Id<'contacts'> }) {
  const opps = useQuery(api.opportunities.listByContact, { contactId })

  if (opps === undefined) return null
  if (opps.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4" />
          Opportunities ({opps.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {opps.map((opp) => (
          <Link
            key={opp._id}
            to="/crm/pipelines"
            className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-3 hover:border-zinc-300 hover:bg-zinc-50"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: opp.stageColor ?? '#94a3b8' }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">
                {opp.title}
              </p>
              <p className="text-xs text-zinc-500">
                {opp.stageName}
                {opp.closedAt && ' · gesloten'}
              </p>
            </div>
            {opp.value !== undefined && opp.value > 0 && (
              <p className="shrink-0 text-sm font-semibold text-zinc-700">
                € {opp.value.toLocaleString('nl-NL')}
              </p>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Custom fields — gemigreerde v1 form-answers (welk type ruimte etc.)
// ────────────────────────────────────────────────────────────────────────

function CustomFieldsSection({ contactId }: { contactId: Id<'contacts'> }) {
  const fields = useQuery(api.customFields.listForContact, { contactId })

  if (fields === undefined || fields === null) return null
  // Filter alleen velden met een waarde — toont leads "wat ze hebben
  // ingevuld" niet "wat ze hadden kunnen invullen". Bij geen enkele
  // waarde toont de hele sectie niets (clean).
  const filled = fields.filter(
    (f) => f.value !== null && f.value !== undefined && f.value !== '',
  )
  if (filled.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4" />
          Form-antwoorden
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {filled.map(({ definition, value }) => (
            <div key={definition._id}>
              <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                {definition.label}
              </dt>
              <dd className="mt-0.5 text-sm text-zinc-900">
                {formatCustomFieldValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function ManualFieldsSection({ contactId }: { contactId: Id<'contacts'> }) {
  const fields = useQuery(api.customFields.listManualForContact, { contactId })
  const setValue = useMutation(api.customFields.setContactValue)
  if (fields === undefined || fields.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Eigen velden</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map(({ definition, value }) => (
          <ManualFieldRow
            key={definition._id}
            definition={definition}
            value={value}
            onSave={async (val) => {
              try {
                await setValue({
                  contactId,
                  definitionId: definition._id,
                  value: val,
                })
                toast.success('Opgeslagen')
              } catch (err) {
                toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
              }
            }}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function ManualFieldRow({
  definition,
  value,
  onSave,
}: {
  definition: {
    _id: Id<'customFieldDefinitions'>
    label: string
    fieldType: string
    selectOptions?: string[]
  }
  value: unknown
  onSave: (val: unknown) => Promise<void>
}) {
  const [text, setText] = useState(
    value === null || value === undefined ? '' : String(value),
  )
  const original = value === null || value === undefined ? '' : String(value)

  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-zinc-500">
        {definition.label}
      </Label>
      {definition.fieldType === 'boolean' ? (
        <button
          type="button"
          onClick={() => void onSave(value === true ? false : true)}
          className={
            value === true
              ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700'
              : 'rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50'
          }
        >
          {value === true ? 'Ja' : 'Nee'}
        </button>
      ) : definition.fieldType === 'select' ? (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => void onSave(v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Kies…" />
          </SelectTrigger>
          <SelectContent>
            {(definition.selectOptions ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={
            definition.fieldType === 'number'
              ? 'number'
              : definition.fieldType === 'date'
                ? 'date'
                : 'text'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text === original) return
            const out =
              definition.fieldType === 'number'
                ? text === ''
                  ? null
                  : Number(text)
                : text
            void onSave(out)
          }}
        />
      )}
    </div>
  )
}

function formatCustomFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'string') {
    // v1 sloeg vaak onderscore-tussenwoorden op ("hele_woning"); cosmetic fix
    return value.replace(/_/g, ' ').replace(/^\s+|\s+$/g, '')
  }
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee'
  if (value === null || value === undefined) return '—'
  return String(value)
}

// ────────────────────────────────────────────────────────────────────────
// Workflow history — workflow-uitvoeringen voor dit contact
// ────────────────────────────────────────────────────────────────────────

function WorkflowHistorySection({ contactId }: { contactId: Id<'contacts'> }) {
  const executions = useQuery(api.workflowExecutions.listByContact, {
    contactId,
  })

  if (executions === undefined) return null
  if (executions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Workflow-uitvoeringen ({executions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {executions.map((exec) => (
          <div
            key={exec._id}
            className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-2.5"
          >
            <Badge
              className={cn(
                'border-0 capitalize',
                exec.status === 'completed' && 'bg-emerald-100 text-emerald-700',
                exec.status === 'running' && 'bg-blue-100 text-blue-700',
                exec.status === 'failed' && 'bg-red-100 text-red-700',
                exec.status === 'paused' && 'bg-amber-100 text-amber-700',
                exec.status === 'cancelled' && 'bg-zinc-100 text-zinc-700',
              )}
            >
              {exec.status}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">
                {exec.workflowName}
              </p>
              <p className="text-xs text-zinc-500">
                {new Date(exec.startedAt).toLocaleString('nl-NL', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
