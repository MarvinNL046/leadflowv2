/**
 * Migrate Staycool v1 workflow_nodes → v2 workflowNodes.
 *
 * MOET ná migrate-workflows draaien — workflowId-FK via by_legacyId.
 *
 *   npx tsx scripts/migrate-workflow-nodes.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-workflow-nodes.ts
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

const ALLOWED_TYPES = new Set(["trigger", "action", "condition", "delay"] as const);
type AllowedType = "trigger" | "action" | "condition" | "delay";

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

  console.log("=== V1 Neon → V2 Convex workflow_nodes ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedWorkflowNodes,
    {},
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} nodes`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // Join op workflows om Staycool-scope te filteren en deleted te skippen.
  const { rows: nodes } = await pool.query<NeonWorkflowNodeRow>(
    `SELECT n.id, n.workflow_id, n.node_id, n.type, n.sub_type,
            n.position_x, n.position_y, n.config, n.label
       FROM workflow_nodes n
       JOIN workflows w ON w.id = n.workflow_id
      WHERE w.workspace_id = $1
        AND w.deleted_at IS NULL
      ORDER BY n.id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${nodes.length} workflow_nodes gelezen uit Neon`);

  const unknownTypes = new Set<string>();
  for (const n of nodes) {
    if (!ALLOWED_TYPES.has(n.type as AllowedType)) unknownTypes.add(n.type);
  }
  if (unknownTypes.size > 0) {
    console.log(`⚠ Onbekende node-types geskipt: ${Array.from(unknownTypes).join(", ")}`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 nodes ge-transformeerd:");
    let printed = 0;
    for (const n of nodes) {
      const doc = transformNode(n);
      if (doc === null) continue;
      console.log(JSON.stringify(doc, null, 2));
      printed++;
      if (printed >= 3) break;
    }
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkippedWorkflow = 0;
  let totalSkippedType = 0;
  const startMs = Date.now();

  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    const docs: Array<NonNullable<ReturnType<typeof transformNode>>> = [];
    for (const n of batch) {
      const doc = transformNode(n);
      if (doc === null) {
        totalSkippedType++;
        continue;
      }
      docs.push(doc);
    }
    if (docs.length === 0) continue;

    const result = await convex.mutation(api.migration.upsertWorkflowNodesBatch, {
      docs,
    });
    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkippedWorkflow += result.skippedNoWorkflow;
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("✅ workflow_nodes-migratie klaar");
  console.log(`   Inserted:                ${totalInserted}`);
  console.log(`   Updated:                 ${totalUpdated}`);
  console.log(`   Skipped (geen workflow): ${totalSkippedWorkflow}`);
  console.log(`   Skipped (onbekend type): ${totalSkippedType}`);
  console.log(`   Tijd:                    ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonWorkflowNodeRow {
  id: number;
  workflow_id: number;
  node_id: string;
  type: string;
  sub_type: string | null;
  position_x: string | number;
  position_y: string | number;
  config: unknown;
  label: string | null;
}

function transformNode(n: NeonWorkflowNodeRow) {
  if (!ALLOWED_TYPES.has(n.type as AllowedType)) return null;
  return {
    legacyId: n.id,
    legacyWorkflowId: n.workflow_id,
    nodeId: n.node_id,
    type: n.type as AllowedType,
    subType: n.sub_type ?? undefined,
    positionX: typeof n.position_x === "string" ? parseFloat(n.position_x) : n.position_x,
    positionY: typeof n.position_y === "string" ? parseFloat(n.position_y) : n.position_y,
    config: n.config ?? {},
    label: n.label ?? undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ workflow_nodes-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
