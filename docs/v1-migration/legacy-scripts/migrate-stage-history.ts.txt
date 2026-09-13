/**
 * Migrate opportunity stage history uit v1 Neon DB → v2 Convex.
 *
 * MOET ná migrate-opportunities draaien — opportunity-FK wordt
 * geresolved via by_legacyId op v2 opportunities.
 *
 * Idempotent via legacyId. Run:
 *   npx tsx scripts/migrate-stage-history.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-stage-history.ts
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

// Dezelfde mapping als migrate-opportunities — moet 1-op-1 zijn.
const STAGE_RENAME_MAP: Record<string, string> = {
  "nieuw": "Nieuwe lead",
  "1x gebeld": "Contact",
  "2x gebeld": "Contact",
  "3x gebeld": "Contact",
  "afspraak ingepland": "Voorstel",
};

function mapStageName(v1Name: string): string {
  return STAGE_RENAME_MAP[v1Name.toLowerCase()] ?? v1Name;
}

async function main() {
  // @ts-ignore - convex/_generated/api wordt door `npx convex dev` gegenereerd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex opportunityStageHistory ETL ===");
  console.log("DRY_RUN:", DRY_RUN);
  console.log("Target:", CONVEX_URL);
  console.log("");

  const convex = new ConvexClient(CONVEX_URL!);

  const workspaceId = await convex.query(api.migration.getStaycoolWorkspaceId, {});
  if (!workspaceId) {
    console.error("❌ Staycool workspace niet gevonden in Convex.");
    process.exit(1);
  }
  const pipelineData = await convex.query(
    api.migration.getStaycoolPipelineWithStages,
    { workspaceId },
  );
  if (!pipelineData) {
    console.error("❌ Geen default pipeline in Convex.");
    process.exit(1);
  }
  const stageByName = new Map<string, string>();
  for (const s of pipelineData.stages) {
    stageByName.set(s.name.toLowerCase(), s._id);
  }
  console.log("✓ V2 stages:", pipelineData.stages.map((s) => s.name).join(", "));

  const alreadyMigrated = await convex.query(api.migration.countMigratedStageHistory, {});
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} stage-history rows`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // JOIN op pipeline_stages voor stage-namen. opp moet workspace 12 zijn.
  const { rows: history } = await pool.query<NeonStageHistoryRow>(
    `SELECT h.id, h.opportunity_id,
            fs.name AS from_stage_name,
            ts.name AS to_stage_name
       FROM opportunity_stage_history h
       JOIN opportunities o ON o.id = h.opportunity_id
       LEFT JOIN pipeline_stages fs ON fs.id = h.from_stage_id
       JOIN pipeline_stages ts ON ts.id = h.to_stage_id
      WHERE o.workspace_id = $1
      ORDER BY h.id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${history.length} stage-history rows gelezen uit Neon`);

  const unknownStages = new Set<string>();
  for (const h of history) {
    if (h.from_stage_name) {
      const mapped = mapStageName(h.from_stage_name);
      if (!stageByName.has(mapped.toLowerCase())) {
        unknownStages.add(h.from_stage_name);
      }
    }
    const mappedTo = mapStageName(h.to_stage_name);
    if (!stageByName.has(mappedTo.toLowerCase())) {
      unknownStages.add(h.to_stage_name);
    }
  }
  if (unknownStages.size > 0) {
    console.log(
      `⚠ ${unknownStages.size} unbekende v1-stages: ` +
        Array.from(unknownStages).join(", ") +
        " — rijen met deze stages worden geskipt.",
    );
  }
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 rows ge-transformeerd:");
    history.slice(0, 3).forEach((h) => {
      console.log(JSON.stringify(transformStageHistory(h, stageByName), null, 2));
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkippedNoOpp = 0;
  let totalSkippedNoStage = 0;
  const startMs = Date.now();

  for (let i = 0; i < history.length; i += BATCH_SIZE) {
    const batch = history.slice(i, i + BATCH_SIZE);
    const docs: Array<NonNullable<ReturnType<typeof transformStageHistory>>> = [];
    for (const h of batch) {
      const doc = transformStageHistory(h, stageByName);
      if (doc === null) {
        totalSkippedNoStage++;
        continue;
      }
      docs.push(doc);
    }

    if (docs.length === 0) continue;

    const result = await convex.mutation(api.migration.upsertStageHistoryBatch, {
      docs,
    });

    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkippedNoOpp += result.skippedNoOpportunity;

    const progress = Math.min(i + BATCH_SIZE, history.length);
    const pct = Math.round((progress / history.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${history.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated, ` +
        `${totalSkippedNoOpp + totalSkippedNoStage} skipped`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ Stage-history-migratie klaar");
  console.log(`   Inserted:                  ${totalInserted}`);
  console.log(`   Updated:                   ${totalUpdated}`);
  console.log(`   Skipped (geen opportunity): ${totalSkippedNoOpp}`);
  console.log(`   Skipped (onbekende stage): ${totalSkippedNoStage}`);
  console.log(`   Tijd:                      ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonStageHistoryRow {
  id: number;
  opportunity_id: number;
  from_stage_name: string | null;
  to_stage_name: string;
}

function transformStageHistory(
  h: NeonStageHistoryRow,
  stageByName: Map<string, string>,
) {
  const toStageId = stageByName.get(mapStageName(h.to_stage_name).toLowerCase());
  if (!toStageId) return null;

  const fromStageId = h.from_stage_name
    ? stageByName.get(mapStageName(h.from_stage_name).toLowerCase())
    : undefined;

  return {
    legacyId: h.id,
    legacyOpportunityId: h.opportunity_id,
    fromStageId: fromStageId as never | undefined,
    toStageId: toStageId as never,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Stage-history-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
