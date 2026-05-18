/**
 * Seed "Snelle Response" workflow voor Staycool. Idempotent.
 *
 * Run: npx tsx scripts/seed-workflows.ts
 * Voor test met korte delay: DELAY_SECONDS=15 npx tsx scripts/seed-workflows.ts
 */
import { config } from "dotenv";
import { ConvexClient } from "convex/browser";

config({ path: ".env.local" });

async function main() {
  // @ts-expect-error
  const { api } = await import("../convex/_generated/api.js");
  const convex = new ConvexClient(process.env.VITE_CONVEX_URL!);

  const delaySeconds = process.env.DELAY_SECONDS
    ? Number(process.env.DELAY_SECONDS)
    : undefined;

  const result = await convex.mutation(api.migration.seedSnelleResponse, {
    delaySeconds,
  });
  console.log("✓ Snelle Response:", result);

  await convex.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
