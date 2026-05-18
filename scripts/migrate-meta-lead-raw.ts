/**
 * Migrate Staycool meta_lead_raw rows (Neon → Convex).
 *
 * Idempotent via leadgenId (al unique in Neon, al via by_leadgenId
 * index in Convex). Rerun = safe.
 *
 * contactId-FK wordt geresolved via contacts.by_legacyContactId tijdens
 * upsert; opportunityId wordt overgeslagen (geen opportunities-migratie).
 *
 * Run vanuit v2-folder:
 *   npx tsx scripts/migrate-meta-lead-raw.ts
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
const BATCH_SIZE = 50;  // payload jsonb kan groot zijn, kleinere batch

if (!NEON_URL) {
  console.error("❌ NEON_DATABASE_URL niet gezet (.env.migration).");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("❌ CONVEX_URL / VITE_CONVEX_URL niet gezet.");
  process.exit(1);
}

const STAYCOOL_ORG_ID_V1 = 16; // Geverifieerd via scripts/_inspect-neon.ts
                                // (org "Staycool Airconditioning's Organization", slug "org-25")

type MetaStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

async function main() {
  // @ts-expect-error - _generated/api wordt door `npx convex dev` regen'd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex meta_lead_raw ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("Target:", CONVEX_URL);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL);

  const orgId = await convex.query(api.migration.getStaycoolOrgId, {});
  if (!orgId) {
    console.error("❌ Staycool org niet gevonden in Convex.");
    process.exit(1);
  }
  console.log("✓ Target org:", orgId);

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedMetaLeadRaws,
    { orgId },
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} meta_lead_raw rows`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: leads } = await pool.query<NeonMetaLeadRawRow>(
    `SELECT id, org_id, leadgen_id, page_id, form_id,
            ad_id, adgroup_id, campaign_id,
            payload, field_data,
            status, contact_id, error_message, retry_count,
            fetched_at, processing_started_at, processed_at
       FROM meta_lead_raw
      WHERE org_id = $1
      ORDER BY id`,
    [STAYCOOL_ORG_ID_V1],
  );

  console.log(`✓ ${leads.length} meta_lead_raw rows uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 rows ge-transformeerd:");
    leads.slice(0, 3).forEach((l) => {
      console.log(JSON.stringify(transformLeadRaw(l), null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  const startMs = Date.now();

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const docs = batch.map(transformLeadRaw);

    const result = await convex.mutation(api.migration.upsertMetaLeadRawBatch, {
      orgId,
      docs,
    });

    totalInserted += result.inserted;
    totalUpdated += result.updated;

    const progress = Math.min(i + BATCH_SIZE, leads.length);
    const pct = Math.round((progress / leads.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${leads.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ meta_lead_raw migratie klaar");
  console.log(`   Inserted: ${totalInserted}`);
  console.log(`   Updated:  ${totalUpdated}`);
  console.log(`   Tijd:     ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonMetaLeadRawRow {
  id: number;
  org_id: number;
  leadgen_id: string;
  page_id: string;
  form_id: string | null;
  ad_id: string | null;
  adgroup_id: string | null;
  campaign_id: string | null;
  payload: unknown;
  field_data: unknown;
  status: string;
  contact_id: number | null;
  error_message: string | null;
  retry_count: number | null;
  fetched_at: Date;
  processing_started_at: Date | null;
  processed_at: Date | null;
}

function transformLeadRaw(l: NeonMetaLeadRawRow) {
  const validStatuses: MetaStatus[] = [
    "pending",
    "processing",
    "completed",
    "failed",
    "skipped",
  ];
  const status: MetaStatus = (validStatuses as string[]).includes(l.status)
    ? (l.status as MetaStatus)
    : "completed";  // fallback voor onbekende v1-statuses (data is al historisch)

  return {
    leadgenId: l.leadgen_id,
    pageId: l.page_id,
    formId: l.form_id ?? undefined,
    adId: l.ad_id ?? undefined,
    adgroupId: l.adgroup_id ?? undefined,
    campaignId: l.campaign_id ?? undefined,
    payload: l.payload,
    fieldData: l.field_data ?? undefined,
    status,
    legacyContactId: l.contact_id ?? undefined,
    errorMessage: l.error_message ?? undefined,
    retryCount: l.retry_count ?? 0,
    fetchedAt: new Date(l.fetched_at).getTime(),
    processingStartedAt: l.processing_started_at
      ? new Date(l.processing_started_at).getTime()
      : undefined,
    processedAt: l.processed_at
      ? new Date(l.processed_at).getTime()
      : undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Migratie gefaald:");
  console.error(err);
  process.exit(1);
});
