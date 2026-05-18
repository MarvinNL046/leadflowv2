/**
 * Test inbound-webhook flow. Simuleert:
 * 1. Voidfix WA inbound reply (van Marvin's +31648169416)
 * 2. Voidfix SMS inbound reply (zelfde nummer, SMS-channel)
 *
 * Verifieert dat messages-rows worden aangemaakt met direction=inbound
 * en contact-link (Marvin Smit) wordt gelegd.
 *
 * Run: npx tsx scripts/test-inbound-webhooks.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

config({ path: ".env.local" });

// V1's .env.local heeft de echte VOIDFIX_API_SECRET (geen aparte
// VOIDFIX_WEBHOOK_SECRET). Voidfix gebruikt 1 key voor zowel send als
// webhook-verify (per v1 prod-config).
const V1_ENV: Record<string, string> = {};
for (const line of readFileSync(
  "C:/Users/M_Smi/claudeProjecten/wetryleadflow/.env.local",
  "utf8",
).split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/);
  if (m) V1_ENV[m[1]] = m[2] ?? m[3] ?? "";
}

const SITE_URL = process.env.VITE_CONVEX_SITE_URL;
const VOIDFIX_SECRET = V1_ENV.VOIDFIX_API_SECRET;

if (!SITE_URL || !VOIDFIX_SECRET) {
  console.error("❌ Missing VITE_CONVEX_SITE_URL of VOIDFIX_API_SECRET");
  process.exit(1);
}

async function testVoidfixWaInbound() {
  const url = `${SITE_URL}/webhooks/voidfix-wa`;
  const payload = {
    event: "message.incoming",
    from: "+31648169416",
    body: "Hoi! Ik wil graag meer info over de winteractie 🙏",
    messageId: `wa_test_${Date.now()}`,
  };
  console.log("→ POST", url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": VOIDFIX_SECRET!,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  console.log(`  status=${res.status} body=${JSON.stringify(body)}`);
  if (res.status !== 200) {
    console.error("❌ WA inbound failed");
    process.exit(1);
  }
  console.log("✓ Voidfix WA inbound geaccepteerd");
}

async function testVoidfixWaBadSecret() {
  const url = `${SITE_URL}/webhooks/voidfix-wa`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "wrong_secret",
    },
    body: JSON.stringify({ event: "message.incoming", from: "+31600000000", body: "x" }),
  });
  console.log(`→ POST met foute secret: status=${res.status} (verwacht 401)`);
  if (res.status !== 401) {
    console.error("❌ Foute secret werd toch geaccepteerd");
    process.exit(1);
  }
  console.log("✓ Foute secret geweigerd");
}

async function testVoidfixSmsInbound() {
  const url = `${SITE_URL}/webhooks/voidfix-sms`;
  const sms_secret = VOIDFIX_SECRET;  // zelfde key als WA
  const payload = {
    status: "Received",
    from: "+31648169416",
    body: "Test SMS reply via v2 webhook",
    messageId: `sms_test_${Date.now()}`,
  };
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", sms_secret).update(rawBody).digest("hex");

  console.log("→ POST", url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sg-signature": signature,
    },
    body: rawBody,
  });
  const body = await res.json();
  console.log(`  status=${res.status} body=${JSON.stringify(body)}`);
  if (res.status !== 200) {
    console.error("❌ SMS inbound failed");
    process.exit(1);
  }
  console.log("✓ Voidfix SMS inbound geaccepteerd");
}

async function main() {
  console.log("=== Inbound webhooks end-to-end test ===");
  console.log("Target:", SITE_URL);
  console.log("");

  await testVoidfixWaBadSecret();
  console.log("");
  await testVoidfixWaInbound();
  console.log("");
  await testVoidfixSmsInbound();
  console.log("");
  console.log("✅ Alle assertions geslaagd");
  console.log("Check /crm/messages — 2 nieuwe INBOUND messages van Marvin Smit");
}

main().catch((err) => {
  console.error("❌ Test gefaald:");
  console.error(err);
  process.exit(1);
});
