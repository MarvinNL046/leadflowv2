import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useQuery } from 'convex/react'
import { ArrowLeft, Menu, Store } from "@/components/icons"
import { CrmSidebar, SidebarContent } from '#/components/crm/sidebar.tsx'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet.tsx'
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
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50">
      <CrmSidebar />
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigatie</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Navigatie openen"
              aria-expanded={drawerOpen}
              className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Store className="h-5 w-5 text-violet-600" />
            <span className="font-semibold text-zinc-900">
              LeadFlow Marketplace
            </span>
            <nav aria-label="Marketplace-tabbladen" className="order-last flex w-full gap-1 overflow-x-auto">
              {TABS.map((t) => {
                const active = t.exact
                  ? pathname === t.to
                  : pathname.startsWith(t.to)
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
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
            {/* Direct terug naar het CRM, ook zonder het mobiele menu te openen. */}
            <Link
              to="/crm"
              className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Naar CRM
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
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
