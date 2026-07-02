export default {
  providers: [
    // Convex Auth (self-issued JWT) — het bestaande login-pad. Blijft
    // tijdens de Clerk-migratie-brugfase geldig zodat lopende sessies en
    // de oude frontend niets merken. Verwijderen bij de cleanup ná de
    // cutover.
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
    // Clerk — de gedeelde wetry-identity (zelfde issuer als cashflow en
    // frostwork = één login over de suite). Waarde staat als
    // CLERK_JWT_ISSUER_DOMAIN op de Convex-deployment.
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
