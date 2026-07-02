import { useEffect, useRef } from 'react'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL
if (!CONVEX_URL) {
  // Fail-loud: een prod-build zonder VITE_CONVEX_URL levert anders een stille,
  // dode Convex-client op (alle queries falen zonder zichtbare oorzaak).
  throw new Error(
    'VITE_CONVEX_URL ontbreekt — zet deze in de Vercel project-env (Production scope) ' +
      'op https://<prod-deployment>.convex.cloud',
  )
}
const convexQueryClient = new ConvexQueryClient(CONVEX_URL)

// Clerk publishable key — de gedeelde wetry-PRODUCTION-instance
// (clerk.wetry.app; zelfde als cashflow + frostwork = één login + SSO over
// de suite). pk-keys zijn publiek (ze zitten in elke client-bundle), dus
// een hardcoded fallback is veilig; via VITE_CLERK_PUBLISHABLE_KEY
// overridebaar.
const CLERK_PUBLISHABLE_KEY =
  (import.meta as any).env.VITE_CLERK_PUBLISHABLE_KEY ??
  'pk_live_Y2xlcmsud2V0cnkuYXBwJA'

/**
 * Root-level bootstrap-vangnet: zodra Convex het Clerk-token accepteert
 * maar er nog geen userProfile is (eerste login, deep-link naar /crm,
 * Clerk's full-page redirect die /login unloadt vóór het effect daar kan
 * vuren), ensure't dit precies één keer de users-rij + profile + tenant.
 * getOrCreateUserProfile is idempotent, dus dubbel vuren met /login's
 * eigen effect is onschadelijk. Rendert niets.
 */
function ProfileBootstrap() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const profile = useQuery(api.userProfiles.me, isAuthenticated ? {} : 'skip')
  const ensureProfile = useMutation(api.userProfiles.getOrCreateUserProfile)
  const inFlight = useRef(false)

  useEffect(() => {
    if (isAuthenticated && !isLoading && profile === null && !inFlight.current) {
      inFlight.current = true
      ensureProfile({})
        .catch((err) => {
          console.error('[bootstrap] getOrCreateUserProfile faalde:', err)
        })
        .finally(() => {
          // profile-query wordt reactief bijgewerkt; alleen opnieuw proberen
          // als die ná deze call nog steeds null is (volgende effect-run).
          inFlight.current = false
        })
    }
  }, [isAuthenticated, isLoading, profile, ensureProfile])

  return null
}

/**
 * Wraps de app met Clerk (identity) + Convex (data). Clerk geeft het JWT
 * uit; ConvexProviderWithClerk stuurt dat mee zodat `useConvexAuth()` +
 * `<Authenticated>`/`<Unauthenticated>` in routes blijven werken zoals
 * onder Convex Auth.
 *
 * Onderliggend reused dezelfde Convex client als TanStack Query — auth-state
 * en query-cache delen één websocket-verbinding.
 */
export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/login"
    >
      <ConvexProviderWithClerk
        client={convexQueryClient.convexClient}
        useAuth={useAuth}
      >
        <ProfileBootstrap />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}
