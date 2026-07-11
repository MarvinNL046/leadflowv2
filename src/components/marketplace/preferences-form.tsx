import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, Save } from "@/components/icons"
import { Button } from '#/components/ui/button.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { cn } from '#/lib/utils.ts'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../../convex/_generated/api'

/**
 * Buyer preferences form (ported from v1
 * src/components/marketplace/buyer/preferences-form.tsx).
 *
 * The v2 repo has no Checkbox/RadioGroup primitives, so selections use
 * toggle-buttons (the same pattern as crm.contacts.tsx filters). Wires to
 * the Convex `completeOnboarding` / `updateBuyerPreferences` mutations.
 *
 * `serviceTypes === null` means "accept all" (preserves the
 * undefined/[] distinction the backend honours). On save we send
 * `undefined` for null so the optional field is left unset on the row.
 */

type BuyerMode = 'exclusive' | 'shared' | 'both'
type ServiceType = 'install' | 'repair' | 'maintain'
type Segment = 'b2c' | 'b2b'

// Mirrors convex/marketplace/types.ts NICHE_CATEGORIES + NICHE_LABELS.
const NICHE_CATEGORIES: { label: string; niches: string[] }[] = [
  {
    label: 'Energie & duurzaamheid',
    niches: [
      'zonnepanelen',
      'warmtepomp',
      'cv_ketel',
      'waterontharder',
      'isolatie',
      'kozijnen',
      'laadpaal',
      'ventilatie',
      'airco',
      'vloerverwarming',
      'thuisbatterij',
    ],
  },
  {
    label: 'Huis & verbouwing',
    niches: [
      'alarmsysteem',
      'asbest',
      'gietvloer',
      'verbouwing',
      'traprenovatie',
      'dakkapel',
      'vochtbestrijding',
      'badkamer_verbouwen',
      'aanbouw',
      'gevelwerk',
    ],
  },
  {
    label: 'Vakmannen',
    niches: [
      'verhuizen',
      'dakdekker',
      'stukadoor',
      'schilder',
      'elektricien',
      'ongedierte',
      'glaszetter',
      'tegelzetter',
      'timmerman',
      'loodgieter',
      'architect',
      'glazenwasser',
      'zonwering',
      'rioolservice',
      'schoorsteenveger',
      'slotenmaker',
      'klusjesman',
      'klusser',
      'installateur',
    ],
  },
  {
    label: 'Tuin & advies',
    niches: [
      'tuinadvies',
      'hovenier',
      'stratenmaker',
      'serre',
      'garagedeur',
      'hekwerk',
      'carport',
      'veranda',
    ],
  },
]

const NICHE_LABELS: Record<string, string> = {
  zonnepanelen: 'Zonnepanelen',
  warmtepomp: 'Warmtepomp',
  cv_ketel: 'CV-ketel',
  waterontharder: 'Waterontharder',
  isolatie: 'Isolatie',
  kozijnen: 'Kozijnen',
  laadpaal: 'Laadpaal',
  ventilatie: 'Ventilatie',
  airco: 'Airco',
  vloerverwarming: 'Vloerverwarming',
  thuisbatterij: 'Thuisbatterij',
  alarmsysteem: 'Alarmsysteem',
  asbest: 'Asbest',
  gietvloer: 'Gietvloer',
  verbouwing: 'Verbouwing',
  traprenovatie: 'Traprenovatie',
  dakkapel: 'Dakkapel',
  vochtbestrijding: 'Vochtbestrijding',
  badkamer_verbouwen: 'Badkamer verbouwen',
  aanbouw: 'Aanbouw',
  gevelwerk: 'Gevelwerk',
  verhuizen: 'Verhuizen',
  dakdekker: 'Dakdekker',
  stukadoor: 'Stukadoor',
  schilder: 'Schilder',
  elektricien: 'Elektricien',
  ongedierte: 'Ongediertebestrijding',
  glaszetter: 'Glaszetter',
  tegelzetter: 'Tegelzetter',
  timmerman: 'Timmerman',
  loodgieter: 'Loodgieter',
  architect: 'Architect',
  glazenwasser: 'Glazenwasser',
  zonwering: 'Zonwering',
  rioolservice: 'Rioolservice',
  schoorsteenveger: 'Schoorsteenveger',
  slotenmaker: 'Slotenmaker',
  klusjesman: 'Klusjesman',
  klusser: 'Klusser',
  installateur: 'Installateur',
  tuinadvies: 'Tuinadvies',
  hovenier: 'Hovenier',
  stratenmaker: 'Stratenmaker',
  serre: 'Serre',
  garagedeur: 'Garagedeur',
  hekwerk: 'Hekwerk',
  carport: 'Carport',
  veranda: 'Veranda',
}

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  install: 'Installeren',
  repair: 'Repareren',
  maintain: 'Onderhouden',
}

