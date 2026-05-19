import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react'
import { toast } from 'sonner'
import { Plus, ChevronDown } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
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

function ContactsContent({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const totalCount = useQuery(api.contacts.count, { workspaceId })
  const { results, status, loadMore } = usePaginatedQuery(
    api.contacts.listPaginated,
    { workspaceId },
    { initialNumItems: PAGE_SIZE },
  )

  const isLoading = status === 'LoadingFirstPage'
  const hasMore = status === 'CanLoadMore'
  const isLoadingMore = status === 'LoadingMore'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {totalCount === undefined
              ? '…'
              : `${results.length} van ${totalCount.toLocaleString('nl-NL')} ${totalCount === 1 ? 'contact' : 'contacts'}`}
          </p>
        </div>
      </div>

      <CreateContactForm workspaceId={workspaceId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alle contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              Nog geen contacts. Voeg je eerste hierboven toe.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-zinc-100">
                {results.map((c) => {
                  const fullName = [c.firstName, c.lastName]
                    .filter(Boolean)
                    .join(' ')
                  const display =
                    fullName || c.email || c.phone || '(naamloos)'
                  const initials = (
                    fullName ||
                    c.email ||
                    '?'
                  )
                    .slice(0, 2)
                    .toUpperCase()
                  return (
                    <li key={c._id}>
                      <Link
                        to="/crm/contacts/$id"
                        params={{ id: c._id }}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 transition-colors hover:bg-zinc-50/60 -mx-2 px-2 rounded-md"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-medium text-violet-800">
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
                    onClick={() => loadMore(PAGE_SIZE)}
                    disabled={isLoadingMore}
                    className="w-full max-w-xs border-dashed"
                  >
                    <ChevronDown className="h-4 w-4" />
                    {isLoadingMore ? 'Laden…' : `Toon ${PAGE_SIZE} meer`}
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
