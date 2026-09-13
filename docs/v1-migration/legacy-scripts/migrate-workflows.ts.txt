/**
 * Migrate Staycool v1 workflows → v2 workflows.
 *
 * Skip soft-deleted (deleted_at IS NOT NULL). trigger_config jsonb wordt
 * naar v2 array<{type,nodeId}> getransformeerd; null/missing → [].
 * last_edited_by_id wordt undefined (geen v1→Convex Auth user-mapping).
 *
 *   npx tsx scripts/migrate-workflows.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-workflows.ts
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

const ALLOWED_STATUSES = new Set([
  "draft",
  "active",
  "paused",
  "archived",
] as const);
type AllowedStatus = "draft" | "active" | "paused" | "archived";

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

  console.log("=== V1 Neon → V2 Convex workflows ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const workspaceId = await convex.query(api.migration.getStaycoolWorkspaceId, {});
  if (!workspaceId) {
    console.error("❌ Staycool workspace niet gevonden.");
    process.exit(1);
  }

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedWorkflows,
    { workspaceId },
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} workflows`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: workflows } = await pool.query<NeonWorkflowRow>(
    `SELECT id, name, description, status, trigger_config, version,
            total_executions, successful_executions, failed_executions,
            last_executed_at
       FROM workflows
      WHERE workspace_id = $1
        AND deleted_at IS NULL
      ORDER BY id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${workflows.length} actieve workflows gelezen uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: alle workflows ge-transformeerd:");
    workflows.forEach((w) => {
      const doc = transformWorkflow(w);
      if (doc) console.log(JSON.stringify(doc, null, 2));
    });
    await pool.end();
    return;
  }

  const docs = workflows
    .map(transformWorkflow)
    .filter((w): w is NonNullable<typeof w> => w !== null);

  const result = await convex.mutation(api.migration.upsertWorkflowsBatch, {
    workspaceId,
    docs,
  });

  console.log("✅ Workflows-migratie klaar");
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Updated:  ${result.updated}`);

  await pool.end();
  await convex.close();
}

interface NeonWorkflowRow {
  id: number;
  name: string;
  description: string | null;
  status: string;
  trigger_config: unknown;
  version: number;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  last_executed_at: Date | null;
}

function transformWorkflow(w: NeonWorkflowRow) {
  if (!ALLOWED_STATUSES.has(w.status as AllowedStatus)) return null;

  // trigger_config jsonb: v1 had varied shapes. v2 verwacht array of
  // {type, nodeId}. Als jsonb een array is met die shape: gebruik. Anders [].
  let triggerConfig: Array<{ type: string; nodeId: string }> = [];
  if (Array.isArray(w.trigger_config)) {
    triggerConfig = (w.trigger_config as Array<unknown>)
      .map((t) => {
        if (
          t &&
          typeof t === "object" &&
          "type" in t &&
          "nodeId" in t &&
          typeof (t as Record<string, unknown>).type === "string" &&
          typeof (t as Record<string, unknown>).nodeId === "string"
        ) {
          return {
            type: (t as Record<string, string>).type,
            nodeId: (t as Record<string, string>).nodeId,
          };
        }
        return null;
      })
      .filter((t): t is { type: string; nodeId: string } => t !== null);
  }

  return {
    legacyId: w.id,
    name: w.name,
    description: w.description ?? undefined,
    status: w.status as AllowedStatus,
    triggerConfig,
    version: w.version,
    totalExecutions: w.total_executions,
    successfulExecutions: w.successful_executions,
    failedExecutions: w.failed_executions,
    lastExecutedAt: w.last_executed_at
      ? new Date(w.last_executed_at).getTime()
      : undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Workflows-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