const SEGMENT_LABELS: Record<Segment, string> = {
  b2c: 'Particulier',
  b2b: 'Zakelijk',
}

const ALL_SERVICE_TYPES: ServiceType[] = ['install', 'repair', 'maintain']

const MODE_OPTIONS: { value: BuyerMode; title: string; desc: string }[] = [
  {
    value: 'both',
    title: 'Toon beide',
    desc: 'Beide opties (exclusief + gedeeld) per lead — je kiest per lead.',
  },
  {
    value: 'exclusive',
    title: 'Alleen exclusief',
    desc: 'Toon alleen leads die nog exclusief te kopen zijn.',
  },
  {
    value: 'shared',
    title: 'Alleen gedeeld',
    desc: 'Leads kopen voor een lagere prijs, gedeeld met andere kopers.',
  },
]

export interface PreferencesInitial {
  niches: string[]
  preferredMode: BuyerMode
  notifyOnNewLead: boolean
  serviceTypes?: ServiceType[] | null
  segments?: Segment[]
}

interface Props {
  mode: 'onboarding' | 'settings'
  initial?: PreferencesInitial
  /** Called after a successful save (e.g. navigate to /feed). */
  onSaved?: () => void
}

function Toggle({
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
      aria-pressed={active}
      className={cn(
        'flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-[#9dd3cd] bg-[#e9f5f3] text-[#173a40]'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
      )}
    >
      {children}
    </button>
  )
}

