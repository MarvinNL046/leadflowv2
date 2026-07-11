import { useState, useEffect, useMemo } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Plus, ChevronDown, Search, Upload } from "@/components/icons"
import { Button } from '#/components/ui/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { cn } from '#/lib/utils.ts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const PAGE_SIZE = 25

export const Route = createFileRoute('/crm/contacts')({
  component: ContactsPage,
})

function ContactsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id

  if (tenants === undefined) {
    return <Skeleton className="h-32 w-full" />
  }
  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">
            Geen workspace gekoppeld. Log uit en opnieuw in om de
            tenant-bootstrap te triggeren.
          </p>
        </CardContent>
      </Card>
    )
  }

  return <ContactsContent workspaceId={workspaceId} />
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Nieuwste eerst' },
  { value: 'oldest', label: 'Oudste eerst' },
  { value: 'name_asc', label: 'Naam A-Z' },
  { value: 'name_desc', label: 'Naam Z-A' },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]['value']

const ALL_CITIES = '__all__'
const ALL_SOURCES = '__all__'

// Sync met convex/schema.ts leadAttribution.source union (meta/api/manual).
const SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta',
  api: 'Website',
  manual: 'Handmatig',
}

function ContactsContent({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [hasEmail, setHasEmail] = useState(false)
  const [hasPhone, setHasPhone] = useState(false)
  const [city, setCity] = useState<string>(ALL_CITIES)
  const [source, setSource] = useState<string>(ALL_SOURCES)
  const [sort, setSort] = useState<SortValue>('newest')
  const [limit, setLimit] = useState(PAGE_SIZE)
  // Plaats-dropdown is LAZY: contactCities scant de hele workspace, dus we
  // vragen 'm pas op zodra de gebruiker het filter opent (of al een plaats
  // gekozen heeft). Zo trekt een kale page-load niet ~4.700 docs mee.
  const [citiesWanted, setCitiesWanted] = useState(false)

  // Debounce de zoekterm (voorkomt een query per toetsaanslag).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset paginatie als zoekopdracht/filters/sortering wijzigt.
  // `limit` staat bewust NIET in de deps — anders zou dit bij elke
  // "Toon 25 meer" opnieuw resetten (lus).
  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [debouncedSearch, hasEmail, hasPhone, city, sort, source])

  // Stabiele referentie voor de query-args. Convex `useQuery` vergelijkt args
  // by-value (geen echte loop bij een nieuw object), maar useMemo houdt het
  // netjes en voorkomt twijfel over re-subscribes.
  const filters = useMemo(
    () => ({
      ...(hasEmail ? { hasEmail: true } : {}),
      ...(hasPhone ? { hasPhone: true } : {}),
      ...(city !== ALL_CITIES ? { city } : {}),
      ...(source !== ALL_SOURCES
        ? { source: source as 'meta' | 'api' | 'manual' }
        : {}),
    }),
    [hasEmail, hasPhone, city, source],
  )

  // Lazy: pas laden als het plaats-filter geopend is of al een stad actief is.
  const cities = useQuery(
    api.contacts.contactCities,
    citiesWanted || city !== ALL_CITIES ? { workspaceId } : 'skip',
  )
  const data = useQuery(api.contacts.searchContacts, {
    workspaceId,
    search: debouncedSearch || undefined,
    filters,
    sort,
    limit,
  })

  const isLoading = data === undefined
  const contacts = data?.contacts ?? []
  const hasMore = data?.hasMore ?? false
  // Workspace-totaal voor de header van de ongefilterde lijst. searchContacts
  // kent het totaal alleen in het zoek/filter-pad (echte count); in het
  // bladerpad is total null. We laden de aparte count-query dan LAZY — pas
  // nadat de lijst er staat — zodat een kale page-load niet ~4.700 docs scant
  // vóór de eerste paint. Bij zoeken/filteren is data.total al exact, dus dan
  // slaan we de count-query over ('skip').
  const needsWorkspaceCount = data !== undefined && data.total === null
  const workspaceCount = useQuery(
    api.contacts.count,
    needsWorkspaceCount ? { workspaceId } : 'skip',
  )
  // total: exact bij zoeken/filteren; anders de (lazy) workspace-count.
  const total =
    data === undefined ? null : (data.total ?? workspaceCount ?? null)
  const filtersActive =
    debouncedSearch !== '' ||
    hasEmail ||
    hasPhone ||
    city !== ALL_CITIES ||
    source !== ALL_SOURCES

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isLoading
              ? '…'
              : total === null
                ? // Grand total wordt lazy geladen (count-query); toon vast de
                  // reeds geladen rijen zodat de header niet op '…' blijft hangen.
                  `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`
                : `${contacts.length} van ${total.toLocaleString('nl-NL')} ${total === 1 ? 'contact' : 'contacts'}`}
          </p>
        </div>
        <Link
          to="/crm/contacts/import"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Upload className="h-4 w-4" />
          Importeren
        </Link>
      </div>

      <CreateContactForm workspaceId={workspaceId} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Alle contacts</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op naam, e-mail, telefoon, bedrijf, plaats…"
                className="pl-9"
              />
            </div>

            <Select value={sort} onValueChange={(v) => setSort(v as SortValue)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={city}
              onValueChange={setCity}
              onOpenChange={(open) => {
                // Trigger de lazy contactCities-query pas bij het openen.
                if (open) setCitiesWanted(true)
              }}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Alle plaatsen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CITIES}>Alle plaatsen</SelectItem>
                {cities === undefined && citiesWanted ? (
                  <div className="px-2 py-1.5 text-xs text-zinc-400">
                    Plaatsen laden…
                  </div>
                ) : (
                  (cities ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Alle bronnen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SOURCES}>Alle bronnen</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="api">Website</SelectItem>
                <SelectItem value="manual">Handmatig</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHasEmail((v) => !v)}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  hasEmail
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50',
                )}
              >
                Heeft e-mail
              </button>
              <button
                type="button"
                onClick={() => setHasPhone((v) => !v)}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  hasPhone
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50',
                )}
              >
                Heeft telefoon
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {filtersActive
                ? 'Geen contacten gevonden voor deze zoekopdracht/filters.'
                : 'Nog geen contacts. Voeg je eerste hierboven toe.'}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-zinc-100">
                {contacts.map((c) => {
                  const fullName = [c.firstName, c.lastName]
                    .filter(Boolean)
                    .join(' ')
                  const display =
                    fullName || c.email || c.phone || '(naamloos)'
                  const initials = (fullName || c.email || '?')
                    .slice(0, 2)
                    .toUpperCase()
                  return (
                    <li key={c._id}>
                      <Link
                        to="/crm/contacts/$id"
                        params={{ id: c._id }}
                        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-zinc-50/60"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d7ece8] text-xs font-medium text-[#173a40]">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-zinc-900">
                            {display}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                            {c.email && <span className="truncate">{c.email}</span>}
                            {c.phone && <span>· {c.phone}</span>}
                            {c.company && <span>· {c.company}</span>}
                            {c.city && (
                              <Badge variant="secondary" className="text-xs">
                                {c.city}
                              </Badge>
                            )}
                            {c.source && SOURCE_LABELS[c.source] && (
                              <Badge
                                variant="outline"
                                className="text-xs text-zinc-500"
                              >
                                {SOURCE_LABELS[c.source]}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-zinc-400">
                          {new Date(c._creationTime).toLocaleDateString('nl-NL')}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLimit((l) => l + PAGE_SIZE)}
                    className="w-full max-w-xs border-dashed"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Toon {PAGE_SIZE} meer
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CreateContactForm({ workspaceId }: { workspaceId: any }) {
  const create = useMutation(api.contacts.create)
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [city, setCity] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await create({
        workspaceId,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        company: company || undefined,
        city: city || undefined,
      })
      if (result.isDuplicate && result.contact) {
        toast.info('Bestaand contact gevonden — geopend i.p.v. nieuwe', {
          duration: 5000,
        })
        void navigate({
          to: '/crm/contacts/$id',
          params: { id: result.contact._id },
        })
      } else {
        toast.success('Contact toegevoegd')
        setFirstName('')
        setLastName('')
        setEmail('')
        setPhone('')
        setCompany('')
        setCity('')
      }
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Kon contact niet toevoegen'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nieuwe contact</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <Field
            id="firstName"
            label="Voornaam"
            value={firstName}
            onChange={setFirstName}
          />
          <Field
            id="lastName"
            label="Achternaam"
            value={lastName}
            onChange={setLastName}
          />
          <Field
            id="email"
            label="E-mail"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <Field
            id="phone"
            label="Telefoon"
            type="tel"
            value={phone}
            onChange={setPhone}
          />
          <Field
            id="company"
            label="Bedrijf"
            value={company}
            onChange={setCompany}
          />
          <Field
            id="city"
            label="Plaats"
            value={city}
            onChange={setCity}
          />
          <div className="col-span-1 flex items-center justify-between gap-3 sm:col-span-2">
            <p className="text-xs text-zinc-500">
              Minstens één veld is verplicht
            </p>
            <Button type="submit" disabled={submitting}>
              <Plus className="h-4 w-4" />
              {submitting ? 'Opslaan…' : 'Contact toevoegen'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
