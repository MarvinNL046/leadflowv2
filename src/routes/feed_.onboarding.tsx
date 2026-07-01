import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Authenticated, Unauthenticated, useQuery } from 'convex/react'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  PreferencesForm,
  type PreferencesInitial,
} from '#/components/marketplace/preferences-form.tsx'
import { api } from '../../convex/_generated/api'

/**
 * Chrome-free onboarding. The `feed_` prefix opts this route out of the
 * feed.tsx shell (matches v1's (no-shell) route group). It runs its own
 * auth + marketplace-access gate since it is NOT nested under feed.tsx.
 */
export const Route = createFileRoute('/feed_/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  return (
    <>
      <Authenticated>
        <OnboardingGate />
      </Authenticated>
      <Unauthenticated>
        <RedirectTo to="/login" label="Doorsturen naar login…" />
      </Unauthenticated>
    </>
  )
}

function OnboardingGate() {
  const access = useQuery(api.marketplace.access.marketplaceAccess)

  if (access === undefined) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!access.ok) {
    return <RedirectTo to="/crm" label="Geen marketplace-toegang…" />
  }
  return <OnboardingContent />
}

function OnboardingContent() {
  const navigate = useNavigate()
  const prefs = useQuery(api.marketplace.buyerPreferences.getBuyerPreferences)

  // Already onboarded → straight to the feed.
  useEffect(() => {
    if (prefs?.onboardingCompletedAt) {
      void navigate({ to: '/feed' })
    }
  }, [prefs, navigate])

  if (prefs === undefined) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (prefs?.onboardingCompletedAt) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Doorsturen naar je feed…</p>
      </div>
    )
  }

  const initial: PreferencesInitial | undefined = prefs
    ? {
        niches: (prefs.niches as string[]) ?? [],
        preferredMode: prefs.preferredMode,
        notifyOnNewLead: prefs.notifyOnNewLead,
        serviceTypes:
          (prefs.serviceTypes as ('install' | 'repair' | 'maintain')[] | undefined) ??
          null,
        segments: (prefs.segments as ('b2c' | 'b2b')[] | undefined) ?? [
          'b2c',
          'b2b',
        ],
      }
    : undefined

  return (
    <div className="min-h-screen w-full bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-zinc-900">
            Welkom op LeadFlow Marketplace
          </h1>
          <p className="mt-2 text-zinc-600">
            Stel je voorkeuren in — daarna zie je alleen leads die voor jouw
            bedrijf relevant zijn.
          </p>
        </div>
        <PreferencesForm
          mode="onboarding"
          initial={initial}
          onSaved={() => navigate({ to: '/feed' })}
        />
      </div>
    </div>
  )
}

function RedirectTo({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  useEffect(() => {
    void navigate({ to })
  }, [navigate, to])
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50">
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  )
}
