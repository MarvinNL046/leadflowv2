/**
 * Migrate alle Staycool contacts uit v1 Neon DB → v2 Convex.
 *
 * Idempotent via legacyContactId field in Convex contacts table.
 * Rerun = safe (existing rows worden gepatcht i.p.v. duplicate).
 *
 * Vereist env vars (zet in .env.migration of via shell):
 *   NEON_DATABASE_URL  - v1's productie Neon URL (kopie uit ~/claudeProjecten/wetryleadflow/.env.local)
 *   CONVEX_URL         - al gezet in v2's .env.local als VITE_CONVEX_URL
 *   CONVEX_DEPLOY_KEY  - genereer via `npx convex deploy-key generate`
 *
 * Run vanuit v2-folder:
 *   npx tsx scripts/migrate-contacts.ts
 *
 * Voor `--dry-run`: zet env DRY_RUN=1 om alleen counts te tonen zonder writes.
 */
import { config } from "dotenv";
import pg from "pg";
import { ConvexClient } from "convex/browser";

// Load .env.migration eerst (specifiek voor deze script), fallback .env.local
config({ path: ".env.migration" });
config({ path: ".env.local" });

const NEON_URL = process.env.NEON_DATABASE_URL;
const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = 100;

if (!NEON_URL) {
  console.error("❌ NEON_DATABASE_URL niet gezet.");
  console.error("   Tip: kopieer DATABASE_URL uit ~/claudeProjecten/wetryleadflow/.env.local");
  console.error("   naar .env.migration als NEON_DATABASE_URL.");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("❌ CONVEX_URL / VITE_CONVEX_URL niet gezet.");
  process.exit(1);
}

// NB: migration mutations zijn PUBLIEK (zonder auth-check) — zie
// convex/migration.ts header comment. Geen admin-key nodig. Na cutover
// moet convex/migration.ts verwijderd worden.

const STAYCOOL_WORKSPACE_ID_V1 = 12; // Per v1 audit

// We importeren api dynamisch via _generated om bij rerun de juiste functions
// te krijgen wanneer convex dev nog niet klaar was met types regen.
async function main() {
  // @ts-expect-error - convex/_generated/api wordt door `npx convex dev` gegenereerd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex contacts ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("Source:", new URL(NEON_URL.replace(/^postgres(ql)?:\/\//, "http://")).host);
  console.log("Target:", CONVEX_URL);
  console.log("");

  // ── Connect Convex ──
  const convex = new ConvexClient(CONVEX_URL);

  // ── Find Staycool workspace ──
  const workspaceId = await convex.query(api.migration.getStaycoolWorkspaceId, {});
  if (!workspaceId) {
    console.error("❌ Staycool workspace niet gevonden in Convex.");
    console.error("   Log eerst in op /login als super-admin om de bootstrap te triggeren.");
    process.exit(1);
  }
  console.log("✓ Target workspace:", workspaceId);

  const alreadyMigrated = await convex.query(api.migration.countMigratedContacts, {
    workspaceId,
  });
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} contacts (worden gepatcht bij rerun)`);
  console.log("");

  // ── Read Neon ──
  const pool = new pg.Pool({
    connectionString: NEON_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: contacts } = await pool.query<NeonContactRow>(
    `SELECT id, first_name, last_name, email, phone, company, position,
            street, house_number, house_number_addition, postal_code, city,
            province, country, messenger_psid, messenger_page_id,
            call_count, last_call_at, last_call_result, next_follow_up_at,
            tags, outside_area, external_id
       FROM contacts
      WHERE workspace_id = $1
      ORDER BY id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${contacts.length} contacts gelezen uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 rows ge-transformeerd (geen writes):");
    contacts.slice(0, 3).forEach((c) => {
      console.log(JSON.stringify(transformContact(c), null, 2));
    });
    await pool.end();
    return;
  }

  // ── Batch upsert ──
  let totalInserted = 0;
  let totalUpdated = 0;
  const startMs = Date.now();

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const docs = batch.map(transformContact);

    const result = await convex.mutation(api.migration.upsertContactsBatch, {
      workspaceId,
      docs,
    });

    totalInserted += result.inserted;
    totalUpdated += result.updated;

    const progress = Math.min(i + BATCH_SIZE, contacts.length);
    const pct = Math.round((progress / contacts.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${contacts.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ Migratie klaar");
  console.log(`   Inserted: ${totalInserted}`);
  console.log(`   Updated:  ${totalUpdated}`);
  console.log(`   Tijd:     ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonContactRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  street: string | null;
  house_number: string | null;
  house_number_addition: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  messenger_psid: string | null;
  messenger_page_id: string | null;
  call_count: number | null;
  last_call_at: Date | null;
  last_call_result: string | null;
  next_follow_up_at: Date | null;
  tags: string | null;
  outside_area: boolean | null;
  external_id: string | null;
}

function transformContact(c: NeonContactRow) {
  return {
    legacyContactId: c.id,
    firstName: c.first_name ?? undefined,
    lastName: c.last_name ?? undefined,
    email: c.email?.toLowerCase().trim() ?? undefined,
    phone: c.phone?.trim() ?? undefined,
    company: c.company ?? undefined,
    position: c.position ?? undefined,
    street: c.street ?? undefined,
    houseNumber: c.house_number ?? undefined,
    houseNumberAddition: c.house_number_addition ?? undefined,
    postalCode: c.postal_code ?? undefined,
    city: c.city ?? undefined,
    province: c.province ?? undefined,
    country: c.country ?? undefined,
    messengerPsid: c.messenger_psid ?? undefined,
    messengerPageId: c.messenger_page_id ?? undefined,
    callCount: c.call_count ?? 0,
    lastCallAt: c.last_call_at ? new Date(c.last_call_at).getTime() : undefined,
    lastCallResult: c.last_call_result ?? undefined,
    nextFollowUpAt: c.next_follow_up_at
      ? new Date(c.next_follow_up_at).getTime()
      : undefined,
    tags: c.tags
      ? c.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
    outsideArea: c.outside_area ?? undefined,
    externalId: c.external_id ?? undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Migratie gefaald:");
  console.error(err);
  process.exit(1);
});
