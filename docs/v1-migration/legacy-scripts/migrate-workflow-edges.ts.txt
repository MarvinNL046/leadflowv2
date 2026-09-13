/**
 * Migrate Staycool v1 workflow_edges → v2 workflowEdges.
 *
 * v1's source_handle/target_handle gaan verloren — v2 schema heeft die
 * niet. branchLabel komt uit v1.label.
 *
 *   npx tsx scripts/migrate-workflow-edges.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-workflow-edges.ts
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

  console.log("=== V1 Neon → V2 Convex workflow_edges ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedWorkflowEdges,
    {},
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} edges`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: edges } = await pool.query<NeonWorkflowEdgeRow>(
    `SELECT e.id, e.workflow_id, e.source_node_id, e.target_node_id, e.label
       FROM workflow_edges e
       JOIN workflows w ON w.id = e.workflow_id
      WHERE w.workspace_id = $1
        AND w.deleted_at IS NULL
      ORDER BY e.id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${edges.length} workflow_edges gelezen uit Neon`);
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 edges ge-transformeerd:");
    edges.slice(0, 3).forEach((e) => {
      console.log(JSON.stringify(transformEdge(e), null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const startMs = Date.now();

  for (let i = 0; i < edges.length; i += BATCH_SIZE) {
    const batch = edges.slice(i, i + BATCH_SIZE);
    const docs = batch.map(transformEdge);
    const result = await convex.mutation(api.migration.upsertWorkflowEdgesBatch, {
      docs,
    });
    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkipped += result.skippedNoWorkflow;
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("✅ workflow_edges-migratie klaar");
  console.log(`   Inserted: ${totalInserted}`);
  console.log(`   Updated:  ${totalUpdated}`);
  console.log(`   Skipped:  ${totalSkipped} (geen workflow)`);
  console.log(`   Tijd:     ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonWorkflowEdgeRow {
  id: number;
  workflow_id: number;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
}

function transformEdge(e: NeonWorkflowEdgeRow) {
  return {
    legacyId: e.id,
    legacyWorkflowId: e.workflow_id,
    sourceNodeId: e.source_node_id,
    targetNodeId: e.target_node_id,
    branchLabel: e.label ?? undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ workflow_edges-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
