/**
 * Migrate Staycool email_templates → v2 emailTemplates.
 *
 *   npx tsx scripts/migrate-email-templates.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-email-templates.ts
 */
import { config } from "dotenv";
import pg from "pg";
import { ConvexClient } from "convex/browser";

config({ path: ".env.migration" });
config({ path: ".env.local" });

const NEON_URL = process.env.NEON_DATABASE_URL;
const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
const DRY_RUN = process.env.DRY_RUN === "1";
const STAYCOOL_WORKSPACE_ID_V1 = 12;

if (!NEON_URL) {
  console.error("❌ NEON_DATABASE_URL niet gezet.");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("❌ CONVEX_URL niet gezet.");
  process.exit(1);
}

async function main() {
  // @ts-ignore - convex/_generated/api wordt door `npx convex dev` gegenereerd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex email_templates ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const workspaceId = await convex.query(api.migration.getStaycoolWorkspaceId, {});
  if (!workspaceId) {
    console.error("❌ Staycool workspace niet gevonden.");
    process.exit(1);
  }

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedEmailTemplates,
    { workspaceId },
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} templates`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // body_html is de canonieke versie — v2 schema heeft alleen `body`.
  // system_key gaat naar description voor traceability.
  const { rows: templates } = await pool.query<NeonEmailTemplateRow>(
    `SELECT id, name, type, subject, body_html, system_key
       FROM email_templates
      WHERE workspace_id = $1
        AND is_active = true
      ORDER BY id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${templates.length} actieve templates gelezen uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: alle templates ge-transformeerd:");
    templates.forEach((t) => {
      const doc = transformTemplate(t);
      // body afkappen voor leesbaarheid
      console.log(JSON.stringify({ ...doc, body: doc.body.slice(0, 120) + "..." }, null, 2));
    });
    await pool.end();
    return;
  }

  const docs = templates.map(transformTemplate);
  const result = await convex.mutation(
    api.migration.upsertEmailTemplatesBatch,
    { workspaceId, docs },
  );

  console.log("✅ Templates-migratie klaar");
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Updated:  ${result.updated}`);

  await pool.end();
  await convex.close();
}

interface NeonEmailTemplateRow {
  id: number;
  name: string;
  type: string;
  subject: string;
  body_html: string;
  system_key: string | null;
}

function transformTemplate(t: NeonEmailTemplateRow) {
  return {
    legacyId: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body_html,
    description: t.system_key ?? undefined,
    isSystem: t.type === "system",
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Templates-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
