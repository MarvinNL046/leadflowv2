import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Users, Kanban, MessageSquare, Zap, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/crm/')({ component: CrmDashboard })

function CrmDashboard() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id

  const contactCount = useQuery(
    api.contacts.count,
    workspaceId ? { workspaceId } : 'skip',
  )
  const recentContacts = useQuery(
    api.contacts.list,
    workspaceId ? { workspaceId } : 'skip',
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Overzicht van je CRM-activiteit
        </p>
      </div>

      {/* Stats cards row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Contacts"
          value={contactCount}
          to="/crm/contacts"
        />
        <StatCard
          icon={<Kanban className="h-4 w-4" />}
          label="Opportunities"
          value={0}
          hint="Pipeline-feature wordt straks geport"
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="Berichten 24u"
          value={0}
          hint="Messaging-feature volgt"
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Workflows actief"
          value={0}
          hint="Workflow-engine volgt"
        />
      </div>

      {/* Recent contacts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recente contacts</CardTitle>
            <p className="mt-1 text-xs text-zinc-500">
              Laatste 5 toegevoegde of bewerkte contacts
            </p>
          </div>
          <Link
            to="/crm/contacts"
            className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-900"
          >
            Alle contacts
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentContacts === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : recentContacts.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center">
              <p className="text-sm text-zinc-500">
                Nog geen contacts. Voeg je eerste toe op de Contacts pagina.
              </p>
              <Link
                to="/crm/contacts"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-900"
              >
                Naar contacts
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recentContacts.slice(0, 5).map((c) => {
                const fullName =
                  [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                  c.email ||
                  c.phone ||
                  '(naamloos)'
                return (
                  <li
                    key={c._id}
                    className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900">
                        {fullName}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {[c.email, c.phone, c.city].filter(Boolean).join(' · ')}
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
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  to,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: number | undefined
  to?: string
  hint?: string
}) {
  const body = (
    <Card className={to ? 'transition-shadow hover:shadow-md' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-zinc-500">
          {icon}
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">
          {value === undefined ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            value
          )}
        </div>
        {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
      </CardContent>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}
