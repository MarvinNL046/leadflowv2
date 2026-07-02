import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { SignIn } from '@clerk/clerk-react'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const ensureProfile = useMutation(api.userProfiles.getOrCreateUserProfile)

  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // Zelfde bootstrap-moment als vóór de Clerk-migratie: zodra Convex het
  // (nu door Clerk uitgegeven) token accepteert, ensure't deze mutation de
  // users-rij + profile + tenant en sturen we door. Bij de allereerste
  // Clerk-login linkt getOrCreateUserProfile (via lib/identity.ensureUserId)
  // automatisch aan de bestaande CRM-user op geverifieerd e-mailadres.
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      setStatusMsg('Ingelogd, profile aanmaken…')
      ensureProfile({})
        .then(() => {
          setStatusMsg('Klaar, doorsturen…')
          void navigate({ to: '/' })
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          setError(`Profile aanmaken mislukt: ${msg}`)
          setStatusMsg(null)
        })
    }
  }, [isAuthenticated, isLoading, ensureProfile, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-4">
      {/* Clerk's kant-en-klare sign-in (Google + e-mail/wachtwoord — wat op
          de gedeelde wetry-instance aanstaat). hash-routing zodat er geen
          extra TanStack-routes voor de sub-stappen (verify, MFA) nodig zijn.
          forceRedirectUrl pint Clerk's post-sign-in full-page redirect op
          /login zelf, zodat het bootstrap-useEffect hierboven gegarandeerd
          draait (ensureProfile → navigate '/') i.p.v. dat Clerk de pagina
          unloadt vóór het effect kan vuren. Vangnet: ProfileBootstrap in de
          provider heelt elk pad dat hier toch omheen gaat. */}
      <SignIn routing="hash" forceRedirectUrl="/login" />

      {error && (
        <div className="w-full max-w-sm rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {statusMsg && !error && (
        <div className="w-full max-w-sm rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-700">
          {statusMsg}
        </div>
      )}

      <Link to="/" className="text-xs text-zinc-400 hover:underline">
        ← terug naar home
      </Link>
    </div>
  )
}
