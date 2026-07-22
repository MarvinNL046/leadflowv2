/**
 * Backfill van NIEUWE Moneybird-contacten (cutover-sync 2026-07) via de
 * Convex-CLI in plaats van ConvexHttpClient+deploy-key: `convex run` draait
 * met de lokale CLI-login (admin) en mag dus internal functions aanroepen.
 * Zelfde logica als backfillMoneybirdContacts.mjs (dedup e-mail → telefoon →
 * externalId, dan pas aanmaken), maar geschikt voor kleine aantallen.
 *
 *   node scripts/backfillViaCli.mjs --dry-run|--apply \
 *     --backup C:/Users/M_Smi/Projecten/backups/moneybird-2026-07-11
 *
 * Schrijft bij --apply de nieuwe koppelingen terug in mb-mapping.json.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => (has(f) ? argv[argv.indexOf(f) + 1] : undefined);
const isApply = has("--apply");
const BACKUP = val("--backup");
if (!BACKUP || has("--dry-run") === isApply) {
  console.error("Gebruik: --dry-run|--apply --backup <dir>");
  process.exit(1);
}

const DEPLOYMENT = "prod:vibrant-wildebeest-329";

function convexRun(fn, args) {
  const out = execFileSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", "run", fn, JSON.stringify(args)],
    { env: { ...process.env, CONVEX_DEPLOYMENT: DEPLOYMENT }, encoding: "utf8" },
  );
  return JSON.parse(out);
}

const str = (v) => {
  if (v === null || v === undefined) return undefined;
  const t = String(v).trim();
  return t ? t : undefined;
};
const clean = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const mapContact = (raw) =>
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

const contacts = JSON.parse(readFileSync(join(BACKUP, "moneybird-contacts.json"), "utf8"));
const invoices = JSON.parse(readFileSync(join(BACKUP, "moneybird-invoices.json"), "utf8"));
const estimates = JSON.parse(readFileSync(join(BACKUP, "moneybird-estimates.json"), "utf8"));
const mappingPath = join(BACKUP, "mb-mapping.json");
const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));

const docContactIds = new Set();
for (const d of [...invoices, ...estimates])
  if (d.contact_id) docContactIds.add(String(d.contact_id));
const targetIds = [...docContactIds].filter((id) => !(id in mapping));

const byId = new Map(contacts.map((c) => [String(c.id), c]));
const embedded = new Map();
for (const d of [...invoices, ...estimates]) {
  if (d.contact?.id && !embedded.has(String(d.contact.id)))
    embedded.set(String(d.contact.id), d.contact);
}
const docs = targetIds
  .map((id) => byId.get(id) ?? embedded.get(id))
  .filter(Boolean)
  .map(mapContact);

console.log(`doel-contacten (niet in mapping): ${targetIds.length}, opgelost: ${docs.length}`);
if (docs.length === 0) {
  console.log("Niets te doen.");
  process.exit(0);
}

const workspaceId = convexRun("migration:getStaycoolWorkspaceId", {});
console.log(`workspaceId: ${workspaceId}`);

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

let already = 0;
let created = 0;
for (const batch of chunk(docs, 10)) {
  const matches = convexRun("migration:matchMoneybirdContacts", { workspaceId, batch });
  for (const m of matches) {
    if (m.existingContactId) {
      already++;
      mapping[m.moneybirdId] = m.existingContactId;
    } else if (isApply) {
      const doc = docs.find((d) => d.moneybirdId === m.moneybirdId);
      const res = convexRun("migration:backfillMoneybirdContact", {
        workspaceId,
        batch: [doc],
      });
      const row = Array.isArray(res.results) ? res.results[0] : res[0] ?? res;
      mapping[m.moneybirdId] = row.contactId;
      created++;
    } else {
      created++; // dry-run: zou aangemaakt worden
    }
  }
  process.stdout.write(`\r  verwerkt: ${already + created}/${docs.length}`);
}
console.log(`\n${isApply ? "APPLY" : "DRY-RUN"}: al-in-leadflow ${already}, ${isApply ? "aangemaakt" : "zou aanmaken"} ${created}`);

if (isApply) {
  writeFileSync(mappingPath, JSON.stringify(mapping, null, 1));
  console.log(`mb-mapping.json bijgewerkt (${Object.keys(mapping).length} contacten).`);
}
