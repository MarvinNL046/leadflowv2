import { useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { humanizeConvexError } from '#/lib/errors'

export function MarketplaceStart() {
  const tenants = useQuery(api.userProfiles.myTenants)
  const tenant = tenants?.find(item => item.workspace !== null)
  const canEnable = tenant?.role === 'owner' || tenant?.role === 'admin'
  const enable = useMutation(api.marketplace.access.enableMarketplaceForCurrentOrg)
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function activate() {
    if (!tenant?.org || !canEnable || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await enable({ orgId: tenant.org.id })
      if (!result.success) setError('Alleen een eigenaar of beheerder kan dit activeren.')
    } catch (error) { setError(humanizeConvexError(error, 'Activeren is niet gelukt. Probeer opnieuw.')) }
    finally { lock.current = false; setBusy(false) }
  }

  return <main className="mx-auto max-w-2xl space-y-5 p-6">
    <a href="/crm" className="text-sm text-primary underline">Terug naar CRM</a>
    <h1 className="text-2xl font-semibold">Leads kopen</h1>
    <p>Vind offerteaanvragen voor je bedrijf. Stel na activering je diensten en werkgebied in en bekijk de beschikbare leads.</p>
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <h2 className="font-medium">Marketplace activeren</h2>
      <p className="text-sm text-muted-foreground">Hiermee maak je de marketplace beschikbaar voor je bedrijf. Je koopt nog geen lead en er wordt niets afgeschreven. Bekijk prijs en verkoopvorm voordat je een aankoop bevestigt.</p>
      {tenants === undefined ? <p>Bedrijf laden…</p> : !tenant ? <p>Rond eerst je bedrijfsregistratie af via het CRM.</p> : canEnable ? <Button disabled={busy} onClick={() => void activate()}>{busy ? 'Activeren…' : 'Marketplace voor mijn bedrijf activeren'}</Button> : <p>Vraag de eigenaar of beheerder van je bedrijf om de marketplace te activeren.</p>}
      <p className="text-sm text-muted-foreground">De standaardinstelling zet meldingen over nieuwe leads per e-mail aan. Je kunt dit aanpassen bij Werkgebied en meldingen.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  </main>
}
