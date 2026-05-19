/**
 * Migrate Staycool v1 message_log → v2 messages (channel sms/wa/messenger).
 *
 * Email-channels (van v1 message_log) worden geskipt — Marvin's keuze:
 * email-stack blijft in Gmail i.p.v. v2. workspace_id IS NULL rows worden
 * door SQL gefilterd. Onbekende channels/statussen krijgen skip-counter.
 *
 *   npx tsx scripts/migrate-message-log.ts
 *   DRY_RUN=1 npx tsx scripts/migrate-message-log.ts
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

const ALLOWED_CHANNELS = new Set(["sms", "whatsapp", "messenger"] as const);
type AllowedChannel = "sms" | "whatsapp" | "messenger";

const ALLOWED_STATUSES = new Set([
  "pending",
  "sent",
  "delivered",
  "read",
  "failed",
  "bounced",
  "rate_limited",
] as const);
type AllowedStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "bounced"
  | "rate_limited";

if (!NEON_URL) {
  console.error("❌ NEON_DATABASE_URL niet gezet (zie .env.migration).");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("❌ CONVEX_URL / VITE_CONVEX_URL niet gezet.");
  process.exit(1);
}

async function main() {
  // @ts-ignore - convex/_generated/api wordt door `npx convex dev` gegenereerd
  const { api } = await import("../convex/_generated/api.js");

  console.log("=== V1 Neon → V2 Convex message_log ETL ===");
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

  const alreadyMigrated = await convex.query(
    api.migration.countMigratedMessageLog,
    { workspaceId },
  );
  console.log(`✓ Al gemigreerd: ${alreadyMigrated} message_log rows`);
  console.log("");

  const pool = new pg.Pool({
    connectionString: NEON_URL!,
    ssl: { rejectUnauthorized: false },
  });

  const { rows: messages } = await pool.query<NeonMessageLogRow>(
    `SELECT id, channel, to_number, from_number, body, template_variables,
            status, twilio_sid, external_message_id, error_message,
            sent_at, delivered_at, read_at, contact_id,
            related_entity_type, related_entity_id, metadata, direction,
            media_url, media_type
       FROM message_log
      WHERE workspace_id = $1
      ORDER BY id`,
    [STAYCOOL_WORKSPACE_ID_V1],
  );

  console.log(`✓ ${messages.length} message_log rows gelezen uit Neon`);

  const unknownChannels = new Set<string>();
  const unknownStatuses = new Set<string>();
  for (const m of messages) {
    if (!ALLOWED_CHANNELS.has(m.channel as AllowedChannel)) {
      unknownChannels.add(m.channel);
    }
    if (!ALLOWED_STATUSES.has(m.status as AllowedStatus)) {
      unknownStatuses.add(m.status);
    }
  }
  if (unknownChannels.size > 0) {
    console.log(
      `⚠ Onbekende channels (worden geskipt): ${Array.from(unknownChannels).join(", ")}`,
    );
  }
  if (unknownStatuses.size > 0) {
    console.log(
      `⚠ Onbekende statussen (worden geskipt): ${Array.from(unknownStatuses).join(", ")}`,
    );
  }
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY_RUN: eerste 3 rows ge-transformeerd:");
    let printed = 0;
    for (const m of messages) {
      const doc = transformMessage(m);
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
  let totalSkipped = 0;
  const startMs = Date.now();

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const docs: Array<NonNullable<ReturnType<typeof transformMessage>>> = [];
    for (const m of batch) {
      const doc = transformMessage(m);
      if (doc === null) {
        totalSkipped++;
        continue;
      }
      docs.push(doc);
    }

    if (docs.length === 0) continue;

    const result = await convex.mutation(api.migration.upsertMessageLogBatch, {
      workspaceId,
      docs,
    });

    totalInserted += result.inserted;
    totalUpdated += result.updated;

    const progress = Math.min(i + BATCH_SIZE, messages.length);
    const pct = Math.round((progress / messages.length) * 100);
    process.stdout.write(
      `\r  ${progress}/${messages.length} (${pct}%) — ` +
        `+${totalInserted} new, ~${totalUpdated} updated, ${totalSkipped} skipped`,
    );
  }

  const elapsedSec = Math.round((Date.now() - startMs) / 1000);
  console.log("");
  console.log("");
  console.log("✅ message_log-migratie klaar");
  console.log(`   Inserted: ${totalInserted}`);
  console.log(`   Updated:  ${totalUpdated}`);
  console.log(`   Skipped:  ${totalSkipped} (channel/status onbekend)`);
  console.log(`   Tijd:     ${elapsedSec}s`);

  await pool.end();
  await convex.close();
}

interface NeonMessageLogRow {
  id: number;
  channel: string;
  to_number: string | null;
  from_number: string | null;
  body: string | null;
  template_variables: unknown;
  status: string;
  twilio_sid: string | null;
  external_message_id: string | null;
  error_message: string | null;
  sent_at: Date | null;
  delivered_at: Date | null;
  read_at: Date | null;
  contact_id: number | null;
  related_entity_type: string | null;
  related_entity_id: number | null;
  metadata: unknown;
  direction: string;
  media_url: string | null;
  media_type: string | null;
}

function transformMessage(m: NeonMessageLogRow) {
  if (!ALLOWED_CHANNELS.has(m.channel as AllowedChannel)) return null;
  // v1 had "queued" als status — semantisch gelijk aan v2's "pending".
  const status = m.status === "queued" ? "pending" : m.status;
  if (!ALLOWED_STATUSES.has(status as AllowedStatus)) return null;
  if (m.direction !== "outbound" && m.direction !== "inbound") return null;
  if (!m.to_number || !m.body) return null;

  return {
    legacyId: m.id,
    channel: m.channel as AllowedChannel,
    direction: m.direction as "outbound" | "inbound",
    status: status as AllowedStatus,
    externalMessageId: m.twilio_sid ?? m.external_message_id ?? undefined,
    to: m.to_number,
    from: m.from_number ?? undefined,
    body: m.body,
    mediaUrl: m.media_url ?? undefined,
    mediaType: m.media_type ?? undefined,
    templateVariables: m.template_variables ?? undefined,
    errorMessage: m.error_message ?? undefined,
    legacyContactId: m.contact_id ?? undefined,
    relatedEntityType: m.related_entity_type ?? undefined,
    relatedEntityId:
      m.related_entity_id !== null ? String(m.related_entity_id) : undefined,
    metadata: m.metadata ?? undefined,
    sentAt: m.sent_at ? new Date(m.sent_at).getTime() : undefined,
    deliveredAt: m.delivered_at
      ? new Date(m.delivered_at).getTime()
      : undefined,
    readAt: m.read_at ? new Date(m.read_at).getTime() : undefined,
  };
}

main().catch((err) => {
  console.error("");
  console.error("❌ message_log-migratie gefaald:");
  console.error(err);
  process.exit(1);
});
