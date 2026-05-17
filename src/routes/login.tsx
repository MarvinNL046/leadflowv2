import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/login')({ component: LoginPage })

type Flow = 'signIn' | 'signUp'

function LoginPage() {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
  const { isAuthenticated } = useConvexAuth()
  const ensureProfile = useMutation(api.userProfiles.getOrCreateUserProfile)

  const [flow, setFlow] = useState<Flow>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Wanneer al ingelogd: meteen door naar home
  if (isAuthenticated) {
    void navigate({ to: '/' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.set('email', email)
      formData.set('password', password)
      formData.set('flow', flow)
      await signIn('password', formData)
      // First sign-in op deze user → maak userProfile aan (idempotent).
      // Wacht hier op zodat home page meteen een profile heeft.
      await ensureProfile({})
      void navigate({ to: '/' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        flow === 'signIn'
          ? `Inloggen mislukt: ${msg}`
          : `Registratie mislukt: ${msg}`,
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">
          {flow === 'signIn' ? 'Inloggen' : 'Account aanmaken'}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          LeadFlow v2 — {flow === 'signIn' ? 'welkom terug' : 'start je account'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              E-mailadres
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="naam@bedrijf.nl"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Wachtwoord
            </label>
            <input
              id="password"
              type="password"
              autoComplete={
                flow === 'signIn' ? 'current-password' : 'new-password'
              }
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="minimaal 8 tekens"
            />
          </div>

          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting
              ? 'Bezig…'
              : flow === 'signIn'
                ? 'Inloggen'
                : 'Account aanmaken'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-zinc-600">
          {flow === 'signIn' ? (
            <>
              Nog geen account?{' '}
              <button
                type="button"
                onClick={() => setFlow('signUp')}
                className="font-medium text-violet-700 hover:underline"
              >
                Registreren
              </button>
            </>
          ) : (
            <>
              Heb je al een account?{' '}
              <button
                type="button"
                onClick={() => setFlow('signIn')}
                className="font-medium text-violet-700 hover:underline"
              >
                Inloggen
              </button>
            </>
          )}
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-4 text-center text-xs text-zinc-400">
          <Link to="/" className="hover:underline">
            ← terug naar home
          </Link>
        </div>

        {/* Google OAuth: voorbereid in convex/auth.ts maar wacht op
            AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET env vars. Knop wordt
            zichtbaar zodra die gezet zijn — voor nu placeholder-comment. */}
      </div>
    </div>
  )
}
