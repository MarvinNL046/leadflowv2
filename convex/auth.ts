import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";

/**
 * Convex Auth providers voor LeadFlow v2.
 *
 * - Password: email + password sign-in/up — actief vanaf installatie.
 * - Google: voorbereid in code maar functioneel pas wanneer
 *   AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET zijn gezet in Convex dev en
 *   productie env vars. Tot dan faalt een Google sign-in attempt
 *   netjes; de provider-registratie blokkeert geen schema-push.
 *
 * Setup voor Google later (zonder code-change nodig):
 *   1. Maak OAuth-credentials aan in Google Cloud Console
 *      → APIs & Services → Credentials → Create OAuth Client ID
 *      → Application type: Web application
 *      → Authorized redirect URI: https://<jouw-convex-deployment>.convex.site/api/auth/callback/google
 *   2. Zet env vars op je Convex dev deployment:
 *      npx convex env set AUTH_GOOGLE_ID <client-id>
 *      npx convex env set AUTH_GOOGLE_SECRET <client-secret>
 *   3. Voor productie deployment: zelfde commands met `--prod` flag
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google],
});
