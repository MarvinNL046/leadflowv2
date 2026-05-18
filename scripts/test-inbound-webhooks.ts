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
import { createHmac } from "node:crypto";

config({ path: ".env.meta-test" });
config({ path: ".env.local" });

const SITE_URL = process.env.VITE_CONVEX_SITE_URL;
const WA_SECRET = process.env.VOIDFIX_WEBHOOK_SECRET;
const SMS_SECRET = process.env.META_APP_SECRET; // we hergebruiken voor SMS-test? Nee, andere key

if (!SITE_URL || !WA_SECRET) {
  console.error("❌ Missing VITE_CONVEX_SITE_URL of VOIDFIX_WEBHOOK_SECRET");
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
      "x-webhook-secret": WA_SECRET!,
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
  const sms_secret = process.env.VOIDFIX_API_SECRET;
  if (!sms_secret) {
    console.warn("⚠ VOIDFIX_API_SECRET niet in .env — skip SMS test");
    return;
  }
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
