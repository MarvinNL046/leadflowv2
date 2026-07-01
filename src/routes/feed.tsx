import { useEffect } from 'react'
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useQuery } from 'convex/react'
import { Store } from 'lucide-react'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/feed')({ component: FeedLayout })

function FeedLayout() {
  return (
    <>
      <Authenticated>
        <FeedGate />
      </Authenticated>
      <Unauthenticated>
        <RedirectTo to="/login" label="Doorsturen naar login…" />
      </Unauthenticated>
    </>
  )
}

/**
 * Access gate: resolves marketplace access server-side. While loading →
 * skeleton; no access → redirect to /crm. Mirrors crm.tsx's
 * Authenticated/Unauthenticated shell pattern.
 */
function FeedGate() {
  const access = useQuery(api.marketplace.access.marketplaceAccess)

  if (access === undefined) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (!access.ok) {
    return <RedirectTo to="/crm" label="Geen marketplace-toegang…" />
  }
  return <FeedShell />
}

const TABS = [
  { to: '/feed', label: 'Offerteaanvragen', exact: true },
  { to: '/feed/purchased', label: 'Ontgrendeld', exact: false },
  { to: '/feed/wallet', label: 'Tegoed', exact: false },
] as const

function FeedShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="min-h-screen w-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Store className="h-5 w-5 text-violet-600" />
          <span className="font-semibold text-zinc-900">
            LeadFlow Marketplace
          </span>
          <nav className="ml-6 flex gap-1">
            {TABS.map((t) => {
              const active = t.exact
                ? pathname === t.to
                : pathname.startsWith(t.to)
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-violet-50 text-violet-800'
                      : 'text-zinc-600 hover:bg-zinc-100',
                  )}
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}

function RedirectTo({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  useEffect(() => {
    void navigate({ to })
  }, [navigate, to])
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50">
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  )
}
