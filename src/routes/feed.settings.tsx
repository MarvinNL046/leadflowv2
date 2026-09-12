import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { PreferencesForm, type PreferencesInitial } from '#/components/marketplace/preferences-form'

export const Route=createFileRoute('/feed/settings')({component:BuyerSettings})
function BuyerSettings(){
  const access=useQuery(api.marketplace.access.marketplaceAccess)
  const prefs=useQuery(api.marketplace.buyerPreferences.getBuyerPreferences)
  if (!access?.ok || !access.canManage) return <p className="p-6">{access===undefined?'Rechten laden…':'Alleen een eigenaar of bedrijfsbeheerder kan het werkgebied en de meldingen aanpassen.'}</p>
  return <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
    <header><h1 className="text-2xl font-bold">Werkgebied en meldingen</h1><p className="mt-2 text-sm text-zinc-600">Kies de aanvragen die bij je bedrijf passen. E-mailmeldingen gaan naar het accountadres van de organisatie-eigenaar.</p></header>
    {prefs===undefined?<p role="status">Instellingen laden…</p>:<PreferencesForm mode="settings" initial={prefs?{
      niches:prefs.niches,preferredMode:prefs.preferredMode,notifyOnNewLead:prefs.notifyOnNewLead && prefs.emailAlertsActivatedAt!==undefined,
      serviceTypes:prefs.serviceTypes as PreferencesInitial['serviceTypes'],segments:prefs.segments as PreferencesInitial['segments'],provinces:prefs.provinces,
    }:undefined}/>}
  </div>
}
