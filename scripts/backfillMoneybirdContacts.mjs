// ─────────────────────────────────────────────────────────────────────────
// Moneybird → leadflow contact-backfill (fase A cutover-aanvulling, 2026-07).
//
// Voegt ALLE Moneybird-contacten met facturen/offertes die NÓG NIET in de
// mb-mapping staan (486 stuks) toe aan leadflow — maar dedupt EERST tegen de
// live workspace (e-mail → telefoon last-9 → externalId). Idempotent: her-
// draaien maakt geen dubbelen.
//
// Roept de INTERNAL Convex-functies migration:matchMoneybirdContacts (dry-run,
// read-only) en migration:backfillMoneybirdContact (apply) aan via
// ConvexHttpClient met admin-auth (CONVEX_DEPLOY_KEY) — zelfde host als de
// bestaande migration/import-scripts, maar admin-geauth zodat internal-fns
// aanroepbaar zijn. Workspace wordt server-side gepind via
// migration:getStaycoolWorkspaceId.
//
// Draai vanuit leadflowv2 (convex-module resolve):
//
//   # DRY-RUN (schrijft niets, rapporteert al-in-leadflow vs echt-nieuw):
//   node scripts/backfillMoneybirdContacts.mjs --dry-run --url https://vibrant-wildebeest-329.convex.cloud
//
//   # APPLY (schrijft naar de live CRM + genereert mb-mapping-aangevuld.json):
//   node scripts/backfillMoneybirdContacts.mjs --apply --url https://vibrant-wildebeest-329.convex.cloud
//
// CONVEX_DEPLOY_KEY moet in de env staan (prod deploy-key) voor admin-auth op
// de internal-functies. --limit N beperkt het aantal doelcontacten (droogtest).
// ─────────────────────────────────────────────────────────────────────────

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Offline data ──────────────────────────────────────────────────────────
const BACKUP_DIR =
  process.env.MB_BACKUP_DIR ??
  "C:/Users/M_Smi/Projecten/backups/moneybird-2026-07-02";
const CONTACTS_PATH = join(BACKUP_DIR, "moneybird-contacts.json");
const INVOICES_PATH = join(BACKUP_DIR, "moneybird-invoices.json");
const ESTIMATES_PATH = join(BACKUP_DIR, "moneybird-estimates.json");
const MAPPING_PATH = join(BACKUP_DIR, "mb-mapping.json");
const OUT_MAPPING_PATH = join(BACKUP_DIR, "mb-mapping-aangevuld.json");

const CHUNK_SIZE = 50; // ≤50 per Convex-call (task-eis)

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => (has(f) ? argv[argv.indexOf(f) + 1] : undefined);

const isDryRun = has("--dry-run");
const isApply = has("--apply");
const url = val("--url");
const limit = has("--limit") ? Number(val("--limit")) : Infinity;

if (isDryRun === isApply) {
  console.error("Geef precies één van --dry-run of --apply op.");
  process.exit(1);
}
if (!url) {
  console.error("Ontbrekende --url <prod-convex-url>.");
  process.exit(1);
}
const deployKey = process.env.CONVEX_DEPLOY_KEY;
if (!deployKey) {
  console.error(
    "CONVEX_DEPLOY_KEY ontbreekt in de env (nodig voor admin-auth op de internal-functies).",
  );
  process.exit(1);
}

// ── Pure mapping-helper (spiegelt convex/lib/moneybirdMatch.mapMoneybirdContact).
// Los gehouden van de Convex-module zodat dit script zonder build draait.
const str = (v) => {
  if (v === null || v === undefined) return undefined;
  const t = String(v).trim();
  return t ? t : undefined;
};
const clean = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const mapMoneybirdContact = (raw) =>
  clean({
    moneybirdId: String(raw.id),
    firstName: str(raw.firstname),
    lastName: str(raw.lastname),
    company: str(raw.company_name),
    email: str(raw.email),
    phone: str(raw.phone),
    street: str(raw.address1),
    postalCode: str(raw.zipcode),
    city: str(raw.city),
    country: str(raw.country),
  });

