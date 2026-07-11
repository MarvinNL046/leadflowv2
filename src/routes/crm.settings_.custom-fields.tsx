import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2 } from "@/components/icons"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/settings_/custom-fields')({
  component: CustomFieldsPage,
})

const TYPES = [
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Getal' },
  { value: 'boolean', label: 'Ja/Nee' },
  { value: 'date', label: 'Datum' },
  { value: 'select', label: 'Keuzelijst' },
] as const

function CustomFieldsPage() {
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
  return <CustomFieldsForm workspaceId={workspaceId} />
}

function CustomFieldsForm({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const defs = useQuery(api.customFields.listManualDefinitions, { workspaceId })
  const create = useMutation(api.customFields.createDefinition)
  const remove = useMutation(api.customFields.deleteDefinition)

  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<string>('text')
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (saving) return
    setSaving(true)
    try {
      await create({
        workspaceId,
        label,
        fieldType: fieldType as
          | 'text'
          | 'number'
          | 'boolean'
          | 'date'
          | 'select',
        selectOptions:
          fieldType === 'select'
            ? options
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
            : undefined,
        isRequired: required,
      })
      toast.success('Veld toegevoegd')
      setLabel('')
      setOptions('')
      setRequired(false)
      setFieldType('text')
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Toevoegen mislukt'))
    } finally {
      setSaving(false)
    }
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
        <h1 className="text-xl font-semibold text-zinc-900">Custom velden</h1>
        <p className="text-xs text-zinc-500">
          Eigen velden voor contacten (los van de Meta-form-antwoorden).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nieuw veld</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input
                value={label}
                maxLength={40}
                placeholder="bv. Type woning"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {fieldType === 'select' && (
            <div className="space-y-1.5">
              <Label>Opties (komma-gescheiden)</Label>
              <Input
                value={options}
                placeholder="bv. Vrijstaand, Hoekwoning, Appartement"
                onChange={(e) => setOptions(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRequired((v) => !v)}
              className={
                required
                  ? 'rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700'
                  : 'rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50'
              }
            >
              Verplicht
            </button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={saving || !label.trim()}
            >
              <Plus className="h-4 w-4" />
              Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bestaande velden</CardTitle>
        </CardHeader>
        <CardContent>
          {defs === undefined ? (
            <Skeleton className="h-12 w-full" />
          ) : defs.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              Nog geen eigen velden.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {defs.map((d) => (
                <li key={d._id} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 text-sm font-medium text-zinc-800">
                    {d.label}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {TYPES.find((t) => t.value === d.fieldType)?.label ??
                      d.fieldType}
                  </Badge>
                  {d.isRequired && (
                    <Badge variant="outline" className="text-xs text-blue-600">
                      verplicht
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400 hover:text-red-600"
                    aria-label="Veld verwijderen"
                    onClick={async () => {
                      try {
                        await remove({ definitionId: d._id })
                        toast.success('Veld verwijderd')
                      } catch (err) {
                        toast.error(
                          humanizeConvexError(err, 'Verwijderen mislukt'),
                        )
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
