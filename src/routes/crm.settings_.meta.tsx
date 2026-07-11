import { useEffect, useState } from 'react'
import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Facebook,
  Info,
  Link2Off,
  Loader2,
  Plug,
  RefreshCw,
} from "@/components/icons"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { LeadRoutingSection } from '#/components/settings/lead-routing-section.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const NO_WORKSPACE = '__none__'

interface MetaSearchParams {
  meta?: 'connected'
  meta_error?: string
  pages?: string
}

export const Route = createFileRoute('/crm/settings_/meta')({
  component: MetaSettingsPage,
  validateSearch: (search): MetaSearchParams => ({
    meta: search.meta === 'connected' ? 'connected' : undefined,
    meta_error:
      typeof search.meta_error === 'string' ? search.meta_error : undefined,
    pages: typeof search.pages === 'string' ? search.pages : undefined,
  }),
})

const META_ERROR_LABELS: Record<string, string> = {
  missing_oauth_config:
    'Server-config ontbreekt — controleer META_APP_ID/SECRET/STATE_SECRET in Convex env.',
  invalid_state:
    'State-token ongeldig of verlopen. Probeer opnieuw te koppelen.',
  missing_code_or_state: 'Facebook gaf geen code/state terug.',
  code_exchange_failed: 'Code-exchange met Facebook mislukt.',
  long_lived_failed: 'Long-lived token-exchange mislukt.',
  me_fetch_failed: 'Kon Facebook-gebruikersinfo niet ophalen.',
  pages_fetch_failed: 'Kon de pagina-lijst niet ophalen.',
  internal_error: 'Onverwachte fout — check Convex logs.',
}

function MetaSettingsPage() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find((t) => t.org !== null) ?? null
  const orgId = tenant?.org?.id as Id<'orgs'> | undefined

  if (tenants === undefined) return <Skeleton className="h-64 w-full" />
  if (!orgId) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-amber-700">Geen organisatie gekoppeld.</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  return <MetaPanel orgId={orgId} />
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

