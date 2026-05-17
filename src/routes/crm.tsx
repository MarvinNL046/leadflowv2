import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/crm')({ component: CrmPage })

function CrmPage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <Link
              to="/"
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              ← home
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-zinc-900">
              CRM — Contacts
            </h1>
          </div>
        </header>

        <Authenticated>
          <ContactsContent />
        </Authenticated>
        <Unauthenticated>
          <UnauthenticatedRedirect />
        </Unauthenticated>
      </div>
    </div>
  )
}

function UnauthenticatedRedirect() {
  const navigate = useNavigate()
  // Direct doorsturen naar login
  void navigate({ to: '/login' })
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-zinc-500">Doorsturen naar login…</p>
    </div>
  )
}

function ContactsContent() {
  // Voor MVP: pak het eerste tenant van de current user — straks komt
  // hier een workspace-context provider + switcher in de header.
  const tenants = useQuery(api.userProfiles.myTenants)

  if (tenants === undefined) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-500">Workspaces laden…</p>
      </div>
    )
  }

  const firstWithWorkspace = tenants.find((t) => t.workspace !== null)
  if (!firstWithWorkspace || !firstWithWorkspace.workspace) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Je hebt nog geen workspace. Vraag een super-admin om een invite, of
        log opnieuw in om de tenant-bootstrap te triggeren.
      </div>
    )
  }

  return (
    <ContactsList
      workspaceId={firstWithWorkspace.workspace.id}
      workspaceName={firstWithWorkspace.workspace.name}
      orgName={firstWithWorkspace.org?.name ?? ''}
    />
  )
}

function ContactsList({
  workspaceId,
  workspaceName,
  orgName,
}: {
  workspaceId: any
  workspaceName: string
  orgName: string
}) {
  const contacts = useQuery(api.contacts.list, { workspaceId })
  const totalCount = useQuery(api.contacts.count, { workspaceId })

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Active workspace
            </div>
            <div className="text-base font-medium">
              {orgName} · {workspaceName}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Contacts
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {totalCount ?? '…'}
            </div>
          </div>
        </div>
      </div>

      <CreateContactForm workspaceId={workspaceId} />

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-700">
            Recente contacts (max 100)
          </h2>
        </div>
        {contacts === undefined ? (
          <div className="p-6 text-sm text-zinc-500">Laden…</div>
        ) : contacts.length === 0 ? (
          <div className="p-6 text-sm text-zinc-500">
            Nog geen contacts. Voeg je eerste hierboven toe.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {contacts.map((c) => {
              const fullName = [c.firstName, c.lastName]
                .filter(Boolean)
                .join(' ')
              const display = fullName || c.email || c.phone || '(naamloos)'
              return (
                <li
                  key={c._id}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-zinc-900">
                      {display}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span>{c.phone}</span>}
                      {c.company && <span>{c.company}</span>}
                      {c.city && <span>{c.city}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {new Date(c._creationTime).toLocaleDateString('nl-NL')}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function CreateContactForm({ workspaceId }: { workspaceId: any }) {
  const create = useMutation(api.contacts.create)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [city, setCity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await create({
        workspaceId,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        company: company || undefined,
        city: city || undefined,
      })
      // reset form bij succes
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setCompany('')
      setCity('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-700">Nieuwe contact</h2>
      <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Voornaam" value={firstName} onChange={setFirstName} />
        <Field label="Achternaam" value={lastName} onChange={setLastName} />
        <Field
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
        />
        <Field label="Telefoon" type="tel" value={phone} onChange={setPhone} />
        <Field label="Bedrijf" value={company} onChange={setCompany} />
        <Field label="Plaats" value={city} onChange={setCity} />

        <div className="col-span-2 flex items-center justify-between gap-3">
          {error ? (
            <div className="text-sm text-rose-700">{error}</div>
          ) : (
            <div className="text-xs text-zinc-500">
              Minstens één veld is verplicht
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? 'Opslaan…' : 'Contact toevoegen'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-zinc-600">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />
    </label>
  )
}
