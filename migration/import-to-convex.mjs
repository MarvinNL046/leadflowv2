// v1 Neon JSONL → Convex (small-pony-380) import.
// Roept v2's eigen migration:upsert*Batch-mutations aan (idempotent op legacyId/legacyContactId).
// Geen deploy nodig. Draai vanuit leadflowv2 (convex-module resolve):
//   node migration/import-to-convex.mjs --only contacts --limit 10   # droogtest
//   node migration/import-to-convex.mjs --only contacts              # alle contacten
//   node migration/import-to-convex.mjs --only opportunities         # daarna opps
//   node migration/import-to-convex.mjs                              # alles (contacten dan opps)

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFileSync } from "node:fs";

const URL = "https://small-pony-380.eu-west-1.convex.cloud";
const WORKSPACE_ID = "rd77hrabmbahmmpnngmwmqhm0d86wqxa";
const PIPELINE_ID = "ph72gycgd435eza1x4p0sxfh7x86zf7f";
const NIEUWE_LEAD = "pd77fcnt1e51jgtrv3h9khswcs86za1p"; // "Nieuw" (order 0)
// oude stage_id → v2 stageId — 1-op-1 naar de 7-staps v1-flow
const STAGE = {
  49: "pd77fcnt1e51jgtrv3h9khswcs86za1p",       // Nieuw
  50: "pd7aptyd61pakh6ness144krcs87yyww",       // 1x Gebeld
  51: "pd75b7v206a1df8ncbct1r8wp587yb4n",       // 2x Gebeld
  52: "pd79jxsawfmzkgsg06m1ywr1ts87zn2b",       // 3x Gebeld
  56: "pd70pcm89gpqnyam54gf90938h87zymj",       // Afspraak ingepland
  53: "pd79j5fs9pndarw8jcr7w0w9sx86zek6",       // Gewonnen
  54: "pd79w680wfw8v6jafxr0vf6q0586ymtz",       // Verloren
};

const DATA = "/home/marvin/Projecten/leadflowv2/migration/data";
const client = new ConvexHttpClient(URL);
const fnContacts = makeFunctionReference("migration:upsertContactsBatch");
const fnOpps = makeFunctionReference("migration:upsertOpportunitiesBatch");

const ms = (v) => { if (!v) return undefined; const t = Date.parse(v); return Number.isFinite(t) ? t : undefined; };
const str = (v) => (v === null || v === undefined || v === "") ? undefined : String(v);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const readJsonl = (name) => readFileSync(`${DATA}/${name}.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const mapContact = (r) => clean({
  legacyContactId: Number(r.id),
  firstName: str(r.first_name), lastName: str(r.last_name),
  email: str(r.email), phone: str(r.phone),
  company: str(r.company), position: str(r.position),
  street: str(r.street), houseNumber: str(r.house_number), houseNumberAddition: str(r.house_number_addition),
  postalCode: str(r.postal_code), city: str(r.city), province: str(r.province), country: str(r.country),
  messengerPsid: str(r.messenger_psid), messengerPageId: str(r.messenger_page_id),
  callCount: Number(r.call_count ?? 0),
  lastCallAt: ms(r.last_call_at), lastCallResult: str(r.last_call_result),
  nextFollowUpAt: ms(r.next_follow_up_at),
  tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === "string") : undefined,
  outsideArea: typeof r.outside_area === "boolean" ? r.outside_area : undefined,
  externalId: str(r.external_id),
});

const mapOpp = (r) => clean({
  legacyId: Number(r.id),
  legacyContactId: Number(r.contact_id),
  stageId: STAGE[r.stage_id] ?? NIEUWE_LEAD,
  pipelineId: PIPELINE_ID,
  title: str(r.title) ?? "Lead",
  value: r.value != null ? Number(r.value) : undefined,
  currency: str(r.currency),
  expectedCloseDate: ms(r.expected_close_date),
  description: str(r.lead_source),
});

async function batchUpsert(fn, docs, label) {
  const SIZE = 100;
  let done = 0;
  for (let i = 0; i < docs.length; i += SIZE) {
    const chunk = docs.slice(i, i + SIZE);
    await client.mutation(fn, { workspaceId: WORKSPACE_ID, docs: chunk });
    done += chunk.length;
    process.stdout.write(`\r  ${label}: ${done}/${docs.length}`);
  }
  process.stdout.write("\n");
}

const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "all";

(async () => {
  if (only === "all" || only === "contacts") {
    let c = readJsonl("contacts").filter((r) => !r.deleted_at).map(mapContact);
    if (limit < Infinity) c = c.slice(0, limit);
    console.log(`Contacten te importeren: ${c.length} (soft-deleted overgeslagen)`);
    await batchUpsert(fnContacts, c, "contacten");
  }
  if (only === "all" || only === "opportunities") {
    const rawOpps = readJsonl("opportunities").filter((r) => !r.deleted_at);
    const unknownStages = [...new Set(rawOpps.map((r) => r.stage_id).filter((s) => STAGE[s] === undefined))];
    if (unknownStages.length) console.log(`LET OP: onbekende oude stage_id's → Nieuwe lead: ${unknownStages.join(", ")}`);
    let o = rawOpps.map(mapOpp);
    if (limit < Infinity) o = o.slice(0, limit);
    console.log(`Opportunities te importeren: ${o.length}`);
    await batchUpsert(fnOpps, o, "opportunities");
  }
  console.log("klaar.");
})().catch((e) => { console.error("\nFOUT:", e.message || e); process.exit(1); });
