import {
  createFileRoute,
  Outlet,
  useNavigate,
} from '@tanstack/react-router'
import {
  Authenticated,
  Unauthenticated,
} from 'convex/react'
import { CrmSidebar } from '../components/crm/sidebar'
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
  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50">
      <CrmSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <CrmTopbar />
        <main className="flex-1 overflow-y-auto p-6">
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
