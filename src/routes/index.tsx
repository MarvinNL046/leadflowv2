import { useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useQuery, useMutation } from 'convex/react'
import { useClerk } from '@clerk/clerk-react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold text-zinc-900">LeadFlow v2</h1>
        <p className="mt-2 text-zinc-500">
          TanStack Start + Convex + shadcn — rebuild in progress
        </p>

        <div className="mt-8">
          <Authenticated>
            <AuthenticatedView />
          </Authenticated>
          <Unauthenticated>
            <UnauthenticatedView />
          </Unauthenticated>
        </div>
      </div>
    </div>
  )
}

function AuthenticatedView() {
  const { signOut } = useClerk()
  const profile = useQuery(api.userProfiles.me)
  const tenants = useQuery(api.userProfiles.myTenants)
  const ensureProfile = useMutation(api.userProfiles.getOrCreateUserProfile)

  // Idempotent bootstrap-trigger op page-load. Voor super-admins met
  // existing profile maar zonder memberships (b.v. omdat de tenant-
  // bootstrap pas later is toegevoegd aan getOrCreateUserProfile) zal
  // ensureProfile binnen ensureStaycoolTenant de Staycool-org + workspace
  // + owner-membership aanmaken. Voor alle andere users: no-op.
  useEffect(() => {
    if (profile?.isSuperAdmin && tenants && tenants.length === 0) {
      ensureProfile({}).catch((err) =>
        console.error('[index] bootstrap failed:', err),
      )
    }
  }, [profile, tenants, ensureProfile])

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-emerald-700">
            Ingelogd
          </div>
          {profile === undefined ? (
            <p className="mt-1 text-sm text-zinc-500">Profile laden…</p>
          ) : profile === null ? (
            <p className="mt-1 text-sm text-zinc-500">
              Profile wordt aangemaakt…
            </p>
          ) : (
            <>
              <h2 className="mt-1 text-xl font-semibold">
                Welkom
                {profile.firstName ? `, ${profile.firstName}` : ''}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700">
                  locale: {profile.locale}
                </span>
                {profile.isSuperAdmin && (
                  <span className="rounded bg-[#d7ece8] px-2 py-0.5 font-medium text-[#173a40]">
                    super-admin
                  </span>
                )}
                {profile.lastLoginAt && (
                  <span className="text-xs text-zinc-500">
                    laatst ingelogd:{' '}
                    {new Date(profile.lastLoginAt).toLocaleString('nl-NL')}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => void signOut()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Uitloggen
        </button>
      </div>

      {/* Tenant memberships — auto-bootstrap voor super-admins */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Je tenants
        </div>
        {tenants === undefined ? (
          <p className="mt-1 text-sm text-zinc-500">Laden…</p>
        ) : tenants.length === 0 ? (
          <p className="mt-1 text-sm text-amber-600">
            Geen memberships gevonden. Wacht op een uitnodiging van een
            super-admin.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {tenants.map((t) => (
              <li
                key={t.membershipId}
                className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{t.org?.name ?? '(geen org)'}</span>
                  {t.workspace && (
                    <span className="text-zinc-500"> · {t.workspace.name}</span>
                  )}
                </div>
                <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  {t.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <Link
          to="/crm"
          className="block rounded-md border border-[#bfe1dd] bg-[#e9f5f3] px-4 py-3 text-sm font-medium text-[#173a40] hover:bg-[#d7ece8]"
        >
          → CRM openen (contacts)
        </Link>
      </div>

      <div className="mt-4 rounded-md border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
        <p className="font-medium text-zinc-700">Volgende v2-stappen:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Contacts: detail-page + edit + delete</li>
          <li>Pipeline / Kanban (opportunities)</li>
          <li>Messaging unified table queries</li>
          <li>Workflow engine (Snelle Response port)</li>
          <li>Meta webhook (via Convex HTTP action)</li>
          <li>Invite-flow voor non-super-admin users</li>
        </ul>
      </div>
    </div>
  )
}

function UnauthenticatedView() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Log in om te beginnen</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Eén wetry-login voor de hele suite — met Google of e-mail +
        wachtwoord.
      </p>
      <Link
        to="/login"
        className="mt-4 inline-block rounded-md bg-[#173a40] px-4 py-2 text-sm font-medium text-white hover:bg-[#328f97]"
      >
        Naar inloggen →
      </Link>
    </div>
  )
}
