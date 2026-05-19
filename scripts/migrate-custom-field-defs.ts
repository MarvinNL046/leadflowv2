/**
 * Migrate custom_field_definitions uit v1 Neon DB → v2 Convex.
 *
 * Run vóór migrate-custom-field-values. Idempotent via legacyId.
 *   npx tsx scripts/migrate-custom-field-defs.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-custom-field-defs.ts
 *
 * Field-type mapping: v1 → v2 enum (text/number/boolean/date/select).
 * Onbekende v1-types worden geskipt met een teller.
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

const ALLOWED_FIELD_TYPES = new Set([
  "text",
  "number",
  "boolean",
  "date",
  "select",
] as const);
type AllowedFieldType = "text" | "number" | "boolean" | "date" | "select";

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

  console.log("=== V1 Neon → V2 Convex custom_field_definitions ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("Target:", CONVEX_URL);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const workspaceId = await convex.query(api.migration.getStaycoolWorkspaceId, {});
  if (!workspaceId) {
    console.error("❌ Staycool workspace niet gevonden in Convex.");
    process.exit(1);
  }
  console.log("✓ Target workspace:", workspaceId);

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedCustomFieldDefs,
    { workspaceId },
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} definitions`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // v1 custom_field_definitions is contact-only (geen entity_type kolom).
  // Naming: name → key, type → fieldType, options(jsonb) → selectOptions,
  // required → isRequired. is_active filter — alleen actieve mee.
  const { rows: defs } = await pool.query<NeonCustomFieldDefRow>(
    `SELECT id, name, label, type, options, required, sort_order
       FROM custom_field_definitions
      WHERE workspace_id = $1
        AND is_active = true
      ORDER BY id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${defs.length} definitions gelezen uit Neon`);

  const unknownTypes = new Set<string>();
  for (const d of defs) {
    if (!ALLOWED_FIELD_TYPES.has(d.type as AllowedFieldType)) {
      unknownTypes.add(d.type);
    }
  }
  if (unknownTypes.size > 0) {
    console.log(
      `⚠ Onbekende v1 field_types geskipt: ${Array.from(unknownTypes).join(", ")}`,
    );
  }
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: alle defs ge-transformeerd:");
    defs.forEach((d) => {
      const doc = transformDef(d);
      console.log(JSON.stringify(doc, null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const startMs = Date.now();

  for (let i = 0; i < defs.length; i += BATCH_SIZE) {
    const batch = defs.slice(i, i + BATCH_SIZE);
    const docs: Array<NonNullable<ReturnType<typeof transformDef>>> = [];
    for (const d of batch) {
      const doc = transformDef(d);
      if (doc === null) {
        totalSkipped++;
        continue;
      }
      docs.push(doc);
    }

    if (docs.length === 0) continue;

    const result = await convex.mutation(
      api.migration.upsertCustomFieldDefsBatch,
      { workspaceId, docs },
    );

    totalInserted += result.inserted;
    totalUpdated += result.updated;
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("✅ Custom-field-defs-migratie klaar");
  console.log(`   Inserted: ${totalInserted}`);
  console.log(`   Updated:  ${totalUpdated}`);
  console.log(`   Skipped:  ${totalSkipped} (onbekend field_type)`);
  console.log(`   Tijd:     ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonCustomFieldDefRow {
  id: number;
  name: string;
  label: string;
  type: string;
  options: unknown; // jsonb — kan array of object zijn
  required: boolean;
  sort_order: number;
}

function transformDef(d: NeonCustomFieldDefRow) {
  if (!ALLOWED_FIELD_TYPES.has(d.type as AllowedFieldType)) {
    return null;
  }
  // v1 options jsonb is alleen relevant voor select-types. Verwacht: array
  // van strings of array van {label,value} — neem strings, anders skip.
  let selectOptions: string[] | undefined;
  if (d.type === "select" && Array.isArray(d.options)) {
    selectOptions = d.options
      .map((o) => (typeof o === "string" ? o : (o as { value?: string })?.value))
      .filter((s): s is string => typeof s === "string");
  }
  return {
    legacyId: d.id,
    entityType: "contact" as const,
    key: d.name,
    label: d.label,
    fieldType: d.type as AllowedFieldType,
    selectOptions,
    isRequired: d.required,
    sortOrder: d.sort_order,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Custom-field-defs-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
