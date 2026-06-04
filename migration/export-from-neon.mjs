// Neon (v1) → JSONL export voor de Convex-migratie.
// Exporteert alleen workspace 12 (StayCool): contacten + pipeline + stages + opportunities.
// READ-ONLY op de oude DB. Output: migration/data/*.jsonl (gitignored — bevat PII).
//
// Draai vanuit de wetryleadflow-repo (heeft @neondatabase/serverless + DATABASE_URL):
//   cd ~/Projecten/wetryleadflow
//   node --env-file=.env.local ~/Projecten/leadflowv2/migration/export-from-neon.mjs

import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";

const WORKSPACE_ID = 12;
const OUT = "/home/marvin/Projecten/leadflowv2/migration/data";
mkdirSync(OUT, { recursive: true });

const sql = neon(process.env.DATABASE_URL);

function writeJsonl(name, rows) {
  const path = `${OUT}/${name}.jsonl`;
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  console.log(`${name.padEnd(22)} ${rows.length} rijen → ${path}`);
}

const main = async () => {
  const pipelines = await sql`select * from pipelines where workspace_id = ${WORKSPACE_ID}`;
  writeJsonl("pipelines", pipelines);

  const pipelineIds = pipelines.map((p) => p.id);
  const stages = pipelineIds.length
    ? await sql`select * from pipeline_stages where pipeline_id = any(${pipelineIds}) order by "order"`
    : [];
  writeJsonl("pipeline_stages", stages);

  const contacts = await sql`select * from contacts where workspace_id = ${WORKSPACE_ID}`;
  writeJsonl("contacts", contacts);

  const opportunities = await sql`select * from opportunities where workspace_id = ${WORKSPACE_ID}`;
  writeJsonl("opportunities", opportunities);

  console.log("\nKolommen contacts:", contacts.length ? Object.keys(contacts[0]).join(", ") : "(geen)");
  console.log("Kolommen opportunities:", opportunities.length ? Object.keys(opportunities[0]).join(", ") : "(geen)");
};

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
