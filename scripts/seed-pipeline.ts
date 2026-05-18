/**
 * Seed Staycool's default pipeline + 3 test-opportunities op bestaande
 * contacts. Idempotent (seedDefault no-op'd bij hit).
 *
 * Calls publieke seedDefault — die heeft membership-check. Werkt niet
 * vanuit Node-script ZONDER auth. Voor MVP: roep handmatig vanuit UI
 * via een tijdelijke knop, OF maak seedDefault tijdelijk auth-loos.
 *
 * Pragmatischer: gebruik de bestaande migration.ts pattern — voeg een
 * publieke `seedStaycoolPipeline` mutation toe ZONDER auth-check.
 *
 * Run: npx tsx scripts/seed-pipeline.ts
 */
import { config } from "dotenv";
import { ConvexClient } from "convex/browser";

config({ path: ".env.local" });

async function main() {
  // @ts-expect-error
  const { api } = await import("../convex/_generated/api.js");
  const convex = new ConvexClient(process.env.VITE_CONVEX_URL!);

  const workspaceId = await convex.query(
    api.migration.getStaycoolWorkspaceId,
    {},
  );
  if (!workspaceId) throw new Error("Staycool workspace niet gevonden");
  console.log("✓ Workspace:", workspaceId);

  const result = await convex.mutation(api.migration.seedStaycoolPipeline, {});
  console.log("✓ Pipeline seed:", result);

  await convex.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
