/**
 * Migrate custom_field_values uit v1 Neon DB → v2 Convex.
 *
 * MOET ná migrate-custom-field-defs draaien én ná
 * migrate-opportunities/migrate-contacts — alle 3 FK's worden hier
 * geresolved. Idempotent via legacyId.
 *   npx tsx scripts/migrate-custom-field-values.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-custom-field-values.ts
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
const STAYCOOL_WORKSPACE_ID_V1 = 12;

if (!NEON_URL) {
  console.error("❌ NEON_DATABASE_URL niet gezet (zie .env.migration).");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("❌ CONVEX_URL / VITE_CONVEX_URL niet gezet.");
  process.exit(1);
}

async function main() {
  // @ts-ignore - convex/_generated/api wordt door `npx convex dev` gegenereerd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex custom_field_values ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("Target:", CONVEX_URL);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedCustomFieldValues,
    {},
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} field-values`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // v1 custom_field_values heeft alleen contact_id (geen entity-split).
  // FK heet field_id i.p.v. definition_id. value is plain text, array_value
  // is jsonb voor multi-select.
  const { rows: values } = await pool.query<NeonCustomFieldValueRow>(
    `SELECT v.id, v.field_id, v.contact_id, v.value, v.array_value
       FROM custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.field_id
      WHERE d.workspace_id = $1
      ORDER BY v.id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${values.length} field-values gelezen uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 5 rows ge-transformeerd:");
    values.slice(0, 5).forEach((v) => {
      const doc = transformValue(v);
      console.log(JSON.stringify(doc, null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkippedDef = 0;
  let totalSkippedEntity = 0;
  let totalSkippedType = 0;
  const startMs = Date.now();

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    const docs: Array<NonNullable<ReturnType<typeof transformValue>>> = [];
    for (const v of batch) {
      const doc = transformValue(v);
      if (doc === null) {
        totalSkippedType++;
        continue;
      }
      docs.push(doc);
    }

    if (docs.length === 0) continue;

    const result = await convex.mutation(
      api.migration.upsertCustomFieldValuesBatch,
      { docs },
    );

    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkippedDef += result.skippedNoDefinition;
    totalSkippedEntity += result.skippedNoEntity;

    const progress = Math.min(i + BATCH_SIZE, values.length);
    const pct = Math.round((progress / values.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${values.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated, ` +
        `${totalSkippedDef + totalSkippedEntity + totalSkippedType} skipped`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ Custom-field-values-migratie klaar");
  console.log(`   Inserted:                ${totalInserted}`);
  console.log(`   Updated:                 ${totalUpdated}`);
  console.log(`   Skipped (geen def):      ${totalSkippedDef}`);
  console.log(`   Skipped (geen entity):   ${totalSkippedEntity}`);
  console.log(`   Skipped (foute type):    ${totalSkippedType}`);
  console.log(`   Tijd:                    ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonCustomFieldValueRow {
  id: number;
  field_id: number;
  contact_id: number;
  value: string | null;
  array_value: unknown; // jsonb — meestal array, soms null
}

function transformValue(v: NeonCustomFieldValueRow) {
  // array_value heeft voorrang als die gevuld is (multi-select), anders
  // de plain text value. v2 schema accepteert v.any().
  const finalValue = v.array_value ?? v.value;
  return {
    legacyId: v.id,
    legacyDefinitionId: v.field_id,
    entityType: "contact" as const,
    legacyEntityId: v.contact_id,
    value: finalValue,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Custom-field-values-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
