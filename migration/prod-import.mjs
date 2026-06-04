// v1 Neon JSONL → PROD Convex (vibrant-wildebeest-329) import.
// migration:upsert*Batch zijn na B1 INTERNAL → niet via ConvexHttpClient
// aanroepbaar; we shellen daarom per chunk uit naar `npx convex run --prod`
// (admin mag internal). Byte-gechunkt onder Linux' MAX_ARG_STRLEN (~128KB/arg).
// Idempotent op legacyId/legacyContactId. Draai vanuit leadflowv2:
//   node migration/prod-import.mjs --only contacts --limit 20   # droogtest
//   node migration/prod-import.mjs --only contacts
//   node migration/prod-import.mjs --only opportunities
//   node migration/prod-import.mjs                              # contacten dan opps
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WORKSPACE_ID = "s9792xsyts58zdvd28a1ksw2ad871v4b";
const PIPELINE_ID = "q970ypb3dsm4matyjpw47sndv9870ec5";
const NIEUW = "q5757gy9mmj2b9gwanmc5z6dm9880m0x";
// v1 stage_id → PROD 7-staps stageId (uit rebuildStaycoolPipeline7Stage)
const STAGE = {
  49: "q5757gy9mmj2b9gwanmc5z6dm9880m0x", // Nieuw
  50: "q57fppnfnynaftr1jtsx29sshn881kq0", // 1x Gebeld
  51: "q578h49yrwawf2ga76apyznwsh881a2m", // 2x Gebeld
  52: "q572ja12bn6xpdst3t68jr4qyn880qrq", // 3x Gebeld
  56: "q57f3zsh05vmwe67515qcxjggs881wjt", // Afspraak ingepland
  53: "q57dcjjad6rc0sm78kqzs4tvf187136p", // Gewonnen
  54: "q57fyh4q6704fbxdt8ads7ajes870q72", // Verloren
};

const DATA = "/home/marvin/Projecten/leadflowv2/migration/data";
const MAX_ARG = 90_000; // bytes per CLI-arg, ruim onder Linux 128KB-limiet

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
  stageId: STAGE[r.stage_id] ?? NIEUW,
  pipelineId: PIPELINE_ID,
  title: str(r.title) ?? "Lead",
  value: r.value != null ? Number(r.value) : undefined,
  currency: str(r.currency),
  expectedCloseDate: ms(r.expected_close_date),
  description: str(r.lead_source),
});

function runBatches(fn, docs, label) {
  let i = 0, done = 0, calls = 0;
  while (i < docs.length) {
    const chunk = [];
    let size = 0;
    while (i < docs.length) {
      const s = JSON.stringify(docs[i]).length;
      if (chunk.length > 0 && size + s > MAX_ARG) break;
      chunk.push(docs[i]); size += s; i++;
    }
    const arg = JSON.stringify({ workspaceId: WORKSPACE_ID, docs: chunk });
    try {
      execFileSync("npx", ["convex", "run", fn, arg, "--prod"], { stdio: ["ignore", "ignore", "inherit"] });
    } catch (e) {
      console.error(`\nFOUT in ${label} chunk @${done}: ${e.message}`);
      process.exit(1);
    }
    done += chunk.length; calls++;
    process.stdout.write(`\r  ${label}: ${done}/${docs.length} (${calls} calls)`);
  }
  process.stdout.write("\n");
}

const argv = process.argv.slice(2);
const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : Infinity;
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : "all";

if (only === "all" || only === "contacts") {
  let c = readJsonl("contacts").filter((r) => !r.deleted_at).map(mapContact);
  if (limit < Infinity) c = c.slice(0, limit);
  console.log(`Contacten te importeren: ${c.length} (soft-deleted overgeslagen)`);
  runBatches("migration:upsertContactsBatch", c, "contacten");
}
if (only === "all" || only === "opportunities") {
  const rawOpps = readJsonl("opportunities").filter((r) => !r.deleted_at);
  const unknown = [...new Set(rawOpps.map((r) => r.stage_id).filter((s) => STAGE[s] === undefined))];
  if (unknown.length) console.log(`LET OP: onbekende v1 stage_id's → Nieuw: ${unknown.join(", ")}`);
  let o = rawOpps.map(mapOpp);
  if (limit < Infinity) o = o.slice(0, limit);
  console.log(`Opportunities te importeren: ${o.length}`);
  runBatches("migration:upsertOpportunitiesBatch", o, "opportunities");
}
console.log("klaar.");
