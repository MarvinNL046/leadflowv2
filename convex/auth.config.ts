export default {
  providers: [
    // Clerk — de gedeelde wetry-identity (zelfde issuer als cashflow en
    // frostwork = één login over de suite). Waarde staat als
    // CLERK_JWT_ISSUER_DOMAIN op de Convex-deployment.
    //
    // (Convex Auth is per 2026-07 volledig verwijderd; zie de
    // clerk-migration + auth-cleanup PR's voor de brugfase.)
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
