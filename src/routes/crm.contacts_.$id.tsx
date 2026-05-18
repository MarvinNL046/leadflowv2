import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
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
} from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { cn } from '#/lib/utils.ts'
import { getMetaFormLabel } from '#/lib/meta-forms.ts'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/contacts_/$id')({
  component: ContactDetailPage,
})

function ContactDetailPage() {
  const { id } = Route.useParams()
  const detail = useQuery(api.contacts.getDetail, {
    contactId: id as Id<'contacts'>,
  })
  const notes = useQuery(api.notes.listByContact, {
    contactId: id as Id<'contacts'>,
  })

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/crm"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
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
          </div>
        </div>
      </div>

      <DetailsSection contact={contact} />
      <NotesSection
        contactId={id as Id<'contacts'>}
        notes={notes ?? null}
      />
      <ActivitySection
        contact={contact}
        attribution={attribution}
        metaRaw={metaRaw}
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
        err instanceof Error ? err.message : 'Kon contact niet bijwerken',
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
      toast.error(err instanceof Error ? err.message : 'Kon notitie niet opslaan')
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
