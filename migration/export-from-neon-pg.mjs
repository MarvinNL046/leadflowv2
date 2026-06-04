// Neon (v1) → JSONL export via `pg` (werkt vanuit leadflowv2; de
// @neondatabase/serverless-variant resolve't alleen vanuit de v1-repo).
// READ-ONLY. Leest DATABASE_URL uit env, of uit ../wetryleadflow/.env.local.
// Output: migration/data/*.jsonl (gitignored — PII).
//   node migration/export-from-neon-pg.mjs
import pg from "pg";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const WORKSPACE_ID = 12;
const OUT = "/home/marvin/Projecten/leadflowv2/migration/data";
mkdirSync(OUT, { recursive: true });

let url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!url) {
  const env = readFileSync("/home/marvin/Projecten/wetryleadflow/.env.local", "utf8");
  const m = env.match(/^DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?/m);
  if (!m) { console.error("DATABASE_URL niet gevonden"); process.exit(1); }
  url = m[1];
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

function writeJsonl(name, rows) {
  const path = `${OUT}/${name}.jsonl`;
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  console.log(`${name.padEnd(22)} ${rows.length} rijen → ${path}`);
}

const { rows: pipelines } = await pool.query("select * from pipelines where workspace_id = $1", [WORKSPACE_ID]);
writeJsonl("pipelines", pipelines);

const pipelineIds = pipelines.map((p) => p.id);
const { rows: stages } = pipelineIds.length
  ? await pool.query('select * from pipeline_stages where pipeline_id = any($1) order by "order"', [pipelineIds])
  : { rows: [] };
writeJsonl("pipeline_stages", stages);

const { rows: contacts } = await pool.query("select * from contacts where workspace_id = $1", [WORKSPACE_ID]);
writeJsonl("contacts", contacts);

const { rows: opportunities } = await pool.query("select * from opportunities where workspace_id = $1", [WORKSPACE_ID]);
writeJsonl("opportunities", opportunities);

await pool.end();
console.log("\nklaar.");
