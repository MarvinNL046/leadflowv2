/**
 * End-to-end test van de Meta-webhook tegen de Convex deployment.
 *
 * 1. GET /webhooks/meta?hub.mode=subscribe&...&hub.challenge=X
 *    → moet "X" terug echoën met 200
 * 2. POST /webhooks/meta met fake leadgen-payload + correcte HMAC-SHA256
 *    → moet 200 + {processed:1} returnen
 *    → metaLeadRaw row landt met status="pending" of "failed" (failed
 *      verwacht omdat META_PAGE_ACCESS_TOKEN dummy is → Graph API faalt)
 *    → leadAttribution rij niet aangemaakt (processor faalt)
 *
 * Vereist (.env.meta-test):
 *   META_APP_SECRET
 *   META_WEBHOOK_VERIFY_TOKEN
 *
 * Run: npx tsx scripts/test-meta-webhook.ts
 */
import { config } from "dotenv";
import { createHmac } from "node:crypto";

config({ path: ".env.meta-test" });
config({ path: ".env.local" });

const SITE_URL = process.env.VITE_CONVEX_SITE_URL;
const APP_SECRET = process.env.META_APP_SECRET;
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

if (!SITE_URL || !APP_SECRET || !VERIFY_TOKEN) {
  console.error("❌ Missing env: VITE_CONVEX_SITE_URL / META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN");
  process.exit(1);
}

const WEBHOOK_URL = `${SITE_URL}/webhooks/meta`;

async function main() {
  console.log("=== Meta webhook end-to-end test ===");
  console.log("Target:", WEBHOOK_URL);
  console.log("");

  // ── STAP 1: GET challenge ──────────────────────────────────────────
  const challenge = "test_challenge_" + Date.now();
  const getUrl = new URL(WEBHOOK_URL);
  getUrl.searchParams.set("hub.mode", "subscribe");
  getUrl.searchParams.set("hub.verify_token", VERIFY_TOKEN);
  getUrl.searchParams.set("hub.challenge", challenge);

  console.log("→ GET", getUrl.pathname + getUrl.search);
  const getRes = await fetch(getUrl);
  const getBody = await getRes.text();
  console.log(`  status=${getRes.status} body=${JSON.stringify(getBody)}`);
  if (getRes.status !== 200 || getBody !== challenge) {
    console.error("❌ Challenge verify FAILED — verwachte echo van challenge");
    process.exit(1);
  }
  console.log("✓ Challenge verified");
  console.log("");

  // ── STAP 1b: GET met FOUTE verify-token ────────────────────────────
  const badUrl = new URL(WEBHOOK_URL);
  badUrl.searchParams.set("hub.mode", "subscribe");
  badUrl.searchParams.set("hub.verify_token", "wrong_token");
  badUrl.searchParams.set("hub.challenge", "x");
  const badRes = await fetch(badUrl);
  console.log(`→ GET met foute token: status=${badRes.status} (verwacht 403)`);
  if (badRes.status !== 403) {
    console.error("❌ Verkeerde token werd toch geaccepteerd");
    process.exit(1);
  }
  console.log("✓ Verkeerde verify-token geweigerd");
  console.log("");

  // ── STAP 2: POST met fake leadgen payload + correcte HMAC ──────────
  const fakeLeadgenId = `test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const payload = {
    object: "page",
    entry: [
      {
        id: "103797231787185",  // Staycool's page-id uit migratie-data
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: fakeLeadgenId,
              page_id: "103797231787185",
              form_id: "956868316261651",  // Winteractie form
              ad_id: "test_ad_123",
              adgroup_id: "test_adgroup_456",
              created_time: Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  };
  const rawBody = JSON.stringify(payload);
  const signature = "sha256=" + createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");

  console.log("→ POST met fake leadgen_id:", fakeLeadgenId);
  const postRes = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signature,
    },
    body: rawBody,
  });
  const postBody = await postRes.json();
  console.log(`  status=${postRes.status} body=${JSON.stringify(postBody)}`);
  if (postRes.status !== 200) {
    console.error("❌ Webhook POST failed");
    process.exit(1);
  }
  console.log("✓ Webhook accepteerde lead + scheduled processor");
  console.log("");

  // ── STAP 2b: POST met INVALID signature ────────────────────────────
  const badSigRes = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": "sha256=deadbeef",
    },
    body: rawBody,
  });
  console.log(`→ POST met foute signature: status=${badSigRes.status} (verwacht 401)`);
  if (badSigRes.status !== 401) {
    console.error("❌ Verkeerde signature werd toch geaccepteerd");
    process.exit(1);
  }
  console.log("✓ Verkeerde signature geweigerd");
  console.log("");

  // ── STAP 2c: POST met DUPLICATE leadgen-id (idempotency) ───────────
  const dupRes = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signature,
    },
    body: rawBody,
  });
  const dupBody = await dupRes.json();
  console.log(`→ POST duplicate: status=${dupRes.status} body=${JSON.stringify(dupBody)}`);
  if (dupBody.processed !== 0 || dupBody.skipped !== 1) {
    console.error("❌ Duplicate werd niet als skipped herkend");
    process.exit(1);
  }
  console.log("✓ Duplicate leadgen_id geskipt (idempotent)");
  console.log("");

  console.log("✅ Alle assertions geslaagd");
  console.log("");
  console.log(`Check Convex dashboard voor metaLeadRaw row met leadgenId=${fakeLeadgenId}`);
  console.log("Status verwacht: \"failed\" (dummy META_PAGE_ACCESS_TOKEN — Graph API rejected)");
}

main().catch((err) => {
  console.error("");
  console.error("❌ Test gefaald:");
  console.error(err);
  process.exit(1);
});
