import posthog from 'posthog-js'
import { PostHogProvider as BasePostHogProvider } from '@posthog/react'
import type { ReactNode } from 'react'

// Skip init wanneer key ontbreekt of nog op scaffold-placeholder staat.
// Voorkomt 401/404 noise in browser console tot er een echte project-key
// gezet is. Wanneer Marvin straks PostHog wil activeren: vervang
// VITE_POSTHOG_KEY in .env.local met een echte phc_... key uit
// https://app.posthog.com/project/settings.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_ENABLED =
  typeof window !== 'undefined' &&
  typeof POSTHOG_KEY === 'string' &&
  POSTHOG_KEY.length > 0 &&
  POSTHOG_KEY !== 'phc_xxx'

if (POSTHOG_ENABLED) {
  posthog.init(POSTHOG_KEY, {
    // Voor NL klanten: gebruik eu.i.posthog.com (GDPR-friendlier) — set
    // VITE_POSTHOG_HOST=https://eu.i.posthog.com in .env.local.
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    defaults: '2025-11-30',
  })
}

interface PostHogProviderProps {
  children: ReactNode
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
  if (!POSTHOG_ENABLED) {
    // No-op: render children direct, geen PostHog client beschikbaar.
    return <>{children}</>
  }
  return <BasePostHogProvider client={posthog}>{children}</BasePostHogProvider>
}
