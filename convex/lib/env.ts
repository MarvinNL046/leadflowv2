// Centrale env-var-toegang voor de Convex-backend.
// Fail-loud i.p.v. stille fallbacks (bv. localhost) die in productie
// stilletjes verkeerd gedrag geven. Zet vars via:
//   npx convex env set <NAAM> <waarde>            (dev)
//   npx convex env set --prod <NAAM> <waarde>     (prod)

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Verplichte env-var ontbreekt: ${name}. Zet 'm met: npx convex env set ${name} <waarde>`,
    );
  }
  return value;
}

/** Frontend-basis-URL (voor OAuth-redirects e.d.). Verplicht — geen localhost-fallback. */
export function getSiteUrl(): string {
  return requireEnv("SITE_URL");
}

/** Super-admin e-mails uit env (comma-gescheiden), met fallback op de bekende set. */
export function getSuperAdminEmails(): Set<string> {
  const raw =
    process.env.SUPER_ADMIN_EMAILS ??
    "marvinsmit1988@gmail.com,info@staycoolairco.nl";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}
