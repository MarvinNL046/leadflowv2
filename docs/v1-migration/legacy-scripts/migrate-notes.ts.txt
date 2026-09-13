/**
 * Migrate Staycool notes uit v1 Neon DB → v2 Convex.
 *
 * Idempotent via legacyId. Rerun = safe (existing rows worden gepatcht).
 *
 * Run vanuit v2-folder:
 *   npx tsx scripts/migrate-notes.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-notes.ts
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

  console.log("=== V1 Neon → V2 Convex notes ETL ===");
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

  const alreadyMigrated = await convex.query(api.migration.countMigratedNotes, {
    workspaceId,
  });
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} notes`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // v1 notes hangen aan contact_id OF opportunity_id (USER-DEFINED type-enum
  // "general"/"opportunity"/...). v2 vereist contactId — voor opportunity-
  // notes resolven we contact via de opp. Notes zonder beide worden geskipt.
  const { rows: notes } = await pool.query<NeonNoteRow>(
    `SELECT n.id, COALESCE(n.contact_id, o.contact_id) AS contact_id, n.content
       FROM notes n
       LEFT JOIN opportunities o ON o.id = n.opportunity_id
      WHERE n.workspace_id = $1
        AND COALESCE(n.contact_id, o.contact_id) IS NOT NULL
      ORDER BY n.id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${notes.length} notes gelezen uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 rows ge-transformeerd:");
    notes.slice(0, 3).forEach((n) => {
      console.log(JSON.stringify(transformNote(n), null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const startMs = Date.now();

  for (let i = 0; i < notes.length; i += BATCH_SIZE) {
    const batch = notes.slice(i, i + BATCH_SIZE);
    const docs = batch.map(transformNote);

    const result = await convex.mutation(api.migration.upsertNotesBatch, {
      workspaceId,
      docs,
    });

    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkipped += result.skippedNoContact;

    const progress = Math.min(i + BATCH_SIZE, notes.length);
    const pct = Math.round((progress / notes.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${notes.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated, ${totalSkipped} skipped`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ Notes-migratie klaar");
  console.log(`   Inserted: ${totalInserted}`);
  console.log(`   Updated:  ${totalUpdated}`);
  console.log(`   Skipped:  ${totalSkipped} (geen matching contact)`);
  console.log(`   Tijd:     ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonNoteRow {
  id: number;
  contact_id: number;
  content: string;
}

function transformNote(n: NeonNoteRow) {
  return {
    legacyId: n.id,
    legacyContactId: n.contact_id,
    body: n.content,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Notes-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
