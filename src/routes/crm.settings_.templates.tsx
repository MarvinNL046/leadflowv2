import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, Save, Mail, FileText, Eye, EyeOff } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { renderTemplate, htmlToPlainText, leadTemplateVars } from '#/lib/templates.ts'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/settings_/templates')({
  component: TemplatesPage,
})

function TemplatesPage() {
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
  return <TemplatesEditor workspaceId={workspaceId} />
}

function TemplatesEditor({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const templates = useQuery(api.emailTemplates.list, { workspaceId })
  const crmSettings = useQuery(api.crmSettings.get, { workspaceId })
  const companyName = crmSettings?.companyName ?? ''
  const updateSettings = useMutation(api.crmSettings.update)
  const [companyDraft, setCompanyDraft] = useState('')
  useEffect(() => {
    if (crmSettings) setCompanyDraft(crmSettings.companyName ?? '')
  }, [crmSettings])

  if (templates === undefined) return <Skeleton className="h-96 w-full" />
  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-zinc-500">
            Geen templates gevonden. Migreer via{' '}
            <code className="font-mono">scripts/migrate-email-templates.ts</code>.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/crm/settings"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar instellingen
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
            <Mail className="h-4.5 w-4.5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              Email-templates
            </h1>
            <p className="text-xs text-zinc-500">
              Tekst die bij Bel Nu-modal verstuurd wordt. Variabelen tussen{' '}
              <code className="rounded bg-zinc-100 px-1 font-mono">
                {'{{...}}'}
              </code>{' '}
              worden per lead vervangen.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bedrijfsgegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="company-name">
            Bedrijfsnaam (voor {'{{company}}'} in e-mails)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="company-name"
              value={companyDraft}
              placeholder={companyName || 'Bedrijfsnaam'}
              onChange={(e) => setCompanyDraft(e.target.value)}
              className="max-w-sm"
            />
            <Button
              type="button"
              size="sm"
              disabled={companyDraft.trim() === companyName}
              onClick={async () => {
                try {
                  await updateSettings({
                    workspaceId,
                    companyName: companyDraft.trim(),
                  })
                  toast.success('Bedrijfsnaam opgeslagen')
                } catch (err) {
                  toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
                }
              }}
            >
              Opslaan
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            Leeg = automatisch de organisatie-naam.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Beschikbare variabelen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
            <VarRow code="contact.firstName" desc="Voornaam van het contact" />
            <VarRow code="contact.lastName" desc="Achternaam" />
            <VarRow code="contact.fullName" desc="Voor- + achternaam gecombineerd" />
            <VarRow code="contact.email" desc="Email-adres" />
            <VarRow code="contact.phone" desc="Telefoonnummer" />
            <VarRow code="contact.city" desc="Plaats" />
            <VarRow code="company" desc="Je bedrijfsnaam (instelbaar hieronder)" />
          </div>
        </CardContent>
      </Card>

      {templates.map((tpl) => (
        <TemplateEditor key={tpl._id} template={tpl} companyName={companyName} />
      ))}
    </div>
  )
}

function TemplateEditor({
  template,
  companyName,
}: {
  template: Doc<'emailTemplates'>
  companyName: string
}) {
  const update = useMutation(api.emailTemplates.update)
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    setSubject(template.subject)
    setBody(template.body)
  }, [template])

  const isDirty = subject !== template.subject || body !== template.body

  // Sample vars voor live preview
  const sampleVars = leadTemplateVars(
    {
      firstName: 'Jan',
      lastName: 'De Boer',
      email: 'jan@example.nl',
      phone: '+31612345678',
      city: 'Maastricht',
      company: null,
    },
    companyName,
  )

  const previewSubject = renderTemplate(subject, sampleVars)
  const previewBody = renderTemplate(body, sampleVars)
  const previewText = htmlToPlainText(previewBody)

  async function handleSave() {
    if (saving || !isDirty) return
    setSaving(true)
    try {
      await update({ templateId: template._id, subject, body })
      toast.success(`"${template.name}" opgeslagen`)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            {template.name}
            {template.description && (
              <Badge variant="outline" className="font-mono text-xs">
                {template.description}
              </Badge>
            )}
          </CardTitle>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowPreview((s) => !s)}
          >
            {showPreview ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`subject-${template._id}`}>Onderwerp</Label>
          <Input
            id={`subject-${template._id}`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Bv. Bedankt voor uw aanvraag — {{company}}"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`body-${template._id}`}>Body (HTML)</Label>
          <textarea
            id={`body-${template._id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>

        {showPreview && (
          <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
            <p className="text-xs font-medium text-blue-700">
              Preview met sample-data (Jan De Boer / Maastricht)
            </p>
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-zinc-700">
                Onderwerp: <span className="font-normal">{previewSubject}</span>
              </p>
              <pre className="whitespace-pre-wrap font-sans text-zinc-700">
                {previewText}
              </pre>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {isDirty && (
            <span className="text-xs text-amber-600">Niet opgeslagen</span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function VarRow({ code, desc }: { code: string; desc: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-700">
        {`{{${code}}}`}
      </code>
      <span className="text-zinc-500">{desc}</span>
    </div>
  )
}
