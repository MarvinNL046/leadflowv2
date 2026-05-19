import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  MessageCircle,
  Phone,
  QrCode,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/settings_/whatsapp')({
  component: WhatsappSettingsPage,
})

function WhatsappSettingsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.workspace !== null) ?? null
  const workspaceId = tenant?.workspace?.id as Id<'workspaces'> | undefined

  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!workspaceId) {
    return (
      <NoWorkspaceFallback />
    )
  }
  return <WhatsappConnector workspaceId={workspaceId} />
}

function NoWorkspaceFallback() {
  return (
    <div className="space-y-6">
      <BackLink />
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-amber-700">Geen workspace gekoppeld.</p>
        </CardContent>
      </Card>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/crm/settings"
      className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
    >
      <ArrowLeft className="h-4 w-4" />
      Terug naar instellingen
    </Link>
  )
}

function WhatsappConnector({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const config = useQuery(api.integrations.getWhatsappConfig, { workspaceId })
  const linkWa = useAction(api.integrations.linkWhatsapp)
  const checkStatus = useAction(api.integrations.checkWhatsappStatus)
  const disconnect = useMutation(api.integrations.disconnectWhatsapp)

  const [qrOpen, setQrOpen] = useState(false)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [checking, setChecking] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  async function handleLink() {
    if (linking) return
    setLinking(true)
    setQrImage(null)
    setQrOpen(true)
    try {
      const res = await linkWa({ workspaceId })
      if (!res.success || !res.qrCode) {
        toast.error(res.error ?? 'QR-code ophalen mislukt')
        setQrOpen(false)
        return
      }
      setQrImage(res.qrCode)
      startPolling()
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Onbekende fout'))
      setQrOpen(false)
    } finally {
      setLinking(false)
    }
  }

  function startPolling() {
    stopPolling()
    // Eerste check na 5s, daarna elke 5s. Stop na 5 minuten.
    timeoutRef.current = setTimeout(async () => {
      const ok = await pollOnce()
      if (ok) return
      pollRef.current = setInterval(pollOnce, 5000)
      timeoutRef.current = setTimeout(() => {
        stopPolling()
      }, 5 * 60 * 1000)
    }, 5000)
  }

  async function pollOnce(): Promise<boolean> {
    try {
      const res = await checkStatus({ workspaceId })
      if (res.success && res.isConnected) {
        stopPolling()
        setQrOpen(false)
        toast.success('WhatsApp gekoppeld!')
        return true
      }
    } catch {
      // negeer; volgende tick probeert opnieuw
    }
    return false
  }

  async function handleManualCheck() {
    if (checking) return
    setChecking(true)
    try {
      const res = await checkStatus({ workspaceId })
      if (!res.success) {
        toast.error(res.error ?? 'Status check mislukt')
      } else if (res.isConnected) {
        toast.success('Gekoppeld!')
      } else {
        toast.info(`Status: ${res.status ?? 'onbekend'}`)
      }
    } finally {
      setChecking(false)
    }
  }

  async function handleDisconnect() {
    if (disconnecting) return
    if (!window.confirm('Weet je het zeker? Berichten kunnen niet meer verzonden worden.')) return
    setDisconnecting(true)
    try {
      await disconnect({ workspaceId })
      toast.success('WhatsApp losgekoppeld')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Loskoppelen mislukt'))
    } finally {
      setDisconnecting(false)
    }
  }

  const isConfigured = config?.isActive ?? false

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
          <MessageCircle className="h-4.5 w-4.5 text-green-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            WhatsApp via Voidfix
          </h1>
          <p className="text-xs text-zinc-500">
            Koppel een WhatsApp-nummer aan deze workspace via QR-code
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {config === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : isConfigured ? (
            <ConnectedState
              phoneNumber={config?.phoneNumber ?? ''}
              sessionId={config?.sessionId ?? ''}
              lastSeenAt={config?.lastSeenAt ?? null}
              onRefreshQr={handleLink}
              onCheckStatus={handleManualCheck}
              onDisconnect={handleDisconnect}
              linking={linking}
              checking={checking}
              disconnecting={disconnecting}
            />
          ) : (
            <NotConnectedState
              onLink={handleLink}
              linking={linking}
              hasPendingSession={Boolean(config?.sessionId)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-zinc-600">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <span>
                Voor nieuwe nummers: warm-up via{' '}
                <a
                  className="inline-flex items-center gap-1 text-violet-600 hover:underline"
                  href="https://wa.voidfix.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  voidfix dashboard
                  <ExternalLink className="h-3 w-3" />
                </a>{' '}
                — voorkomt block door WhatsApp.
              </span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <span>
                Bij verlies van connectie (uitloggen op telefoon): klik
                "Nieuwe QR" om opnieuw te koppelen — sessie-id blijft hetzelfde.
              </span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <span>
                Inkomende berichten landen automatisch in de Messages-tab via
                de Voidfix webhook (al actief op deze deployment).
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Dialog
        open={qrOpen}
        onOpenChange={(open) => {
          setQrOpen(open)
          if (!open) stopPolling()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>WhatsApp koppelen</DialogTitle>
            <DialogDescription>
              Open WhatsApp op je telefoon → Instellingen → Gekoppelde apparaten
              → Apparaat koppelen, en scan de QR-code hieronder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {qrImage ? (
              <div className="flex justify-center">
                <img
                  src={qrImage}
                  alt="WhatsApp QR Code"
                  className="rounded-lg border border-zinc-200"
                  style={{ maxWidth: 280, width: '100%' }}
                />
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Wachten op scan…</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQrOpen(false)}>
              Annuleren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NotConnectedState({
  onLink,
  linking,
  hasPendingSession,
}: {
  onLink: () => void
  linking: boolean
  hasPendingSession: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-zinc-50 p-4">
        <p className="text-sm text-zinc-700">
          {hasPendingSession
            ? 'Er staat een sessie klaar maar de QR is nog niet gescand. Klik hieronder om een nieuwe QR-code te tonen.'
            : 'Nog geen WhatsApp gekoppeld. Klik hieronder om te starten.'}
        </p>
      </div>
      <Button
        onClick={onLink}
        disabled={linking}
        className="bg-green-600 hover:bg-green-700"
      >
        {linking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <QrCode className="h-4 w-4" />
        )}
        {linking ? 'QR genereren…' : 'WhatsApp koppelen'}
      </Button>
    </div>
  )
}

function ConnectedState({
  phoneNumber,
  sessionId,
  lastSeenAt,
  onRefreshQr,
  onCheckStatus,
  onDisconnect,
  linking,
  checking,
  disconnecting,
}: {
  phoneNumber: string
  sessionId: string
  lastSeenAt: number | null
  onRefreshQr: () => void
  onCheckStatus: () => void
  onDisconnect: () => void
  linking: boolean
  checking: boolean
  disconnecting: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
          <Phone className="h-4 w-4 text-green-700" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-900">
            {phoneNumber || 'Verbonden'}
          </p>
          <p className="text-xs text-zinc-500">
            Sessie {sessionId.slice(0, 12)}…
            {lastSeenAt
              ? ` • laatste activiteit ${formatRelative(lastSeenAt)}`
              : ''}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          <Check className="h-3 w-3" />
          Actief
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCheckStatus}
          disabled={checking}
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Status verversen
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshQr}
          disabled={linking}
        >
          {linking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <QrCode className="h-4 w-4" />
          )}
          Nieuwe QR
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {disconnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Loskoppelen
        </Button>
      </div>
    </div>
  )
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min}m geleden`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}u geleden`
  return `${Math.floor(hr / 24)}d geleden`
}
