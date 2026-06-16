import { useState } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { renderTemplate, leadTemplateVars } from '#/lib/templates.ts'
import { renderEmailShell } from '../../../../convex/emailShell'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { EmailBuilder } from './email-builder/EmailBuilder.tsx'
import type { EmailBlock } from '../../../../convex/emailBlocks'
import { renderBlocksToHtml } from '../../../../convex/emailBlocks'

export function BroadcastComposer({
  workspaceId,
  onDone,
  initialName,
  initialSubject,
}: {
  workspaceId: Id<'workspaces'>
  onDone: () => void
  initialName?: string
  initialSubject?: string
}) {
  const [name, setName] = useState(initialName ?? '')
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [blocks, setBlocks] = useState<EmailBlock[]>([])
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
  const previewVars = leadTemplateVars(
    { firstName: 'Jan', lastName: 'Jansen', email: null, phone: null, city: null, company: null },
    companyName,
  )
  const previewHtml = renderEmailShell(
    renderTemplate(renderBlocksToHtml(blocks) || '<p style="color:#999">(nog geen inhoud)</p>', previewVars),
    { companyName, unsubUrl: '#', previewText: renderTemplate(subject, previewVars) },
  )
  const previewSubject = renderTemplate(subject, previewVars)

  const preview = useQuery(
    api.segments.preview,
    segmentId
      ? { workspaceId, rules: segments?.find((s) => s._id === segmentId)?.rules ?? { match: 'all', conditions: [] } }
      : 'skip',
  )

  const saveDraft = async (): Promise<Id<'broadcasts'>> => {
    if (!name || !subject || blocks.length === 0 || !segmentId) throw new Error('Vul naam, onderwerp, inhoud en segment in')
    if (draftId) return draftId
    const bodyHtml = renderBlocksToHtml(blocks)
    const id = await create({
      workspaceId,
      name,
      subject,
      body: bodyHtml,
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
      onDone()
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Verzenden mislukt'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
      <div><Label>Interne naam</Label><Input value={name} onChange={(e) => { setName(e.target.value); setDraftId(null) }} /></div>
      <div>
        <Label>Segment</Label>
        <select className="w-full rounded border px-2 py-2 text-sm" value={segmentId} onChange={(e) => { setSegmentId(e.target.value); setDraftId(null) }}>
          <option value="">— kies segment —</option>
          {segments?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        {segmentId && (
          <p className="mt-1 text-xs text-zinc-500">
            {preview === undefined
              ? 'Berekenen…'
              : `${preview.count}${preview.capped ? '+' : ''} ontvangers${preview.capped ? ' (schatting — exact bij verzenden)' : ''}`}
          </p>
        )}
      </div>
      <div>
        <Label>Onderwerp</Label>
        <Input value={subject} onChange={(e) => { setSubject(e.target.value); setDraftId(null) }} placeholder="bv. Onderhoudstip voor de zomer" />
      </div>
      <div>
        <Label>Inhoud — start eventueel vanaf een template</Label>
        {templates && templates.length > 0 && (
          <select className="mb-2 w-full rounded border px-2 py-1 text-sm"
            onChange={(e) => {
              const t = templates.find((x) => x._id === e.target.value)
              if (t) { setBlocks((t.bodyBlocks as EmailBlock[] | undefined) ?? []); if (!subject) setSubject(t.subject); setDraftId(null) }
            }}>
            <option value="">— template invoegen —</option>
            {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        )}
        <EmailBuilder
          value={blocks}
          onChange={(b) => { setBlocks(b); setDraftId(null) }}
          workspaceId={workspaceId}
        />
        <p className="mt-1 text-xs text-zinc-500">Typ {'{{contact.firstName}}'} / {'{{company}}'} in een tekst- of kop-blok. Afmeldlink wordt automatisch toegevoegd.</p>
      </div>
      <div>
        <Label>Voorbeeld (zo ziet de ontvanger 'm)</Label>
        <div className="rounded-lg border border-zinc-200 bg-zinc-100 p-3">
          <p className="mb-2 text-xs text-zinc-500">Onderwerp: <span className="font-medium text-zinc-800">{previewSubject || '(geen onderwerp)'}</span></p>
          <iframe
            title="E-mail voorbeeld"
            srcDoc={previewHtml}
            className="h-96 w-full max-w-[640px] rounded border border-zinc-200 bg-white"
            sandbox=""
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onTest} disabled={busy}>Testmail naar mezelf</Button>
        <Button onClick={onSend} disabled={busy}>Verstuur</Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>Annuleren</Button>
      </div>
    </div>
  )
}
