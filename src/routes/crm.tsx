import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import {
  Authenticated,
  Unauthenticated,
} from 'convex/react'
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Sluit drawer automatisch bij route-change — robuuster dan per-Link
  // onClick (TanStack's Link re-renders kunnen handlers verstoren).
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50">
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function UnauthenticatedRedirect() {
  const navigate = useNavigate()
  void navigate({ to: '/login' })
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50">
      <p className="text-sm text-zinc-500">Doorsturen naar login…</p>
    </div>
  )
}
