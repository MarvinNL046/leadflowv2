import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Users,
  Kanban,
  MessageSquare,
  Zap,
  Settings,
} from 'lucide-react'
import { cn } from '#/lib/utils.ts'

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
]

export function CrmSidebar() {
  const { location } = useRouterState()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-zinc-200 bg-white">
      {/* Brand */}
      <div className="flex h-14 items-center border-b border-zinc-200 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-violet-600 text-xs font-bold text-white">
            L
          </div>
          <span className="text-sm font-semibold">LeadFlow v2</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => {
          const Icon = item.icon
          // Active state: exact match voor /crm dashboard, prefix-match
          // voor sub-routes
          const isActive =
            item.to === '/crm'
              ? location.pathname === '/crm'
              : location.pathname.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-violet-50 text-violet-900'
                  : 'text-zinc-700 hover:bg-zinc-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-200 p-2">
        <Link
          to="/crm"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <Settings className="h-4 w-4" />
          Instellingen
        </Link>
      </div>
    </aside>
  )
}
