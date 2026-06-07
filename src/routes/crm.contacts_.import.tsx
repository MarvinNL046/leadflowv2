import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, Upload, CheckCircle2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { humanizeConvexError } from '#/lib/errors.ts'
import { parseCsv } from '#/lib/csv.ts'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/crm/contacts_/import')({
  component: ImportPage,
})

const FIELDS = [
  { key: 'firstName', label: 'Voornaam', syn: ['voornaam', 'firstname', 'first name', 'first', 'naam', 'name'] },
  { key: 'lastName', label: 'Achternaam', syn: ['achternaam', 'lastname', 'last name', 'last', 'surname'] },
  { key: 'email', label: 'E-mail', syn: ['email', 'e-mail', 'mail', 'emailadres'] },
  { key: 'phone', label: 'Telefoon', syn: ['phone', 'telefoon', 'tel', 'mobiel', 'gsm', 'telefoonnummer', 'number'] },
  { key: 'company', label: 'Bedrijf', syn: ['company', 'bedrijf', 'organisatie', 'organization'] },
  { key: 'city', label: 'Plaats', syn: ['city', 'plaats', 'woonplaats', 'stad', 'gemeente'] },
]

const BATCH = 100

function autoMap(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const f of FIELDS) {
    m[f.key] = headers.findIndex((h) => f.syn.includes(h.trim().toLowerCase()))
  }
  return m
}

function ImportPage() {
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
  return <ImportFlow workspaceId={workspaceId} />
}

function ImportFlow({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
  const importContacts = useMutation(api.contacts.importContacts)
  const navigate = useNavigate()
  const [headers, setHeaders] = useState<string[] | null>(null)
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
  } | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ''))
      if (rows.length < 2) {
        toast.error('CSV heeft geen data-rijen')
        return
      }
      const hdr = rows[0]
      setHeaders(hdr)
      setDataRows(rows.slice(1))
      setMapping(autoMap(hdr))
      setResult(null)
    }
    reader.readAsText(file)
  }

  function buildContacts() {
    return dataRows
      .map((r) => {
        const obj: Record<string, string> = {}
        for (const f of FIELDS) {
          const idx = mapping[f.key]
          const val = idx >= 0 ? (r[idx] ?? '').trim() : ''
          if (val) obj[f.key] = val
        }
        return obj
      })
      .filter((o) => Object.keys(o).length > 0)
  }

  async function handleImport() {
    const all = buildContacts()
    if (all.length === 0) {
      toast.error('Geen geldige rijen om te importeren')
      return
    }
    setImporting(true)
    let imported = 0
    let skipped = dataRows.length - all.length
    try {
      for (let i = 0; i < all.length; i += BATCH) {
        const batch = all.slice(i, i + BATCH)
        const res = await importContacts({ workspaceId, contacts: batch })
        imported += res.imported
        skipped += res.skipped
      }
      setResult({ imported, skipped })
      toast.success(`${imported} geïmporteerd, ${skipped} overgeslagen`)
    } catch (err) {
      toast.error(humanizeConvexError(err, 'Import mislukt'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/crm/contacts"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar contacts
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900">
          Contacten importeren
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload een CSV. Duplicaten (e-mail/telefoon) worden overgeslagen.
          Geïmporteerde contacten krijgen bron "Handmatig" en worden GEEN
          actieve leads (geen automatische berichten).
        </p>
      </div>

      {result ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-lg font-semibold text-zinc-800">
              {result.imported} geïmporteerd · {result.skipped} overgeslagen
            </p>
            <Button
              type="button"
              onClick={() => navigate({ to: '/crm/contacts' })}
            >
              Naar contacts
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. CSV uploaden</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600 hover:bg-zinc-50">
                <Upload className="h-4 w-4" />
                <span>Kies een .csv-bestand…</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            </CardContent>
          </Card>

          {headers && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    2. Kolommen koppelen
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label}</Label>
                      <Select
                        value={String(mapping[f.key] ?? -1)}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [f.key]: Number(v) }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="— niet importeren" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">— niet importeren</SelectItem>
                          {headers.map((h, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {h || `Kolom ${i + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    3. Preview ({dataRows.length} rijen)
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-500">
                        {FIELDS.map((f) => (
                          <th key={f.key} className="px-2 py-1">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.slice(0, 5).map((r, ri) => (
                        <tr key={ri} className="border-t border-zinc-100">
                          {FIELDS.map((f) => {
                            const idx = mapping[f.key]
                            return (
                              <td
                                key={f.key}
                                className="px-2 py-1 text-zinc-700"
                              >
                                {idx >= 0 ? (r[idx] ?? '') : ''}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                >
                  <Upload className="h-4 w-4" />
                  {importing
                    ? 'Importeren…'
                    : `Importeer ${dataRows.length} rijen`}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
