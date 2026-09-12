import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import {
  Authenticated,
  Unauthenticated,
  useQuery,
} from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { CrmSidebar, SidebarContent } from '../components/crm/sidebar'
import { CrmTopbar } from '../components/crm/topbar'

export const Route = createFileRoute('/crm')({ component: CrmLayout })

function CrmLayout() {
  return (
    <>
      <Authenticated>
        <CrmShell />
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedRedirect />
      </Unauthenticated>
    </>
  )
}

function CrmShell() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find(t => t.workspace !== null)
  const canManage = tenants?.some(t => t.org?.id === tenant?.org?.id && (t.role === 'owner' || t.role === 'admin')) ?? false
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Sluit drawer automatisch bij route-change — robuuster dan per-Link
  // onClick (TanStack's Link re-renders kunnen handlers verstoren).
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  if(tenants?.length===0)return <main className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-2xl font-bold">Welkom bij LeadFlow</h1><p>Maak je bedrijfsomgeving aan of accepteer een uitnodiging van je team.</p><Link className="text-violet-700 underline" to="/aan-de-slag">Aan de slag</Link></main>

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar (md+) */}
      <CrmSidebar />

      {/* Mobile drawer (< md) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigatie</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <CrmTopbar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {pathname!=='/crm/settings/handleiding' && ['/crm/settings','/crm/workflows','/crm/campaigns'].some(path => pathname === path || pathname.startsWith(path + '/')) && !canManage
            ? <p>{tenants === undefined ? 'Rechten laden…' : 'Alleen een eigenaar of bedrijfsbeheerder kan deze instellingen beheren.'}</p>
            : <Outlet />}
        </main>
      </div>
    </div>
  )
}

function UnauthenticatedRedirect() {
  const navigate = useNavigate()
  void navigate({ to: '/login' })
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <p className="text-sm text-zinc-500">Doorsturen naar login…</p>
    </div>
  )
}