export function PreferencesForm({ mode, initial, onSaved }: Props) {
  const completeOnboarding = useMutation(
    api.marketplace.buyerPreferences.completeOnboarding,
  )
  const updatePrefs = useMutation(
    api.marketplace.buyerPreferences.updateBuyerPreferences,
  )

  const [niches, setNiches] = useState<string[]>(initial?.niches ?? [])
  const [preferredMode, setPreferredMode] = useState<BuyerMode>(
    initial?.preferredMode ?? 'both',
  )
  const [notifyOnNewLead, setNotifyOnNewLead] = useState<boolean>(
    initial?.notifyOnNewLead ?? true,
  )
  const [serviceTypes, setServiceTypes] = useState<ServiceType[] | null>(
    initial?.serviceTypes ?? null,
  )
  const [segments, setSegments] = useState<Segment[]>(
    initial?.segments && initial.segments.length > 0
      ? initial.segments
      : ['b2c', 'b2b'],
  )
  const [saving, setSaving] = useState(false)

  const showNotifyToggle = mode === 'settings'

  const toggleNiche = (n: string) =>
    setNiches((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    )

  const toggleCategory = (nichesInCat: string[]) => {
    const allSelected = nichesInCat.every((n) => niches.includes(n))
    if (allSelected) {
      setNiches((prev) => prev.filter((x) => !nichesInCat.includes(x)))
    } else {
      setNiches((prev) => Array.from(new Set([...prev, ...nichesInCat])))
    }
  }

  const toggleServiceType = (st: ServiceType) =>
    setServiceTypes((prev) => {
      if (prev === null) return ALL_SERVICE_TYPES.filter((x) => x !== st)
      if (prev.includes(st)) {
        const next = prev.filter((x) => x !== st)
        return next.length === 0 ? null : next
      }
      const next = [...prev, st]
      return next.length === ALL_SERVICE_TYPES.length ? null : next
    })

  const toggleSegment = (s: Segment) =>
    setSegments((prev) => {
      const next = prev.includes(s)
        ? prev.filter((x) => x !== s)
        : [...prev, s]
      // Never let the buyer uncheck both — at least one stays active.
      return next.length === 0 ? prev : next
    })

  const handleSubmit = async () => {
    if (niches.length === 0) {
      toast.error('Kies minimaal één niche')
      return
    }
    setSaving(true)
    try {
      // null serviceTypes → omit (backend treats undefined = accept all).
      const serviceTypesArg =
        serviceTypes === null ? undefined : serviceTypes
      if (mode === 'onboarding') {
        await completeOnboarding({
          niches,
          preferredMode,
          serviceTypes: serviceTypesArg,
          segments,
        })
        toast.success('Welkom! Je feed is klaar.')
      } else {
        await updatePrefs({
          niches,
          preferredMode,
          notifyOnNewLead,
          serviceTypes: serviceTypesArg,
          segments,
        })
        toast.success('Instellingen opgeslagen')
      }
      onSaved?.()
    } catch (e) {
      toast.error(humanizeConvexError(e, 'Opslaan mislukt'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">
          Welke niches wil je zien?
        </h2>
        <p className="mb-4 text-sm text-zinc-600">
          Alleen leads in deze niches verschijnen in je feed.
        </p>
        <div className="space-y-6">
          {NICHE_CATEGORIES.map((cat) => {
            const allSelected = cat.niches.every((n) => niches.includes(n))
            return (
              <div key={cat.label}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                    {cat.label}
                  </h3>
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.niches)}
                    className="text-xs text-[#328f97] hover:underline"
                  >
                    {allSelected ? 'Deselecteer alles' : 'Selecteer alles'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {cat.niches.map((n) => (
                    <Toggle
                      key={n}
                      active={niches.includes(n)}
                      onClick={() => toggleNiche(n)}
                    >
                      {NICHE_LABELS[n] ?? n}
                    </Toggle>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">
          Type werk (optioneel)
        </h2>
        <p className="mb-4 text-sm text-zinc-600">
          Niet aangevinkt = alle typen. Leads zonder type zie je altijd.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ALL_SERVICE_TYPES.map((st) => {
            const selected = serviceTypes === null || serviceTypes.includes(st)
            return (
              <Toggle
                key={st}
                active={selected}
                onClick={() => toggleServiceType(st)}
              >
                {SERVICE_TYPE_LABELS[st]}
              </Toggle>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">
          Particulier of zakelijk?
        </h2>
        <p className="mb-4 text-sm text-zinc-600">Minstens één moet aanstaan.</p>
        <div className="grid grid-cols-2 gap-2">
          {(['b2c', 'b2b'] as const).map((s) => (
            <Toggle
              key={s}
              active={segments.includes(s)}
              onClick={() => toggleSegment(s)}
            >
              {SEGMENT_LABELS[s]}
            </Toggle>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">
          Hoe wil je leads kopen?
        </h2>
        <p className="mb-4 text-sm text-zinc-600">
          Je kunt dit later wijzigen. Beide opties blijven per lead beschikbaar.
        </p>
        <div className="space-y-2">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPreferredMode(opt.value)}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
                preferredMode === opt.value
                  ? 'border-[#9dd3cd] bg-[#e9f5f3]'
                  : 'border-zinc-200 hover:bg-zinc-50',
              )}
            >
              <span
                className={cn(
                  'mt-1 h-4 w-4 shrink-0 rounded-full border-2',
                  preferredMode === opt.value
                    ? 'border-[#328f97] bg-[#328f97]'
                    : 'border-zinc-300',
                )}
              />
              <span>
                <span className="block font-medium text-zinc-900">
                  {opt.title}
                </span>
                <span className="block text-sm text-zinc-600">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {showNotifyToggle && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-zinc-900">
            Notificaties
          </h2>
          <div className="flex items-center justify-between rounded-md border border-zinc-200 p-3">
            <div>
              <Label>Mail me bij nieuwe leads</Label>
              <p className="text-xs text-zinc-500">
                Je krijgt een mail zodra een matchende lead binnenkomt.
              </p>
            </div>
            <Switch
              checked={notifyOnNewLead}
              onCheckedChange={setNotifyOnNewLead}
            />
          </div>
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-zinc-200 bg-white px-4 py-4 sm:-mx-6 sm:px-6">
        <Button
          onClick={handleSubmit}
          disabled={saving || niches.length === 0}
          className="w-full"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {mode === 'onboarding' ? 'Start met kopen' : 'Opslaan'}
        </Button>
      </div>
    </div>
  )
}
