import { useState, useMemo, useEffect, useRef } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useAction, useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  Mail,
  MessageSquare,
  MessageCircle,
  Inbox,
  Search,
  Send,
  Phone,
  MapPin,
  ExternalLink,
  ArrowLeft,
  CheckCheck,
  Archive,
  ArchiveRestore,
  FileText,
} from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '#/components/ui/dropdown-menu.tsx'
import { cn } from '#/lib/utils.ts'
import { humanizeConvexError } from '#/lib/errors.ts'
import { renderTemplateForChannel } from '#/lib/templates.ts'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/messages')({
  component: MessagesPage,
})

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
  return <MessagesShell workspaceId={workspaceId} />
}

function MessagesShell({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const [channel, setChannel] = useState<Channel>('all')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selectedContactId, setSelectedContactId] =
    useState<Id<'contacts'> | null>(null)
  const [markingAllRead, setMarkingAllRead] = useState(false)

  const conversations = useQuery(api.messaging.listConversations, {
    workspaceId,
    ...(channel === 'all' ? {} : { channel }),
    ...(showArchived ? { includeArchived: true } : {}),
  })
  const unreadCounts = useQuery(api.messaging.inboxUnreadCounts, { workspaceId })
  const markAllRead = useMutation(api.messaging.markAllRead)
  const markConversationRead = useMutation(api.messaging.markConversationRead)
  const archiveConversation = useMutation(api.messaging.archiveConversation)
  const unarchiveConversation = useMutation(api.messaging.unarchiveConversation)

  async function handleArchive(contactId: Id<'contacts'>, archived: boolean) {
    try {
      if (archived) {
        await unarchiveConversation({ contactId })
        toast.success('Gesprek teruggezet')
      } else {
        await archiveConversation({ contactId })
        toast.success('Gesprek gearchiveerd')
        if (selectedContactId === contactId) setSelectedContactId(null)
      }
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Archiveren mislukt'))
    }
  }

  // Markeer een gesprek als gelezen zodra het geopend wordt → ongelezen-bolletje verdwijnt.
  useEffect(() => {
    if (selectedContactId) {
      void markConversationRead({ workspaceId, contactId: selectedContactId }).catch(
        () => {},
      )
    }
  }, [selectedContactId, workspaceId, markConversationRead])

  const unreadCount =
    conversations?.reduce((sum, c) => sum + (c.unread ? 1 : 0), 0) ?? 0

  async function handleMarkAllRead() {
    if (markingAllRead || unreadCount === 0) return
    setMarkingAllRead(true)
    try {
      const result = await markAllRead({ workspaceId })
      toast.success(
        result.marked === 0
          ? 'Geen ongelezen berichten'
          : `${result.marked} ${result.marked === 1 ? 'bericht' : 'berichten'} gemarkeerd als gelezen`,
      )
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Markeren mislukt'))
    } finally {
      setMarkingAllRead(false)
    }
  }

  const filtered = useMemo(() => {
    if (!conversations) return []
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) =>
      [c.contactName, c.contactEmail, c.contactPhone, c.lastMessageBody]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q)),
    )
  }, [conversations, search])

  return (
    // Sub: 14 (topbar) + 4 (main padding) + 6 (gap to header) ≈ 96px taken
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col bg-white sm:-m-6">
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Conversation list */}
        <div
          className={cn(
            'flex w-full flex-col border-r border-zinc-200 sm:w-80 md:w-96',
            selectedContactId && 'hidden sm:flex',
          )}
        >
          <div className="border-b border-zinc-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h1 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                <Inbox className="h-4 w-4 text-sky-600" />
                Berichten
                {conversations && (
                  <Badge variant="secondary" className="text-xs">
                    {conversations.length}
                  </Badge>
                )}
                {unreadCount > 0 && (
                  <Badge className="border-0 bg-sky-100 text-sky-700 text-xs">
                    {unreadCount} ongelezen
                  </Badge>
                )}
              </h1>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleMarkAllRead}
                disabled={markingAllRead || unreadCount === 0}
                title={
                  unreadCount === 0
                    ? 'Alle berichten zijn al gelezen'
                    : `Markeer ${unreadCount} ongelezen ${unreadCount === 1 ? 'bericht' : 'berichten'} als gelezen`
                }
                className="h-7 text-xs text-zinc-600 hover:text-zinc-900"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAllRead ? 'Bezig…' : 'Alles gelezen'}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op naam, email, telefoon, tekst…"
                className="h-9 pl-8"
              />
            </div>
            <div className="grid grid-cols-4 gap-1 rounded-md bg-zinc-100 p-0.5">
              {(['all', 'sms', 'whatsapp', 'email'] as Channel[]).map((c) => (
                <ChannelFilterButton
                  key={c}
                  active={channel === c}
                  channel={c}
                  unread={
                    c === 'all'
                      ? (unreadCounts?.total ?? 0)
                      : (unreadCounts?.[c] ?? 0)
                  }
                  onClick={() => setChannel(c)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowArchived((s) => !s)}
              className="px-1 text-left text-xs text-zinc-500 hover:text-zinc-800"
            >
              {showArchived
                ? '← Terug naar actieve gesprekken'
                : 'Toon gearchiveerde gesprekken'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations === undefined ? (
              <div className="space-y-1 p-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-400">
                Geen conversaties in dit filter
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {filtered.map((c) => (
                  <ConversationRow
                    key={c.contactId}
                    conv={c}
                    active={selectedContactId === c.contactId}
                    onClick={() => setSelectedContactId(c.contactId)}
                    onArchive={() => handleArchive(c.contactId, c.archived)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Conversation view */}
        <div
          className={cn(
            'flex flex-1 flex-col',
            !selectedContactId && 'hidden sm:flex',
          )}
        >
          {selectedContactId ? (
            <ConversationView
              contactId={selectedContactId}
              onBack={() => setSelectedContactId(null)}
            />
          ) : (
            <EmptyView />
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Conversation list rij
// ────────────────────────────────────────────────────────────────────────

function ChannelFilterButton({
  active,
  channel,
  unread,
  onClick,
}: {
  active: boolean
  channel: Channel
  unread: number
  onClick: () => void
}) {
  const Icon =
    channel === 'all'
      ? Inbox
      : channel === 'email'
        ? Mail
        : channel === 'sms'
          ? MessageSquare
          : MessageCircle
  const label =
    channel === 'all'
      ? 'Alle'
      : channel === 'email'
        ? 'Email'
        : channel === 'sms'
          ? 'SMS'
          : 'WA'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-white text-zinc-900 shadow-sm'
          : 'text-zinc-600 hover:bg-zinc-200',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
      {unread > 0 && (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-semibold text-white">
          {unread}
        </span>
      )}
    </button>
  )
}

function ConversationRow({
  conv,
  active,
  onClick,
  onArchive,
}: {
  conv: {
    contactId: Id<'contacts'>
    contactName: string
    lastMessageBody: string
    lastMessageSubject: string | null
    lastMessageChannel: string
    lastMessageDirection: string
    lastActivity: number
    totalCount: number
    unread: boolean
    archived: boolean
  }
  active: boolean
  onClick: () => void
  onArchive: () => void
}) {
  const initials = (conv.contactName || '?').slice(0, 2).toUpperCase()
  const preview =
    conv.lastMessageChannel === 'email' && conv.lastMessageSubject
      ? conv.lastMessageSubject
      : conv.lastMessageBody
  const time = new Date(conv.lastActivity)
  const today = new Date().toDateString() === time.toDateString()
  const timeLabel = today
    ? time.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : time.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })

  const ChannelIcon =
    conv.lastMessageChannel === 'email'
      ? Mail
      : conv.lastMessageChannel === 'sms'
        ? MessageSquare
        : MessageCircle

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-zinc-50',
          active && 'bg-violet-50/60',
          conv.archived && 'opacity-60',
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-medium text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-medium text-zinc-900">
              {conv.contactName}
            </h3>
            <span className="shrink-0 text-xs text-zinc-400">{timeLabel}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
            <ChannelIcon className="h-3 w-3 shrink-0" />
            {conv.lastMessageDirection === 'outbound' && (
              <span className="text-zinc-400">Jij:</span>
            )}
            <span className="truncate">{preview}</span>
            {conv.unread && (
              <span
                aria-hidden
                className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-500"
              />
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onArchive}
        title={conv.archived ? 'Terugzetten uit archief' : 'Gesprek archiveren'}
        className="absolute right-2 top-2 hidden rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 group-hover:block"
      >
        {conv.archived ? (
          <ArchiveRestore className="h-3.5 w-3.5" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
      </button>
    </li>
  )
}

function EmptyView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
        <Inbox className="h-6 w-6 text-zinc-400" />
      </div>
      <h2 className="text-base font-medium text-zinc-700">
        Selecteer een conversatie
      </h2>
      <p className="max-w-xs text-sm text-zinc-500">
        Klik links op een contact om de berichten-geschiedenis te zien en te
        reageren.
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Conversation view (right panel)
// ────────────────────────────────────────────────────────────────────────

function ConversationView({
  contactId,
  onBack,
}: {
  contactId: Id<'contacts'>
  onBack: () => void
}) {
  const detail = useQuery(api.contacts.getDetail, { contactId })
  const messages = useQuery(api.messaging.listByContact, { contactId })
  const streamRef = useRef<HTMLDivElement>(null)

  // Auto-scroll naar onder bij open van conversation + bij nieuwe message
  // (messages-array length change). Convex real-time bezorgt nieuwe inbound
  // én de eigen verstuurde reply als update — beide triggeren deze scroll.
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [messages?.length, contactId])

  if (detail === undefined || messages === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Skeleton className="h-32 w-64" />
      </div>
    )
  }
  if (detail === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Contact niet gevonden
      </div>
    )
  }
  const { contact } = detail

  return (
    <>
      {/* Conversation header */}
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={onBack}
          aria-label="Terug naar lijst"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-medium text-white">
          {((contact.firstName?.[0] ?? '') +
            (contact.lastName?.[0] ?? '') ||
            contact.email?.[0] ||
            '?').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-zinc-900">
            {[contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
              'Naamloos'}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            {contact.email && (
              <span className="flex items-center gap-1 truncate">
                <Mail className="h-3 w-3" /> {contact.email}
              </span>
            )}
            {contact.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {contact.phone}
              </span>
            )}
            {contact.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {contact.city}
              </span>
            )}
          </div>
        </div>
        <Link
          to="/crm/contacts/$id"
          params={{ id: contactId }}
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          title="Open contact-detail"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </header>

      {/* Messages stream */}
      <div
        ref={streamRef}
        className="flex-1 space-y-2 overflow-y-auto bg-zinc-50/40 p-4"
      >
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">
            Nog geen berichten met deze contact
          </p>
        ) : (
          [...messages].reverse().map((m, idx, arr) => {
            const prev = idx > 0 ? arr[idx - 1] : null
            const showDate =
              !prev ||
              new Date(m._creationTime).toDateString() !==
                new Date(prev._creationTime).toDateString()
            return (
              <div key={m._id}>
                {showDate && (
                  <div className="my-3 flex items-center justify-center">
                    <span className="rounded-full bg-white px-3 py-0.5 text-xs text-zinc-500 shadow-xs">
                      {new Date(m._creationTime).toLocaleDateString('nl-NL', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </span>
                  </div>
                )}
                <ChatBubble message={m} />
              </div>
            )
          })
        )}
      </div>

      {/* Reply form */}
      <ReplyForm contact={contact} />
    </>
  )
}

function ChatBubble({
  message,
}: {
  message: Doc<'messages'>
}) {
  const isOutbound = message.direction === 'outbound'
  const channelMeta: Record<
    string,
    { icon: typeof Mail; bg: string; label: string }
  > = {
    email: { icon: Mail, bg: 'bg-blue-50 border-blue-200', label: 'Email' },
    sms: {
      icon: MessageSquare,
      bg: 'bg-emerald-50 border-emerald-200',
      label: 'SMS',
    },
    whatsapp: {
      icon: MessageCircle,
      bg: 'bg-green-50 border-green-200',
      label: 'WhatsApp',
    },
    messenger: {
      icon: MessageCircle,
      bg: 'bg-violet-50 border-violet-200',
      label: 'Messenger',
    },
  }
  const m = channelMeta[message.channel] ?? channelMeta.sms
  const Icon = m.icon
  const failed = message.status === 'failed' || message.status === 'bounced'

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-lg border px-3 py-2 text-sm shadow-xs',
          isOutbound
            ? 'border-zinc-900 bg-zinc-900 text-white'
            : `${m.bg} text-zinc-800`,
          failed && 'opacity-60',
        )}
      >
        <div
          className={cn(
            'mb-1 flex items-center gap-1.5 text-xs',
            isOutbound ? 'text-zinc-300' : 'text-zinc-500',
          )}
        >
          <Icon className="h-3 w-3" />
          <span>{m.label}</span>
          <span>·</span>
          <span>
            {new Date(message._creationTime).toLocaleTimeString('nl-NL', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {failed && (
            <Badge className="ml-1 border-0 bg-red-100 text-red-700 text-[10px]">
              {message.status}
            </Badge>
          )}
        </div>
        {message.subject && message.channel === 'email' && (
          <p
            className={cn(
              'mb-1 font-medium',
              isOutbound ? 'text-white' : 'text-zinc-900',
            )}
          >
            {message.subject}
          </p>
        )}
        {(() => {
          const mediaUrl = (message as { mediaUrl?: string }).mediaUrl
          const mediaType = (message as { mediaType?: string }).mediaType
          const looksLikeImage =
            mediaType?.startsWith('image/') || /image/i.test(message.body || '')
          if (mediaUrl && looksLikeImage) {
            return (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={mediaUrl}
                  alt={message.body || 'afbeelding'}
                  className="max-h-64 rounded-lg"
                  loading="lazy"
                />
              </a>
            )
          }
          if (mediaUrl) {
            return (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {message.body || 'Bijlage'}
              </a>
            )
          }
          return <p className="whitespace-pre-line">{message.body}</p>
        })()}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Reply form
// ────────────────────────────────────────────────────────────────────────

function ReplyForm({
  contact,
}: {
  contact: Doc<'contacts'>
}) {
  const send = useAction(api.messaging.send)
  const templates = useQuery(api.emailTemplates.list, {
    workspaceId: contact.workspaceId,
  })
  const crmSettingsForCompany = useQuery(api.crmSettings.get, {
    workspaceId: contact.workspaceId,
  })
  const companyName = crmSettingsForCompany?.companyName ?? ''
  const [channel, setChannel] = useState<'email' | 'sms' | 'whatsapp'>(() => {
    // Default = laatste channel waar contact iets in heeft? Voor MVP:
    // whatsapp als phone aanwezig, anders email
    if (contact.phone) return 'whatsapp'
    return 'email'
  })
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const channelsAvailable = {
    email: !!contact.email,
    sms: !!contact.phone,
    whatsapp: !!contact.phone,
  }
  const recipient =
    channel === 'email' ? contact.email : contact.phone

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sending || !body.trim()) return
    if (channel === 'email' && !subject.trim()) {
      toast.error('Geef een onderwerp voor de email')
      return
    }
    setSending(true)
    try {
      await send({
        contactId: contact._id,
        channel,
        body,
        ...(channel === 'email' ? { subject } : {}),
      })
      setBody('')
      if (channel === 'email') setSubject('')
      toast.success(`${channelLabel(channel)} verstuurd`)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Versturen mislukt'))
    } finally {
      setSending(false)
    }
  }

  function applyTemplate(tpl: Doc<'emailTemplates'>) {
    const rendered = renderTemplateForChannel(tpl, contact, channel, companyName)
    setBody(rendered.body)
    if (rendered.subject !== undefined) setSubject(rendered.subject)
  }

  function handlePick(tpl: Doc<'emailTemplates'>) {
    const hasContent =
      body.trim().length > 0 ||
      (channel === 'email' && subject.trim().length > 0)
    if (!hasContent) {
      applyTemplate(tpl)
      toast.success(`Template "${tpl.name}" ingevoegd`)
      return
    }
    toast(`Bestaande tekst overschrijven met "${tpl.name}"?`, {
      action: { label: 'Overschrijven', onClick: () => applyTemplate(tpl) },
    })
  }

  if (!recipient) {
    return (
      <div className="border-t border-zinc-200 bg-zinc-50 p-3 text-center text-xs text-zinc-500">
        Geen {channel === 'email' ? 'email' : 'telefoonnummer'} bekend voor
        deze contact
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-zinc-200 bg-white p-3 space-y-2"
    >
      <div className="flex items-center gap-1 text-xs">
        <span className="text-zinc-500">Verstuur als:</span>
        {(['email', 'sms', 'whatsapp'] as const).map((c) => {
          const Icon =
            c === 'email' ? Mail : c === 'sms' ? MessageSquare : MessageCircle
          const available = channelsAvailable[c]
          return (
            <button
              key={c}
              type="button"
              disabled={!available}
              onClick={() => setChannel(c)}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                channel === c && available
                  ? c === 'whatsapp'
                    ? 'bg-green-100 text-green-800'
                    : c === 'sms'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-800'
                  : available
                    ? 'text-zinc-600 hover:bg-zinc-100'
                    : 'cursor-not-allowed text-zinc-300',
              )}
              title={
                available
                  ? channelLabel(c)
                  : `Geen ${c === 'email' ? 'email' : 'telefoon'}`
              }
            >
              <Icon className="h-3 w-3" />
              {channelLabel(c)}
            </button>
          )
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={templates === undefined}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300"
              title="Template invoegen"
            >
              <FileText className="h-3 w-3" />
              Template
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-64 overflow-y-auto"
          >
            {templates && templates.length === 0 ? (
              <DropdownMenuItem asChild>
                <Link to="/crm/settings/templates" className="text-zinc-500">
                  Nog geen templates — maak ze in Instellingen
                </Link>
              </DropdownMenuItem>
            ) : (
              templates?.map((tpl) => (
                <DropdownMenuItem
                  key={tpl._id}
                  onSelect={() => handlePick(tpl)}
                >
                  {tpl.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="ml-auto text-zinc-400">→ {recipient}</span>
      </div>

      {channel === 'email' && (
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Onderwerp…"
          className="h-9"
        />
      )}

      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            channel === 'email'
              ? 'Schrijf een email…'
              : channel === 'sms'
                ? 'Korte SMS-tekst…'
                : 'WhatsApp-bericht…'
          }
          rows={channel === 'email' ? 4 : 2}
          className="block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <Button
          type="submit"
          disabled={sending || !body.trim()}
          className="self-end"
        >
          <Send className="h-4 w-4" />
          {sending ? '…' : 'Verstuur'}
        </Button>
      </div>
    </form>
  )
}

function channelLabel(c: 'email' | 'sms' | 'whatsapp') {
  return c === 'email' ? 'Email' : c === 'sms' ? 'SMS' : 'WhatsApp'
}
