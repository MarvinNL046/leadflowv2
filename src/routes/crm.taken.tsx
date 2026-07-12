import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { CheckCircle2 } from '@/components/icons'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/taken')({ component: TasksPage })

/**
 * Taken-werklijst: follow-ups per contact, o.a. automatisch gevoed door
 * cashflow's heractiveren-flow ("verlopen offerte nabellen"). Vroegste
 * vervaldatum bovenaan; afvinken = klaar.
 */
function TasksPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined
  const tasks = useQuery(
    api.tasks.listOpen,
    workspaceId ? { workspaceId } : 'skip',
  )
  const setDone = useMutation(api.tasks.setDone)

  if (tenants === undefined || (workspaceId && tasks === undefined)) {
    return <Skeleton className="h-64 w-full" />
  }
  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
        </CardContent>
      </Card>
    )
  }

  const now = Date.now()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Taken</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open follow-ups — inclusief nabel-taken uit Cashflow (verlopen
          offertes). Afvinken = klaar.
        </p>
      </div>

      {tasks !== undefined && tasks.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 font-medium">Geen open taken</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Alles is opgevolgd.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {(tasks ?? []).map((task) => {
                const overdue =
                  task.dueDate !== undefined && task.dueDate < now
                return (
                  <li
                    key={task._id}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={false}
                      onChange={() =>
                        void setDone({ taskId: task._id, done: true })
                      }
                      aria-label={`Vink af: ${task.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{task.title}</p>
                      {task.description && (
                        <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {task.contactId && task.contactName ? (
                          <Link
                            to="/crm/contacts/$id"
                            params={{ id: task.contactId }}
                            className="text-primary hover:underline"
                          >
                            {task.contactName}
                          </Link>
                        ) : null}
                        {task.contactPhone ? (
                          <>
                            {' · '}
                            <a
                              href={`tel:${task.contactPhone}`}
                              className="text-primary hover:underline"
                            >
                              {task.contactPhone}
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {task.dueDate !== undefined && (
                      <span
                        className={cn(
                          'whitespace-nowrap text-xs',
                          overdue
                            ? 'font-medium text-red-600'
                            : 'text-muted-foreground',
                        )}
                      >
                        {new Date(task.dueDate).toLocaleDateString('nl-NL')}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void setDone({ taskId: task._id, done: true })
                      }
                    >
                      Klaar
                    </Button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