function MetaPanel({ orgId }: { orgId: Id<'orgs'> }) {
  const status = useQuery(api.integrations.getMetaConnectionStatus, { orgId })
  const pagesWithForms = useQuery(api.integrations.listMetaPagesWithForms, {
    orgId,
  })
  const syncForms = useAction(api.integrations.syncFormsForPage)
  const disconnect = useMutation(api.integrations.disconnectMeta)

  const [syncingPageId, setSyncingPageId] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // OAuth callback feedback via URL-params (set door /auth/meta/callback)
  const search = useSearch({ from: '/crm/settings_/meta' })
  useEffect(() => {
    if (search.meta === 'connected') {
      const n = search.pages ? Number(search.pages) : 0
      toast.success(
        n > 0
          ? `Meta gekoppeld — ${n} pagina${n === 1 ? '' : "'s"} opgehaald`
          : 'Meta gekoppeld',
      )
    } else if (search.meta_error) {
      toast.error(
        META_ERROR_LABELS[search.meta_error] ??
          `Meta-koppeling mislukt: ${search.meta_error}`,
      )
    }
    // Run alleen bij eerste mount per nieuw search-object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.meta, search.meta_error])

  async function handleSyncForms(pageId: Id<'metaPages'>) {
    setSyncingPageId(pageId)
    try {
      const res = await syncForms({ pageId })
      if (res.errors.length) {
        toast.error(res.errors[0])
      } else {
        toast.success(`${res.synced} formulier(en) gesynchroniseerd`)
      }
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Sync mislukt'))
    } finally {
      setSyncingPageId(null)
    }
  }

  async function handleDisconnect() {
    if (disconnecting) return
    if (!window.confirm('Meta-koppeling deactiveren? Webhooks blijven leads ontvangen tot je ook in Meta de subscription verwijdert.')) return
    setDisconnecting(true)
    try {
      await disconnect({ orgId })
      toast.success('Meta-koppeling gedeactiveerd')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Deactiveren mislukt'))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
          <Facebook className="h-4.5 w-4.5 text-blue-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            Meta (Facebook &amp; Instagram)
          </h1>
          <p className="text-xs text-zinc-500">
            Lead Ads-formulieren koppelen aan deze organisatie
          </p>
        </div>
      </div>

      {status === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : status.connected ? (
        <ConnectedConnection
          status={status}
          onDisconnect={handleDisconnect}
          disconnecting={disconnecting}
        />
      ) : (
        <NotConnectedConnection orgId={orgId} />
      )}

      {status?.connected && (
        <>
          <PagesSection
            orgId={orgId}
            pages={pagesWithForms ?? []}
            loading={pagesWithForms === undefined}
            onSync={handleSyncForms}
            syncingPageId={syncingPageId}
          />
          <LeadRoutingSection
            orgId={orgId}
            pages={(pagesWithForms ?? []).map((p) => ({
              id: p.id,
              pageId: p.pageId,
              pageName: p.pageName,
              forms: p.forms.map((f) => ({
                id: f.id,
                formId: f.formId,
                formName: f.formName,
              })),
            }))}
          />
        </>
      )}
    </div>
  )
}

function ConnectedConnection({
  status,
  onDisconnect,
  disconnecting,
}: {
  status: Extract<
    NonNullable<ReturnType<typeof useQuery<typeof api.integrations.getMetaConnectionStatus>>>,
    { connected: true }
  >
  onDisconnect: () => void
  disconnecting: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Koppeling</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3">
          <Check className="h-5 w-5 text-green-700" />
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-900">
              Verbonden met Meta
            </p>
            <p className="text-xs text-zinc-500">
              Meta user-id: {status.connection.metaUserId} • {' '}
              {status.pages.length} pagina(s) gekoppeld
            </p>
          </div>
          <Badge variant="secondary">Actief</Badge>
        </div>

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
            <Link2Off className="h-4 w-4" />
          )}
          Loskoppelen
        </Button>
      </CardContent>
    </Card>
  )
}

function NotConnectedConnection({ orgId }: { orgId: Id<'orgs'> }) {
  const startOauth = useAction(api.metaOauth.startOauth)
  const [redirecting, setRedirecting] = useState(false)

  async function handleConnect() {
    setRedirecting(true)
    try {
      const res = await startOauth({ orgId })
      // Hele browser doorsturen naar Facebook — geen react-router
      // navigate omdat 't een cross-origin redirect is.
      window.location.href = res.redirectUrl
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Kon OAuth niet starten'))
      setRedirecting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nog niet verbonden</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-700" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">
              Vereiste Facebook permissions
            </p>
            <p className="mt-1 text-blue-800/90">
              pages_show_list, pages_read_engagement,
              pages_read_user_content, leads_retrieval, pages_manage_ads,
              business_management, ads_read.
            </p>
          </div>
        </div>

        <Button
          onClick={handleConnect}
          disabled={redirecting}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {redirecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plug className="h-4 w-4" />
          )}
          {redirecting ? 'Doorsturen naar Facebook…' : 'Verbinden met Meta'}
        </Button>

        <p className="text-xs text-zinc-500">
          Webhook-endpoint{' '}
          <code className="rounded bg-zinc-100 px-1">/webhooks/meta</code> staat
          al klaar — pages worden niet automatisch subscribed na OAuth, doe
          dat handmatig in Facebook Webhooks settings of via Graph API.
        </p>
      </CardContent>
    </Card>
  )
}

function PagesSection({
  orgId,
  pages,
  loading,
  onSync,
  syncingPageId,
}: {
  orgId: Id<'orgs'>
  pages: NonNullable<
    ReturnType<typeof useQuery<typeof api.integrations.listMetaPagesWithForms>>
  >
  loading: boolean
  onSync: (pageId: Id<'metaPages'>) => void
  syncingPageId: string | null
}) {
  const workspaces = useQuery(api.integrations.listWorkspacesForOrg, { orgId })
  const assignPage = useMutation(api.integrations.assignMetaPageToWorkspace)
  const [assigningPageId, setAssigningPageId] = useState<string | null>(null)

  async function handleAssign(
    pageId: Id<'metaPages'>,
    workspaceId: string,
  ) {
    setAssigningPageId(pageId)
    try {
      await assignPage({
        pageId,
        workspaceId:
          workspaceId === NO_WORKSPACE
            ? null
            : (workspaceId as Id<'workspaces'>),
      })
      toast.success('Page-mapping opgeslagen')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
    } finally {
      setAssigningPageId(null)
    }
  }

  if (loading) return <Skeleton className="h-48 w-full" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Pagina&apos;s &amp; formulieren
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Geen Meta-pagina&apos;s gekoppeld.
          </p>
        ) : (
          <div className="space-y-4">
            {pages.map((page) => (
              <div
                key={page.id}
                className="rounded-lg border border-zinc-200 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {page.pageName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Page-id {page.pageId}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSync(page.id)}
                    disabled={syncingPageId === page.id}
                  >
                    {syncingPageId === page.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Forms synchroniseren
                  </Button>
                </div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-zinc-600">
                    Default workspace voor deze pagina:
                  </span>
                  <Select
                    value={page.workspaceId ?? NO_WORKSPACE}
                    onValueChange={(v) => handleAssign(page.id, v)}
                    disabled={assigningPageId === page.id}
                  >
                    <SelectTrigger className="h-7 w-56 text-xs">
                      <SelectValue placeholder="Org-default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_WORKSPACE}>Org-default</SelectItem>
                      {(workspaces ?? []).map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                          {w.isDefault ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assigningPageId === page.id && (
                    <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                  )}
                </div>
                {page.forms.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Nog geen formulieren opgehaald — klik "Forms
                    synchroniseren".
                  </p>
                ) : (
                  <div className="space-y-1">
                    {page.forms.map((form) => (
                      <div
                        key={form.id}
                        className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-900">
                            {form.formName}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {form.formId} • {form.fieldCount} veld
                            {form.fieldCount === 1 ? '' : 'en'}
                            {form.lastSyncAt
                              ? ` • laatst gesynced ${formatRelative(form.lastSyncAt)}`
                              : ''}
                          </p>
                        </div>
                        {form.isActive ? (
                          <Badge variant="secondary">Actief</Badge>
                        ) : (
                          <Badge variant="outline">Inactief</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-zinc-500">
          Tip: per-form routing (welk workspace + pipeline krijgt deze form)
          komt in de volgende stap.{' '}
          <a
            href="https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[#328f97] hover:underline"
          >
            Graph API docs <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </CardContent>
    </Card>
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
