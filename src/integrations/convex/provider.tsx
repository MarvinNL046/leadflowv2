import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexQueryClient } from '@convex-dev/react-query'

const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL
if (!CONVEX_URL) {
  console.error('missing envar CONVEX_URL')
}
const convexQueryClient = new ConvexQueryClient(CONVEX_URL)

/**
 * Wraps the app with Convex Auth so `useAuthActions()` + `useAuthToken()` +
 * `<Authenticated>`/`<Unauthenticated>` components werken in routes.
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
    <ConvexAuthProvider client={convexQueryClient.convexClient}>
      {children}
    </ConvexAuthProvider>
  )
}