// ── Doelcontacten bepalen: (invoice/estimate contact_ids) MINUS mb-mapping-keys.
function loadTargetDocs() {
  const contacts = JSON.parse(readFileSync(CONTACTS_PATH, "utf8"));
  const invoices = JSON.parse(readFileSync(INVOICES_PATH, "utf8"));
  const estimates = JSON.parse(readFileSync(ESTIMATES_PATH, "utf8"));
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8"));

  const docContactIds = new Set();
  for (const inv of invoices)
    if (inv.contact_id) docContactIds.add(String(inv.contact_id));
  for (const est of estimates)
    if (est.contact_id) docContactIds.add(String(est.contact_id));

  const mappedKeys = new Set(Object.keys(mapping));
  const targetIds = [...docContactIds].filter((id) => !mappedKeys.has(id));

  // Index op contact-id. Fallback naar het embedded `document.contact` object
  // voor de handvol contact_ids die wél in facturen/offertes voorkomen maar
  // (om welke reden dan ook) niet los in moneybird-contacts.json staan.
  const byId = new Map(contacts.map((c) => [String(c.id), c]));
  const embeddedById = new Map();
  for (const src of [...invoices, ...estimates]) {
    const emb = src.contact;
    if (emb && emb.id && !embeddedById.has(String(emb.id))) {
      embeddedById.set(String(emb.id), emb);
    }
  }

  const docs = [];
  let fromContacts = 0;
  let fromEmbedded = 0;
  let unresolved = 0;
  for (const id of targetIds) {
    const raw = byId.get(id) ?? embeddedById.get(id);
    if (!raw) {
      unresolved++;
      continue;
    }
    if (byId.has(id)) fromContacts++;
    else fromEmbedded++;
    docs.push(mapMoneybirdContact(raw));
  }

  return {
    docs,
    stats: {
      docContactIds: docContactIds.size,
      targetIds: targetIds.length,
      fromContacts,
      fromEmbedded,
      unresolved,
    },
    mapping,
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────
const client = new ConvexHttpClient(url);
client.setAdminAuth(deployKey);
const fnWorkspace = makeFunctionReference("migration:getStaycoolWorkspaceId");
const fnMatch = makeFunctionReference("migration:matchMoneybirdContacts");
const fnBackfill = makeFunctionReference("migration:backfillMoneybirdContact");

(async () => {
  const { docs: allDocs, stats } = loadTargetDocs();
  let docs = allDocs;
  if (limit < Infinity) docs = docs.slice(0, limit);

  const nameOnly = docs.filter((d) => !d.email && !d.phone).length;
  console.log(`Moneybird-backfill — mode: ${isDryRun ? "DRY-RUN" : "APPLY"}`);
  console.log(`  host: ${url}`);
  console.log(
    `  unieke contact_ids met docs: ${stats.docContactIds} | doel (minus mapping): ${stats.targetIds}`,
  );
  console.log(
    `  opgelost: ${stats.fromContacts} uit contacts.json + ${stats.fromEmbedded} uit embedded document.contact` +
      (stats.unresolved ? ` | ONOPGELOST: ${stats.unresolved}` : ""),
  );
  console.log(
    `  te verwerken: ${docs.length}${limit < Infinity ? ` (--limit ${limit})` : ""} | naam-only (geen e-mail/telefoon): ${nameOnly}`,
  );

  const workspaceId = await client.query(fnWorkspace, {});
  if (!workspaceId) {
    console.error("Staycool-workspace niet gevonden (getStaycoolWorkspaceId → null).");
    process.exit(1);
  }
  console.log(`  workspaceId: ${workspaceId}\n`);

  const batches = chunk(docs, CHUNK_SIZE);

  if (isDryRun) {
    let already = 0;
    let brandNew = 0;
    const byReason = { email: 0, phone: 0, externalId: 0 };
    const newSamples = [];
    let done = 0;
    for (const batch of batches) {
      const res = await client.query(fnMatch, { workspaceId, batch });
      for (const r of res) {
        if (r.existingContactId) {
          already++;
          if (r.matchReason && byReason[r.matchReason] !== undefined)
            byReason[r.matchReason]++;
        } else {
          brandNew++;
          if (newSamples.length < 5) newSamples.push(r.moneybirdId);
        }
      }
      done += batch.length;
      process.stdout.write(`\r  match: ${done}/${docs.length}`);
    }
    process.stdout.write("\n\n");
    console.log("── DRY-RUN RAPPORT ──────────────────────────────");
    console.log(`  al in leadflow : ${already}`);
    console.log(
      `     via e-mail   : ${byReason.email} | via telefoon : ${byReason.phone} | via externalId : ${byReason.externalId}`,
    );
    console.log(`  echt nieuw     : ${brandNew}`);
    console.log(`  naam-only      : ${nameOnly}`);
    console.log(`  sample nieuw (5 moneybirdId's): ${newSamples.join(", ")}`);
    console.log("\nGeen schrijfacties uitgevoerd (dry-run).");
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────
  let created = 0;
  let matched = 0;
  let mergedFields = 0;
  const fullMapping = {}; // moneybirdId → leadflowContactId (alle 486)
  let done = 0;
  for (const batch of batches) {
    const res = await client.mutation(fnBackfill, { workspaceId, batch });
    created += res.created;
    matched += res.matched;
    mergedFields += res.mergedFields;
    for (const r of res.results) fullMapping[r.moneybirdId] = r.contactId;
    done += batch.length;
    process.stdout.write(`\r  backfill: ${done}/${docs.length}`);
  }
  process.stdout.write("\n\n");
  console.log("── APPLY RAPPORT ────────────────────────────────");
  console.log(`  nieuw aangemaakt : ${created}`);
  console.log(`  al bestaand      : ${matched} (lege velden aangevuld: ${mergedFields})`);
  console.log(`  totaal verwerkt  : ${done}`);

  // Bijgewerkte mapping wegschrijven: alle verwerkte moneybirdId → contactId.
  writeFileSync(OUT_MAPPING_PATH, `${JSON.stringify(fullMapping, null, 0)}\n`);
  console.log(
    `\nMapping (${Object.keys(fullMapping).length} entries) weggeschreven → ${OUT_MAPPING_PATH}`,
  );
})().catch((e) => {
  console.error("\nFOUT:", e?.message ?? e);
  process.exit(1);
});
