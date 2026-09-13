/**
 * Migrate Staycool v1 notifications → v2 notifications.
 *
 * V1 user_id (integer) wordt door alle naar v2's super-admin userId
 * gemapt — Marvin is enige actieve user in v1 én v2. Notifications met
 * user_id=null in v1 worden geskipt (SQL filter).
 *
 *   npx tsx scripts/migrate-notifications.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-notifications.ts
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

  console.log("=== V1 Neon → V2 Convex notifications ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const workspaceId = await convex.query(api.migration.getStaycoolWorkspaceId, {});
  if (!workspaceId) {
    console.error("❌ Staycool workspace niet gevonden.");
    process.exit(1);
  }
  const userId = await convex.query(api.migration.getSuperAdminUserId, {});
  if (!userId) {
    console.error("❌ Super-admin user niet gevonden — log eerst in.");
    process.exit(1);
  }
  console.log("✓ Target workspace:", workspaceId);
  console.log("✓ Target userId (super-admin):", userId);

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedNotifications,
    { workspaceId },
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} notifications`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: notifications } = await pool.query<NeonNotificationRow>(
    `SELECT id, type, title, message, entity_type, entity_id,
            action_url, is_read
       FROM notifications
      WHERE workspace_id = $1
        AND user_id IS NOT NULL
      ORDER BY id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${notifications.length} notifications gelezen uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 notifications:");
    notifications.slice(0, 3).forEach((n) => {
      console.log(JSON.stringify(transformNotification(n), null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  const startMs = Date.now();

  for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
    const batch = notifications.slice(i, i + BATCH_SIZE);
    const docs = batch.map(transformNotification);
    const result = await convex.mutation(
      api.migration.upsertNotificationsBatch,
      { workspaceId, userId, docs },
    );
    totalInserted += result.inserted;
    totalUpdated += result.updated;

    const progress = Math.min(i + BATCH_SIZE, notifications.length);
    const pct = Math.round((progress / notifications.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${notifications.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ Notifications-migratie klaar");
  console.log(`   Inserted: ${totalInserted}`);
  console.log(`   Updated:  ${totalUpdated}`);
  console.log(`   Tijd:     ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonNotificationRow {
  id: number;
  type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: number | null;
  action_url: string | null;
  is_read: boolean;
}

function transformNotification(n: NeonNotificationRow) {
  return {
    legacyId: n.id,
    type: n.type,
    title: n.title,
    body: n.message ?? undefined,
    actionUrl: n.action_url ?? undefined,
    relatedEntityType: n.entity_type ?? undefined,
    relatedEntityId: n.entity_id !== null ? String(n.entity_id) : undefined,
    isRead: n.is_read,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Notifications-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
