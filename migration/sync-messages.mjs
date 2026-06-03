// Delta-sync van message_log (v1 Neon → v2 Convex dev), idempotent op legacyId.
// One-shot via ConvexHttpClient + pg (hangt NIET, anders dan de ConvexClient-scripts).
//   NEON_DATABASE_URL=<v1-url> node migration/sync-messages.mjs
import pg from "pg";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const NEON = process.env.NEON_DATABASE_URL;
const CONVEX_URL = "https://small-pony-380.eu-west-1.convex.cloud";
const WORKSPACE_ID = "rd77hrabmbahmmpnngmwmqhm0d86wqxa";
if (!NEON) { console.error("NEON_DATABASE_URL niet gezet"); process.exit(1); }

const STATUS_OK = ["pending", "sent", "delivered", "read", "failed", "bounced", "rate_limited"];
const STATUS_MAP = { queued: "pending", sending: "pending", undelivered: "failed" };
const mapStatus = (s) => (STATUS_OK.includes(s) ? s : (STATUS_MAP[s] ?? "sent"));
const ms = (v) => (v ? new Date(v).getTime() : undefined);
const str = (v) => (v === null || v === undefined || v === "" ? undefined : String(v));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const pool = new pg.Pool({ connectionString: NEON, ssl: { rejectUnauthorized: false } });
const client = new ConvexHttpClient(CONVEX_URL);
const fn = makeFunctionReference("migration:upsertMessageLogBatch");

// Alleen sms + whatsapp (geen email/messenger) — Marvin's keuze voor /messages.
const { rows } = await pool.query(
  "select * from message_log where workspace_id = 12 and channel in ('sms','whatsapp')",
);
console.log(`v1 message_log ws12 (sms+whatsapp): ${rows.length} rijen`);

const docs = rows.map((r) => clean({
  legacyId: Number(r.id),
  channel: r.channel, // sms | whatsapp | messenger
  direction: r.direction === "inbound" ? "inbound" : "outbound",
  status: mapStatus(r.status),
  externalMessageId: str(r.external_message_id) ?? str(r.twilio_sid),
  to: str(r.to_number) ?? "",
  from: str(r.from_number),
  body: r.body == null ? "" : String(r.body),
  mediaUrl: str(r.media_url),
  mediaType: str(r.media_type),
  templateVariables: r.template_variables ?? undefined,
  errorMessage: str(r.error_message),
  legacyContactId: r.contact_id != null ? Number(r.contact_id) : undefined,
  relatedEntityType: str(r.related_entity_type),
  relatedEntityId: r.related_entity_id != null ? String(r.related_entity_id) : undefined,
  metadata: r.metadata ?? undefined,
  sentAt: ms(r.sent_at),
}));

const SIZE = 100;
for (let i = 0; i < docs.length; i += SIZE) {
  await client.mutation(fn, { workspaceId: WORKSPACE_ID, docs: docs.slice(i, i + SIZE) });
  process.stdout.write(`\r  upsert: ${Math.min(i + SIZE, docs.length)}/${docs.length}`);
}
process.stdout.write("\n");
await pool.end();
console.log("klaar.");
