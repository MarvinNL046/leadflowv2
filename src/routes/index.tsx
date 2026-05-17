import { createFileRoute, Link } from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
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
  const { signOut } = useAuthActions()
  const profile = useQuery(api.userProfiles.me)

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
            <p className="mt-1 text-sm text-amber-600">
              Geen profile gevonden. Probeer opnieuw in te loggen.
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
                  <span className="rounded bg-violet-100 px-2 py-0.5 font-medium text-violet-800">
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

      <div className="mt-6 rounded-md border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
        <p className="font-medium text-zinc-700">Volgende v2-stappen:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Multi-tenant: orgs + workspaces + memberships seed</li>
          <li>CRM core: contacts list + detail + create</li>
          <li>Messaging unified table queries</li>
          <li>Workflow engine (Snelle Response port)</li>
          <li>Meta webhook (via Convex HTTP action)</li>
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
        Convex Auth met email + wachtwoord. Google OAuth volgt zodra de
        credentials gezet zijn.
      </p>
      <Link
        to="/login"
        className="mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
      >
        Naar inloggen →
      </Link>
    </div>
  )
}
