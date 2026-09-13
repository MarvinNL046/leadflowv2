/**
 * Sync-all orchestrator — draait alle 14 migrate-scripts in juiste
 * FK-volgorde. Idempotent: bestaande rows worden gepatcht via legacyId.
 *
 * Gebruik:
 *   DRY_RUN=1 npx tsx scripts/sync-all.ts   # dry-run op alle scripts
 *   npx tsx scripts/sync-all.ts             # echte run
 *
 * Bedoeld voor cutover-dag T-0:05 final delta-sync. Stops on first error.
 */
import { spawnSync } from "node:child_process";

interface Step {
  name: string;
  script: string;
  notes?: string;
}

const STEPS: Step[] = [
  // Layer 1: basis (geen FK)
  { name: "contacts", script: "migrate-contacts.ts", notes: "FK-basis voor alle andere migrations" },

  // Layer 2: FK naar contacts
  { name: "lead-attribution", script: "migrate-lead-attribution.ts" },
  { name: "meta-lead-raw", script: "migrate-meta-lead-raw.ts" },
  { name: "notes", script: "migrate-notes.ts" },
  { name: "opportunities", script: "migrate-opportunities.ts", notes: "Plus pipeline-stage-mapping" },

  // Layer 3: FK naar opportunities
  { name: "stage-history", script: "migrate-stage-history.ts" },

  // Layer 4: custom fields (defs vóór values)
  { name: "custom-field-defs", script: "migrate-custom-field-defs.ts" },
  { name: "custom-field-values", script: "migrate-custom-field-values.ts" },

  // Layer 5: messages
  { name: "message-log", script: "migrate-message-log.ts" },

  // Layer 6: workflows (parents vóór children)
  { name: "email-templates", script: "migrate-email-templates.ts" },
  { name: "workflows", script: "migrate-workflows.ts" },
  { name: "workflow-nodes", script: "migrate-workflow-nodes.ts" },
  { name: "workflow-edges", script: "migrate-workflow-edges.ts" },

  // Layer 7: standalone
  { name: "notifications", script: "migrate-notifications.ts" },
];

const isDryRun = process.env.DRY_RUN === "1";

console.log("");
console.log("=".repeat(70));
console.log(`  LeadFlow v1 → v2 SYNC-ALL  ${isDryRun ? "(DRY RUN)" : ""}`);
console.log("=".repeat(70));
console.log(`  ${STEPS.length} scripts, sequentieel uitgevoerd in FK-volgorde.`);
console.log(`  Stops on first failure. Idempotent — safe om opnieuw te draaien.`);
console.log("=".repeat(70));
console.log("");

const startMs = Date.now();
let succeeded = 0;
let failed: string | null = null;

for (const step of STEPS) {
  const banner = `── ${step.name} ${"─".repeat(60 - step.name.length)}`;
  console.log("");
  console.log(banner);
  if (step.notes) console.log(`   ${step.notes}`);
  console.log("");

  const env = { ...process.env };
  if (isDryRun) env.DRY_RUN = "1";

  const result = spawnSync("npx", ["tsx", `scripts/${step.script}`], {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    failed = step.name;
    break;
  }
  succeeded++;
}

const elapsedSec = Math.round((Date.now() - startMs) / 1000);
console.log("");
console.log("=".repeat(70));
if (failed) {
  console.log(`  ❌ SYNC-ALL GEFAALD bij stap: ${failed}`);
  console.log(`     ${succeeded} van ${STEPS.length} scripts geslaagd.`);
  console.log(`     Tijd: ${elapsedSec}s`);
  console.log(`     Fix het issue en draai sync-all opnieuw (idempotent).`);
  console.log("=".repeat(70));
  process.exit(1);
} else {
  console.log(`  ✅ SYNC-ALL KLAAR — ${succeeded} scripts in ${elapsedSec}s`);
  console.log("=".repeat(70));
}
