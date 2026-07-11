import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Users,
  Kanban,
  MessageSquare,
  Zap,
  Send,
  Settings,
  ExternalLink,
  Snowflake,
  Receipt,
} from "@/components/icons"
import { useQuery } from 'convex/react'
import { cn } from '#/lib/utils.ts'
import { CASHFLOW_URL, FROSTWORK_URL } from '#/lib/external-apps.ts'
import { api } from '../../../convex/_generated/api'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { to: '/crm', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/crm/contacts', label: 'Contacts', icon: Users },
  { to: '/crm/pipelines', label: 'Pipelines', icon: Kanban },
  { to: '/crm/messages', label: 'Messages', icon: MessageSquare },
  { to: '/crm/workflows', label: 'Workflows', icon: Zap },
  { to: '/crm/campaigns', label: 'Campagnes', icon: Send },
]

const EXTERNAL_NAV = [
  { href: `${FROSTWORK_URL}/customers`, label: 'Frostwork', icon: Snowflake },
  { href: `${CASHFLOW_URL}/dashboard`, label: 'Cashflow', icon: Receipt },
]

/**
 * Sidebar voor desktop (md+). Op mobile wordt SidebarContent zonder
 * aside-wrapper in een Sheet drawer gerenderd — zie crm.tsx.
 */
export function CrmSidebar() {
  return (
    <aside className="hidden h-screen w-56 flex-col border-r border-zinc-200 bg-white md:flex">
      <SidebarContent />
    </aside>
  )
}

/**
 * Pure content (geen wrapper) — voor hergebruik in mobile-Sheet.
 * onNavigate-callback: voor mobile, sluit de drawer bij klikken op
 * een nav-item.
 */
export function SidebarContent({
  onNavigate,
}: {
  onNavigate?: () => void
}) {
  const { location } = useRouterState()

  // Globale "concepten wachten"-teller — zichtbaar vanaf elke CRM-pagina.
  const tenants = useQuery(api.userProfiles.myTenants)
  const workspaceId = tenants?.find((t) => t.workspace !== null)?.workspace?.id
  const pendingIds = useQuery(
    api.aiLeadResponse.pendingConceptContactIds,
    workspaceId ? { workspaceId } : 'skip',
  )
  const pendingCount = pendingIds?.length ?? 0

  // Globale ongelezen-inbox-teller — bolletje bij "Messages" zodat 't team
  // intuïtief de inbox checkt. inboxUnreadCounts telt alleen ongelezen inbound.
  const unread = useQuery(
    api.messaging.inboxUnreadCounts,
    workspaceId ? { workspaceId } : 'skip',
  )
  const unreadCount = unread?.total ?? 0

  return (
    <>
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center border-b border-zinc-200 px-4">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2"
        >
          <img
            src="/logo/wetryleadflow-logo-trans-bg.webp"
            alt="LeadFlow"
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span className="text-base font-semibold tracking-tight text-zinc-900">
            LeadFlow
          </span>
        </Link>
      </div>

      {/* Externe apps — bovenaan, zelfde plek als de switcher in
          frostwork/cashflow zodat de suite overal gelijk voelt */}
      <div className="shrink-0 border-b border-zinc-200 p-2">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Apps
        </p>
        {EXTERNAL_NAV.map((app) => {
          const Icon = app.icon
          return (
            <a
              key={app.href}
              href={app.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              <Icon className="h-4 w-4" />
              {app.label}
              <ExternalLink className="ml-auto h-3 w-3 text-zinc-400" />
            </a>
          )
        })}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const Icon = item.icon
          const isActive =
            item.to === '/crm'
              ? location.pathname === '/crm'
              : location.pathname.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-700 hover:bg-zinc-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {item.to === '/crm' && pendingCount > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                  {pendingCount}
                </span>
              )}
              {item.to === '/crm/messages' && unreadCount > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
          )
        })}

      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-zinc-200 p-2">
        <Link
          to="/crm/settings"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            location.pathname.startsWith('/crm/settings')
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700',
          )}
        >
          <Settings className="h-4 w-4" />
          Instellingen
        </Link>
      </div>
    </>
  )
}
