import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, usePaginatedQuery } from 'convex/react'
import {
  Mail,
  MessageSquare,
  MessageCircle,
  Inbox,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  AlertCircle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/messages')({
  component: MessagesPage,
})

const PAGE_SIZE = 25
type Channel = 'all' | 'email' | 'sms' | 'whatsapp'

function MessagesPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined

  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
        </CardContent>
      </Card>
    )
  }
  return <MessagesContent workspaceId={workspaceId} />
}

function MessagesContent({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>
}) {
  const [channel, setChannel] = useState<Channel>('all')
  const { results, status, loadMore } = usePaginatedQuery(
    api.messaging.listByWorkspace,
    {
      workspaceId,
      ...(channel === 'all' ? {} : { channel }),
    },
    { initialNumItems: PAGE_SIZE },
  )

  const isLoading = status === 'LoadingFirstPage'
  const hasMore = status === 'CanLoadMore'
  const isLoadingMore = status === 'LoadingMore'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/20 to-blue-500/20">
          <Inbox className="h-4.5 w-4.5 text-sky-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Messages</h1>
          <p className="text-xs text-zinc-500">
            Alle outbound berichten via Resend + Voidfix
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-100 p-1">
        <FilterTab
          active={channel === 'all'}
          onClick={() => setChannel('all')}
        >
          <Inbox className="h-3.5 w-3.5" /> Alle
        </FilterTab>
        <FilterTab
          active={channel === 'email'}
          onClick={() => setChannel('email')}
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </FilterTab>
        <FilterTab
          active={channel === 'sms'}
          onClick={() => setChannel('sms')}
        >
          <MessageSquare className="h-3.5 w-3.5" /> SMS
        </FilterTab>
        <FilterTab
          active={channel === 'whatsapp'}
          onClick={() => setChannel('whatsapp')}
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </FilterTab>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              Geen berichten in dit filter
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {results.map((m) => (
                <MessageRow key={m._id} message={m} />
              ))}
            </ul>
          )}

          {hasMore && (
            <div className="border-t border-zinc-100 p-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(PAGE_SIZE)}
                disabled={isLoadingMore}
                className="w-full border-dashed"
              >
                <ChevronDown className="h-4 w-4" />
                {isLoadingMore ? 'Laden…' : `Toon ${PAGE_SIZE} meer`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-white text-zinc-900 shadow-sm'
          : 'text-zinc-600 hover:bg-zinc-200',
      )}
    >
      {children}
    </button>
  )
}

function MessageRow({
  message,
}: {
  message: {
    _id: string
    _creationTime: number
    channel: string
    status: string
    to: string
    subject?: string
    body: string
    contactId?: string
    contactName: string | null
    errorMessage?: string
    sentAt?: number
  }
}) {
  const meta: Record<
    string,
    { icon: typeof Mail; className: string; label: string }
  > = {
    email: {
      icon: Mail,
      className: 'bg-blue-100 text-blue-700',
      label: 'Email',
    },
    sms: {
      icon: MessageSquare,
      className: 'bg-emerald-100 text-emerald-700',
      label: 'SMS',
    },
    whatsapp: {
      icon: MessageCircle,
      className: 'bg-green-100 text-green-700',
      label: 'WhatsApp',
    },
    messenger: {
      icon: MessageCircle,
      className: 'bg-violet-100 text-violet-700',
      label: 'Messenger',
    },
  }
  const m = meta[message.channel] ?? {
    icon: Inbox,
    className: 'bg-zinc-100 text-zinc-700',
    label: message.channel,
  }
  const Icon = m.icon
  const bodyPreview = message.body.length > 140
    ? message.body.slice(0, 140) + '…'
    : message.body
  const when = message.sentAt ?? message._creationTime

  return (
    <li className="flex items-start gap-3 p-4">
      <Badge
        className={cn(
          'mt-0.5 border-0 px-2 py-0.5 text-xs',
          m.className,
        )}
      >
        <Icon className="mr-1 h-3 w-3" /> {m.label}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {message.contactId ? (
            <Link
              to="/crm/contacts/$id"
              params={{ id: message.contactId }}
              className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
            >
              {message.contactName ?? message.to}
            </Link>
          ) : (
            <span className="font-medium text-zinc-700">{message.to}</span>
          )}
          <span className="text-xs text-zinc-400">· {message.to}</span>
          <StatusBadge status={message.status} />
        </div>
        {message.subject && (
          <p className="mt-0.5 truncate text-sm font-medium text-zinc-700">
            {message.subject}
          </p>
        )}
        <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-zinc-500">
          {bodyPreview}
        </p>
        {message.errorMessage && (
          <p className="mt-1 flex items-start gap-1 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {message.errorMessage}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-zinc-400">
        {new Date(when).toLocaleString('nl-NL', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </span>
    </li>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent' || status === 'delivered') {
    return (
      <span className="flex items-center gap-0.5 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> {status}
      </span>
    )
  }
  if (status === 'failed' || status === 'bounced') {
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-600">
        <XCircle className="h-3 w-3" /> {status}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-zinc-400">
      <Clock className="h-3 w-3" /> {status}
    </span>
  )
}
