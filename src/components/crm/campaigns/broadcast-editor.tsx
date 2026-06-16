import { useState } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { EmailBlock, BlockType } from '../../../../convex/emailBlocks'
import { createBlock, renderBlocksToHtml } from '../../../../convex/emailBlocks'
import { BlockSidebar } from './email-builder/BlockSidebar.tsx'
import { EmailCanvas } from './email-builder/EmailCanvas.tsx'
import { PropertiesPanel } from './email-builder/PropertiesPanel.tsx'

export function BroadcastEditor({
  workspaceId,
  onClose,
  initialName,
  initialSubject,
}: {
  workspaceId: Id<'workspaces'>
  onClose: () => void
  initialName?: string
  initialSubject?: string
}) {
  const [name, setName] = useState(initialName ?? '')
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [blocks, setBlocks] = useState<EmailBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [segmentId, setSegmentId] = useState<string>('')
  const [draftId, setDraftId] = useState<Id<'broadcasts'> | null>(null)
  const [busy, setBusy] = useState(false)

  const segments = useQuery(api.segments.list, { workspaceId })
  const templates = useQuery(api.emailTemplates.list, { workspaceId })
  const crmSettings = useQuery(api.crmSettings.get, { workspaceId })
  const create = useMutation(api.broadcasts.create)
  const sendTest = useAction(api.broadcasts.sendTest)
  const sendNow = useAction(api.broadcasts.sendNow)

  const companyName = crmSettings?.companyName ?? 'StayCool Airco'

  const preview = useQuery(
    api.segments.preview,
    segmentId
      ? { workspaceId, rules: segments?.find((s) => s._id === segmentId)?.rules ?? { match: 'all', conditions: [] } }
      : 'skip',
  )

  // ── Block helpers ──────────────────────────────────────────────────────────

  function addBlock(type: BlockType) {
    const b = createBlock(type, crypto.randomUUID())
    setBlocks((prev) => [...prev, b])
    setSelectedId(b.id)
    setDraftId(null)
  }

  function updateBlock(id: string, props: Record<string, unknown>) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id ? ({ ...b, props: { ...b.props, ...props } } as EmailBlock) : b,
      ),
    )
    setDraftId(null)
  }

  function deleteBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
    setDraftId(null)
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
    setDraftId(null)
  }

  // ── Save / test / send ─────────────────────────────────────────────────────

  const saveDraft = async (): Promise<Id<'broadcasts'>> => {
    if (!name) throw new Error('Vul een interne naam in')
    if (!subject) throw new Error('Vul een onderwerp in')
    if (blocks.length === 0) throw new Error('Voeg minimaal één blok toe')
    if (!segmentId) throw new Error('Kies een segment')
    if (draftId) return draftId
    const id = await create({
      workspaceId,
      name,
      subject,
      body: renderBlocksToHtml(blocks),
      bodyBlocks: blocks,
      segmentId: segmentId as Id<'segments'>,
    })
    setDraftId(id)
    return id
  }

  const onTest = async () => {
    setBusy(true)
    try {
      const id = await saveDraft()
      const to = window.prompt('Stuur testmail naar welk e-mailadres?', 'info@staycoolairco.nl')
      if (!to) return
      await sendTest({ broadcastId: id, toEmail: to })
      toast.success('Testmail verzonden')
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Testmail mislukt'))
    } finally {
      setBusy(false)
    }
  }

  const onSend = async () => {
    setBusy(true)
    try {
      const id = await saveDraft()
      const n = preview?.count ?? 0
      if (!window.confirm(`Je staat op het punt ${n} mensen te mailen. Doorgaan?`)) return
      const res = await sendNow({ broadcastId: id })
      toast.success(`Verzending gestart naar ${res.total} contacten`)
      onClose()
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Verzenden mislukt'))
    } finally {
      setBusy(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-100">
      {/* ── Topbar ── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4">
        {/* Left: back button */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          <ArrowLeft size={16} />
          Campagnes
        </button>

        <div className="h-5 w-px bg-zinc-200" />

        {/* Center: name + subject */}
        <div className="flex flex-1 items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Interne naam"
            value={name}
            onChange={(e) => { setName(e.target.value); setDraftId(null) }}
          />
          <Input
            className="max-w-xs"
            placeholder="Onderwerp van de mail"
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setDraftId(null) }}
          />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onTest} disabled={busy}>
            Testmail
          </Button>
          <Button onClick={onSend} disabled={busy}>
            Verstuur
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar: blocks + segment + template */}
        <aside className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-200 bg-white p-3">
          <BlockSidebar onAdd={addBlock} />

          <hr className="border-zinc-200" />

          {/* Segment */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Segment</p>
            <select
              className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              value={segmentId}
              onChange={(e) => { setSegmentId(e.target.value); setDraftId(null) }}
            >
              <option value="">— kies segment —</option>
              {segments?.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
            {segmentId && (
              <p className="text-xs text-zinc-500">
                {preview === undefined
                  ? 'Berekenen…'
                  : `${preview.count}${preview.capped ? '+' : ''} ontvangers${preview.capped ? ' (schatting)' : ''}`}
              </p>
            )}
          </div>

          {/* Template selector */}
          {templates && templates.length > 0 && (
            <>
              <hr className="border-zinc-200" />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Start vanaf template</p>
                <select
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  defaultValue=""
                  onChange={(e) => {
                    const t = templates.find((x) => x._id === e.target.value)
                    if (t) {
                      setBlocks((t.bodyBlocks as EmailBlock[] | undefined) ?? [])
                      if (!subject) setSubject(t.subject)
                      setDraftId(null)
                    }
                    // reset select back to placeholder
                    e.target.value = ''
                  }}
                >
                  <option value="">— kies template —</option>
                  {templates.map((t) => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </aside>

        {/* Center canvas with branded shell frame */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-100 p-6">
          <div className="mx-auto max-w-[640px]">
            {/* Branded header bar */}
            <div
              className="rounded-t-lg px-6 py-4"
              style={{ background: '#2080C0' }}
            >
              <p className="text-center text-base font-bold text-white">{companyName}</p>
            </div>

            {/* Editable canvas */}
            <div className="bg-white px-1 py-1">
              <EmailCanvas
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={moveBlock}
                onDelete={deleteBlock}
              />
            </div>

            {/* Footer strip */}
            <div className="rounded-b-lg bg-zinc-50 px-6 py-3 text-center text-xs text-zinc-400">
              Je ontvangt deze mail omdat je klant of aanvrager bent bij {companyName}.{' '}
              <span className="underline">Afmelden</span>
            </div>
          </div>
        </main>

        {/* Right properties panel */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-3">
          <PropertiesPanel
            block={blocks.find((b) => b.id === selectedId) ?? null}
            onChange={(props) => { if (selectedId) updateBlock(selectedId, props) }}
            workspaceId={workspaceId}
          />
        </aside>
      </div>
    </div>
  )
}
