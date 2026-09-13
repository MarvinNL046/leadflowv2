/**
 * Migrate Staycool opportunities uit v1 Neon DB → v2 Convex.
 *
 * Stage-mapping: v1 stage-naam → v2 stageId via name-match.
 * Voor stages die in v1 wel bestaan maar niet in v2 (na rename) skippen
 * we de opportunity met een teller — handmatig fixen post-cutover.
 *
 * Idempotent via legacyId. Run vanuit v2-folder:
 *   npx tsx scripts/migrate-opportunities.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-opportunities.ts
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

// v2 heeft nu exact dezelfde 7-staps belfunnel als v1 (Marvin's keuze 2026-06-03:
// de 1x/2x/3x-Gebeld-granulariteit blijft een aparte kolom, niet samengevouwen).
// Stage-namen zijn 1-op-1, dus geen rename meer nodig — name-match volstaat.
const STAGE_RENAME_MAP: Record<string, string> = {};

function mapStageName(v1Name: string): string {
  return STAGE_RENAME_MAP[v1Name.toLowerCase()] ?? v1Name;
}

async function main() {
  // @ts-ignore - convex/_generated/api wordt door `npx convex dev` gegenereerd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex opportunities ETL ===");
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

  const pipelineData = await convex.query(
    api.migration.getStaycoolPipelineWithStages,
    { workspaceId },
  );
  if (!pipelineData) {
    console.error("❌ Geen default pipeline in Convex (seed eerst).");
    process.exit(1);
  }
  const stageByName = new Map<string, string>();
  for (const s of pipelineData.stages) {
    stageByName.set(s.name.toLowerCase(), s._id);
  }
  console.log(
    `✓ V2 pipeline ${pipelineData.pipelineId} met ${pipelineData.stages.length} stages: ` +
      pipelineData.stages.map((s) => s.name).join(", "),
  );

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedOpportunities,
    { workspaceId },
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} opportunities`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // v1 heeft geen closed_at/closed_reason/description kolommen — die zijn
  // v2-only en blijven undefined. lead_source mappen we naar v2.description
  // zodat ad-source-info niet verloren gaat. Skip soft-deleted rows.
  const { rows: opps } = await pool.query<NeonOpportunityRow>(
    `SELECT o.id, o.contact_id, o.title,
            o.value, o.currency, o.expected_close_date,
            o.lead_source,
            ps.name AS stage_name
       FROM opportunities o
       JOIN pipeline_stages ps ON ps.id = o.stage_id
      WHERE o.workspace_id = $1
        AND o.deleted_at IS NULL
        AND o.contact_id IS NOT NULL
      ORDER BY o.id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${opps.length} opportunities gelezen uit Neon`);

  // Stage-mapping check via rename-map + v2 stage-list
  const unknownStages = new Set<string>();
  for (const o of opps) {
    const mapped = mapStageName(o.stage_name);
    if (!stageByName.has(mapped.toLowerCase())) {
      unknownStages.add(o.stage_name);
    }
  }
  if (unknownStages.size > 0) {
    console.log(
      `⚠ ${unknownStages.size} v1-stages hebben geen v2-naammatch: ` +
        Array.from(unknownStages).join(", "),
    );
    console.log("   → die opps worden geskipt. Hernoem v2-stages of fix v1-data.");
  }
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 rows ge-transformeerd:");
    opps.slice(0, 3).forEach((o) => {
      console.log(
        JSON.stringify(transformOpportunity(o, pipelineData, stageByName), null, 2),
      );
    });
    await pool.end();
    return;
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkippedNoContact = 0;
  let totalSkippedNoStage = 0;
  const startMs = Date.now();

  for (let i = 0; i < opps.length; i += BATCH_SIZE) {
    const batch = opps.slice(i, i + BATCH_SIZE);
    const docs: Array<NonNullable<ReturnType<typeof transformOpportunity>>> = [];
    for (const o of batch) {
      const doc = transformOpportunity(o, pipelineData, stageByName);
      if (doc === null) {
        totalSkippedNoStage++;
        continue;
      }
      docs.push(doc);
    }

    if (docs.length === 0) continue;

    const result = await convex.mutation(api.migration.upsertOpportunitiesBatch, {
      workspaceId,
      docs,
    });

    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkippedNoContact += result.skippedNoContact;

    const progress = Math.min(i + BATCH_SIZE, opps.length);
    const pct = Math.round((progress / opps.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${opps.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated, ` +
        `${totalSkippedNoContact + totalSkippedNoStage} skipped`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ Opportunities-migratie klaar");
  console.log(`   Inserted:           ${totalInserted}`);
  console.log(`   Updated:            ${totalUpdated}`);
  console.log(`   Skipped (geen contact): ${totalSkippedNoContact}`);
  console.log(`   Skipped (geen stage):   ${totalSkippedNoStage}`);
  console.log(`   Tijd:               ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonOpportunityRow {
  id: number;
  contact_id: number;
  title: string;
  value: string | number | null;
  currency: string | null;
  expected_close_date: Date | null;
  lead_source: string | null;
  stage_name: string;
}

interface PipelineData {
  pipelineId: string;
  stages: Array<{
    _id: string;
    name: string;
    order: number;
    isWonStage: boolean;
    isLostStage: boolean;
  }>;
}

function transformOpportunity(
  o: NeonOpportunityRow,
  pipeline: PipelineData,
  stageByName: Map<string, string>,
) {
  const mapped = mapStageName(o.stage_name);
  const stageId = stageByName.get(mapped.toLowerCase());
  if (!stageId) return null;

  const value =
    o.value === null || o.value === undefined
      ? undefined
      : typeof o.value === "string"
        ? parseFloat(o.value)
        : o.value;

  return {
    legacyId: o.id,
    legacyContactId: o.contact_id,
    stageId: stageId as never,
    pipelineId: pipeline.pipelineId as never,
    title: o.title,
    value,
    currency: o.currency ?? undefined,
    expectedCloseDate: o.expected_close_date
      ? new Date(o.expected_close_date).getTime()
      : undefined,
    closedAt: undefined,
    closedReason: undefined,
    description: o.lead_source ?? undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ Opportunities-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
