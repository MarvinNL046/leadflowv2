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
          BELANGRIJK: alleen renderen zolang Convex-auth nog niet rond is —
          een <SignIn> mét actieve sessie redirect anders in een loop.
          Na Clerk's post-sign-in redirect (default '/') doet de root-level
          ProfileBootstrap de users-rij/profile/tenant-ensure; het effect
          hierboven dekt het pad waarin de user op /login blijft. */}
      {isAuthenticated && !isLoading ? (
        <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-zinc-600">Ingelogd — profiel laden…</p>
        </div>
      ) : (
        <SignIn routing="hash" />
      )}

      {error && (
        <div className="w-full max-w-sm rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {statusMsg && !error && (
        <div className="w-full max-w-sm rounded-md bg-[#e9f5f3] px-3 py-2 text-sm text-[#2a7a81]">
          {statusMsg}
        </div>
      )}

      <Link to="/" className="text-xs text-zinc-400 hover:underline">
        ← terug naar home
      </Link>
    </div>
  )
}
