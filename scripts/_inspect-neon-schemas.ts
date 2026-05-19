/**
 * Wegwerp-introspect: print kolommen van de 5 tabellen die we migreren,
 * plus een sample row. Helpt bij het fixen van column-name-aannames.
 *
 *   npx tsx scripts/_inspect-neon-schemas.ts
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.migration" });
config({ path: ".env.local" });

const NEON_URL = process.env.NEON_DATABASE_URL;
if (!NEON_URL) {
  console.error("❌ NEON_DATABASE_URL niet gezet");
  process.exit(1);
}

const TABLES = [
  // Messaging stack
  "email_threads",
  "email_messages",
  "email_log",
  "message_log",
  "email_templates",
  "email_connections",
  // Workflows family
  "workflows",
  "workflow_nodes",
  "workflow_edges",
  // Notifications
  "notifications",
];

async function main() {
  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  for (const table of TABLES) {
    console.log(`\n=== ${table} ===`);
    const cols = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position`,
      [table],
    );
    if (cols.rows.length === 0) {
      console.log("  (tabel niet gevonden)");
      continue;
    }
    cols.rows.forEach((c) => {
      console.log(`  ${c.column_name.padEnd(36)} ${c.data_type}`);
    });

    const sample = await pool.query(`SELECT * FROM ${table} LIMIT 1`);
    if (sample.rows.length > 0) {
      console.log("  sample row:");
      console.log("  " + JSON.stringify(sample.rows[0]).slice(0, 400));
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
