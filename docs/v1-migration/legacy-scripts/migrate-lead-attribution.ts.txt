/**
 * Migrate Staycool lead_attribution rows (Neon → Convex).
 *
 * Idempotent via legacyId field in Convex leadAttribution.
 * Rerun = safe (existing rows worden gepatcht i.p.v. duplicate).
 *
 * Vereist contacts-migratie eerst — attribution-rows zonder
 * matching legacyContactId in v2 worden geskipt (counter).
 *
 * Run vanuit v2-folder:
 *   npx tsx scripts/migrate-lead-attribution.ts
 *
 * DRY_RUN=1 toont eerste 3 transformed rows zonder writes.
 */
import { config } from "dotenv";
import pg from "pg";
import { ConvexClient } from "convex/browser";

config({ path: ".env.migration" });
config({ path: ".env.local" });

const NEON_URL = process.env.NEON_DATABASE_URL;
const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = 100;

if (!NEON_URL) {
  console.error("❌ NEON_DATABASE_URL niet gezet (.env.migration).");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("❌ CONVEX_URL / VITE_CONVEX_URL niet gezet.");
  process.exit(1);
}

const STAYCOOL_WORKSPACE_ID_V1 = 12;

async function main() {
  // @ts-expect-error - _generated/api wordt door `npx convex dev` regen'd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex lead_attribution ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("Target:", CONVEX_URL);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL);

  // Sanity check: contacts moeten al gemigreerd zijn.
  const workspaceId = await convex.query(api.migration.getStaycoolWorkspaceId, {});
  if (!workspaceId) {
    console.error("❌ Staycool workspace niet gevonden.");
    process.exit(1);
  }
  const contactsMigrated = await convex.query(
    api.migration.countMigratedContacts,
    { workspaceId },
  );
  if (contactsMigrated === 0) {
    console.error("❌ 0 gemigreerde contacts gevonden. Draai eerst:");
    console.error("   npx tsx scripts/migrate-contacts.ts");
    process.exit(1);
  }
  console.log(`✓ ${contactsMigrated} contacts al in Convex (target voor FK-lookup)`);

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedLeadAttributions,
    {},
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} lead_attribution rows`);
  console.log("");

  // Read Neon — join via contacts.workspace_id om alleen Staycool te krijgen.
  const pool = new pg.Pool({
    connectionString: NEON_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: attributions } = await pool.query<NeonAttributionRow>(
    `SELECT la.id, la.contact_id, la.source,
            la.meta_page_id, la.meta_form_id, la.meta_leadgen_id,
            la.meta_ad_id, la.meta_campaign_id, la.meta_adset_id,
            la.utm_source, la.utm_medium, la.utm_campaign,
            la.utm_content, la.utm_term,
            la.cost_per_lead, la.raw_payload
       FROM lead_attribution la
       JOIN contacts c ON c.id = la.contact_id
      WHERE c.workspace_id = $1
      ORDER BY la.id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${attributions.length} lead_attribution rows uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 rows ge-transformeerd:");
    attributions.slice(0, 3).forEach((a) => {
      console.log(JSON.stringify(transformAttribution(a), null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const startMs = Date.now();

  for (let i = 0; i < attributions.length; i += BATCH_SIZE) {
    const batch = attributions.slice(i, i + BATCH_SIZE);
    const docs = batch.map(transformAttribution);

    const result = await convex.mutation(
      api.migration.upsertLeadAttributionBatch,
      { docs },
    );

    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkipped += result.skippedNoContact;

    const progress = Math.min(i + BATCH_SIZE, attributions.length);
    const pct = Math.round((progress / attributions.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${attributions.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated, !${totalSkipped} skipped`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ Lead-attribution migratie klaar");
  console.log(`   Inserted:        ${totalInserted}`);
  console.log(`   Updated:         ${totalUpdated}`);
  console.log(`   Skipped (geen contact): ${totalSkipped}`);
  console.log(`   Tijd:            ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonAttributionRow {
  id: number;
  contact_id: number;
  source: string;
  meta_page_id: string | null;
  meta_form_id: string | null;
  meta_leadgen_id: string | null;
  meta_ad_id: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  cost_per_lead: string | null;  // numeric → string in pg
  raw_payload: unknown;
}

function transformAttribution(a: NeonAttributionRow) {
  // Source enum: v2 accepteert alleen meta/api/manual. Onbekende waarden
  // (legacy v1-enums) vallen terug naar "manual" om data niet te verliezen.
  const source: "meta" | "api" | "manual" =
    a.source === "meta" || a.source === "api" || a.source === "manual"
      ? a.source
      : "manual";

  return {
    legacyId: a.id,
    legacyContactId: a.contact_id,
    source,
    metaPageId: a.meta_page_id ?? undefined,
    metaFormId: a.meta_form_id ?? undefined,
    metaLeadgenId: a.meta_leadgen_id ?? undefined,
    metaAdId: a.meta_ad_id ?? undefined,
    metaCampaignId: a.meta_campaign_id ?? undefined,
    metaAdsetId: a.meta_adset_id ?? undefined,
    utmSource: a.utm_source ?? undefined,
    utmMedium: a.utm_medium ?? undefined,
    utmCampaign: a.utm_campaign ?? undefined,
    utmContent: a.utm_content ?? undefined,
    utmTerm: a.utm_term ?? undefined,
    costPerLead: a.cost_per_lead ? Number(a.cost_per_lead) : undefined,
    rawPayload: a.raw_payload ?? undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Migratie gefaald:");
  console.error(err);
  process.exit(1);
});
