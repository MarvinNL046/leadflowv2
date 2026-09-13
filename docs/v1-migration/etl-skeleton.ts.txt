/**
 * Neon Postgres → Convex ETL skeleton voor V2 migratie.
 *
 * Pattern: read from Neon (Drizzle) → transform per tabel → write to Convex
 * via internal mutation. Resumable, idempotent, batchable.
 *
 * Idiomatisch in v2 (TanStack Start + Convex + TanStack Query):
 * - Dit script run je éénmaal (of incrementeel tijdens overgangsperiode)
 *   vanuit een Node-script in de v2-repo, niet in de runtime.
 * - Convex's `internal.migration.*` mutations doen de writes.
 * - Idempotency via natural keys (b.v. contact.email + workspaceId,
 *   message.externalMessageId, leadgenId).
 *
 * Volgorde van tables door FK-dependencies:
 *  1. users → orgs → workspaces → memberships
 *  2. pipelines → pipelineStages
 *  3. contacts → opportunities → opportunityStageHistory
 *  4. notes, customFieldDefinitions, customFieldValues
 *  5. metaConnections → metaPages → metaForms → metaLeadRaw → leadAttribution
 *  6. messageThreads → messages (4-in-1 unify: see TRANSFORM_MESSAGES below)
 *  7. workflows → workflowNodes → workflowEdges → workflowExecutions → workflowExecutionLogs
 *  8. Outbound config (voidfix/whatsapp/website-api-keys)
 *  9. Marketplace tables (laatst — afhankelijkheden van orgs + contacts)
 *
 * Run als: `npx tsx scripts/migrate-to-v2.ts --table contacts --batch 500`
 * of all-at-once: `npx tsx scripts/migrate-to-v2.ts --all`
 */

import { config } from "dotenv";
config({ path: ".env.v2-migration" });  // bevat zowel NEON_DATABASE_URL als CONVEX_URL + CONVEX_DEPLOY_KEY

import pg from "pg";
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "../../v2-repo/convex/_generated/api";  // path naar je v2-repo

const { Pool } = pg;

// ── Connections ────────────────────────────────────────────────────────

const neon = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const convex = new ConvexHttpClient(process.env.CONVEX_URL!, {
  // De v2-deploy-key — needed voor internal-mutation calls
  // Set via: npx convex deploy-key
  authToken: process.env.CONVEX_DEPLOY_KEY,
});

// Track Neon-id → Convex-id zodat FK references over kunnen
// (Convex id-types zijn opaque strings, geen integers).
const idMap = {
  users: new Map<number, string>(),
  orgs: new Map<number, string>(),
  workspaces: new Map<number, string>(),
  pipelines: new Map<number, string>(),
  pipelineStages: new Map<number, string>(),
  contacts: new Map<number, string>(),
  opportunities: new Map<number, string>(),
  metaPages: new Map<number, string>(),
  metaForms: new Map<number, string>(),
  workflows: new Map<number, string>(),
  messageThreads: new Map<string, string>(),  // keyed by externalThreadId
  customFieldDefinitions: new Map<number, string>(),
};

// ── Batch helper ───────────────────────────────────────────────────────

const BATCH_SIZE = 500;

async function batchMigrate<TRow, TDoc>(
  table: string,
  selectSql: string,
  transform: (row: TRow) => TDoc | null,  // return null to skip
  upsert: (docs: TDoc[]) => Promise<string[]>,  // Convex returns insertedIds
  rememberId?: (row: TRow, convexId: string) => void
) {
  let offset = 0;
  let total = 0;
  console.log(`\n▶ ${table} — starting`);

  while (true) {
    const res = await neon.query<TRow>(`${selectSql} LIMIT ${BATCH_SIZE} OFFSET ${offset}`);
    if (res.rows.length === 0) break;

    const docs: { row: TRow; doc: TDoc }[] = [];
    for (const row of res.rows) {
      const doc = transform(row);
      if (doc !== null) docs.push({ row, doc });
    }

    if (docs.length > 0) {
      const insertedIds = await upsert(docs.map((d) => d.doc));
      if (rememberId) {
        docs.forEach((d, i) => rememberId(d.row, insertedIds[i]));
      }
    }

    total += res.rows.length;
    offset += BATCH_SIZE;
    console.log(`  ${table} — ${total} rijen verwerkt`);
    if (res.rows.length < BATCH_SIZE) break;
  }

  console.log(`✓ ${table} — done, ${total} rijen totaal`);
}

// ── Per-table transforms ───────────────────────────────────────────────

async function migrateUsers() {
  await batchMigrate(
    "users",
    `SELECT id, email, first_name, last_name, avatar_url, locale, stack_auth_id, is_super_admin, last_login_at FROM users ORDER BY id`,
    (row: any) => ({
      email: row.email,
      firstName: row.first_name ?? undefined,
      lastName: row.last_name ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      externalAuthId: row.stack_auth_id ?? undefined,
      locale: row.locale ?? "nl",
      isSuperAdmin: row.is_super_admin ?? false,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).getTime() : undefined,
    }),
    async (docs) => convex.mutation(internal.migration.users.bulkInsert, { docs }),
    (row, convexId) => idMap.users.set(row.id, convexId)
  );
}

async function migrateOrgs() {
  await batchMigrate(
    "orgs",
    `SELECT id, name, slug, owner_id, plan, stripe_customer_id FROM orgs ORDER BY id`,
    (row: any) => {
      const ownerId = idMap.users.get(row.owner_id);
      if (!ownerId) {
        console.warn(`org ${row.id} skipped — owner user ${row.owner_id} not in idMap`);
        return null;
      }
      return {
        name: row.name,
        slug: row.slug,
        ownerId,
        plan: row.plan ?? undefined,
        stripeCustomerId: row.stripe_customer_id ?? undefined,
      };
    },
    async (docs) => convex.mutation(internal.migration.orgs.bulkInsert, { docs }),
    (row, convexId) => idMap.orgs.set(row.id, convexId)
  );
}

async function migrateContacts() {
  await batchMigrate(
    "contacts",
    `SELECT * FROM contacts WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id IN (SELECT id FROM orgs)) ORDER BY id`,
    (row: any) => {
      const workspaceId = idMap.workspaces.get(row.workspace_id);
      if (!workspaceId) return null;
      return {
        workspaceId,
        firstName: row.first_name ?? undefined,
        lastName: row.last_name ?? undefined,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        company: row.company ?? undefined,
        position: row.position ?? undefined,
        street: row.street ?? undefined,
        houseNumber: row.house_number ?? undefined,
        houseNumberAddition: row.house_number_addition ?? undefined,
        postalCode: row.postal_code ?? undefined,
        city: row.city ?? undefined,
        province: row.province ?? undefined,
        country: row.country ?? undefined,
        messengerPsid: row.messenger_psid ?? undefined,
        messengerPageId: row.messenger_page_id ?? undefined,
        callCount: row.call_count ?? 0,
        lastCallAt: row.last_call_at ? new Date(row.last_call_at).getTime() : undefined,
        lastCallResult: row.last_call_result ?? undefined,
        nextFollowUpAt: row.next_follow_up_at ? new Date(row.next_follow_up_at).getTime() : undefined,
        tags: row.tags ? row.tags.split(",").map((t: string) => t.trim()) : undefined,
        outsideArea: row.outside_area ?? undefined,
        externalId: row.external_id ?? undefined,
      };
    },
    async (docs) => convex.mutation(internal.migration.contacts.bulkInsert, { docs }),
    (row, convexId) => idMap.contacts.set(row.id, convexId)
  );
}

// ── MESSAGES: 4-in-1 UNIFY (email_log + email_messages + email_threads + message_log) ──

async function migrateMessageThreads() {
  // Bron: email_threads (alleen email heeft threading)
  await batchMigrate(
    "messageThreads (van email_threads)",
    `SELECT * FROM email_threads ORDER BY id`,
    (row: any) => {
      const workspaceId = idMap.workspaces.get(row.workspace_id);
      const contactId = idMap.contacts.get(row.contact_id);
      if (!workspaceId || !contactId) return null;
      return {
        workspaceId,
        contactId,
        channel: "email" as const,
        subject: row.subject ?? undefined,
        externalThreadId: row.external_thread_id ?? undefined,
        lastMessageAt: row.last_message_at ? new Date(row.last_message_at).getTime() : Date.now(),
        unreadCount: row.unread_count ?? 0,
        isArchived: row.is_archived ?? false,
      };
    },
    async (docs) => convex.mutation(internal.migration.messageThreads.bulkInsert, { docs }),
    (row, convexId) => {
      if (row.external_thread_id) {
        idMap.messageThreads.set(row.external_thread_id, convexId);
      }
    }
  );
}

async function migrateMessages() {
  // 4 bronnen → 1 messages table. Order: oudste eerst voor proper threading.

  // 1) email_log: outbound emails (Resend-sent)
  await batchMigrate(
    "messages (van email_log)",
    `SELECT * FROM email_log ORDER BY id`,
    (row: any) => {
      const workspaceId = idMap.workspaces.get(row.workspace_id);
      if (!workspaceId) return null;
      return {
        workspaceId,
        contactId: undefined,  // email_log heeft geen contact-link, alleen relatedEntity
        channel: "email" as const,
        direction: "outbound" as const,
        status: row.status ?? "sent",
        externalMessageId: row.resend_id ?? undefined,
        to: row.to,
        from: row.from ?? undefined,
        subject: row.subject ?? undefined,
        body: row.body ?? "",
        htmlBody: row.html_body ?? undefined,
        templateName: row.template_name ?? undefined,
        errorMessage: row.error ?? undefined,
        relatedEntityType: row.related_entity_type ?? undefined,
        relatedEntityId: row.related_entity_id?.toString(),
        metadata: row.metadata ?? undefined,
        sentAt: row.sent_at ? new Date(row.sent_at).getTime() : undefined,
      };
    },
    async (docs) => convex.mutation(internal.migration.messages.bulkInsert, { docs })
  );

  // 2) email_messages: gesynced van IMAP (Gmail/Outlook) — inbound + outbound
  await batchMigrate(
    "messages (van email_messages)",
    `SELECT * FROM email_messages ORDER BY id`,
    (row: any) => {
      // Lookup thread via external_thread_id
      const threadId = row.external_thread_id
        ? idMap.messageThreads.get(row.external_thread_id)
        : undefined;
      return {
        workspaceId: idMap.workspaces.get(row.workspace_id),  // optional
        contactId: idMap.contacts.get(row.contact_id),
        threadId,
        channel: "email" as const,
        direction: row.direction ?? "inbound",
        status: "delivered",
        externalMessageId: row.external_message_id ?? undefined,
        to: row.to_address ?? "",
        from: row.from_address ?? undefined,
        subject: row.subject ?? undefined,
        body: row.body_text ?? "",
        htmlBody: row.body_html ?? undefined,
        sentAt: row.sent_at ? new Date(row.sent_at).getTime() : undefined,
      };
    },
    async (docs) => convex.mutation(internal.migration.messages.bulkInsert, { docs })
  );

  // 3) message_log: SMS + WhatsApp + Messenger (outbound)
  await batchMigrate(
    "messages (van message_log)",
    `SELECT * FROM message_log ORDER BY id`,
    (row: any) => {
      const workspaceId = idMap.workspaces.get(row.workspace_id);
      if (!workspaceId) return null;
      return {
        workspaceId,
        contactId: idMap.contacts.get(row.contact_id),
        channel: row.channel,  // "sms" | "whatsapp" | "messenger"
        direction: "outbound" as const,
        status: row.status ?? "sent",
        externalMessageId: row.external_message_id ?? undefined,
        to: row.to,
        from: row.from ?? undefined,
        body: row.body ?? "",
        mediaUrl: row.media_url ?? undefined,
        mediaType: row.media_type ?? undefined,
        templateName: row.template_name ?? undefined,
        errorMessage: row.error_message ?? undefined,
        sentById: idMap.users.get(row.sent_by_id),
        relatedEntityType: row.related_entity_type ?? undefined,
        relatedEntityId: row.related_entity_id?.toString(),
        metadata: row.metadata ?? undefined,
        sentAt: row.sent_at ? new Date(row.sent_at).getTime() : undefined,
      };
    },
    async (docs) => convex.mutation(internal.migration.messages.bulkInsert, { docs })
  );

  // 4) chat_messages: in-app team chat (apart van conversaties met klanten)
  // → migreer naar `chatMessages` Convex table (eigen tabel, niet messages)
  await batchMigrate(
    "chatMessages",
    `SELECT * FROM chat_messages ORDER BY id`,
    (row: any) => {
      // ...transform met conversationId lookup
      return null;  // implement based on chat_conversations idMap
    },
    async (docs) => convex.mutation(internal.migration.chatMessages.bulkInsert, { docs })
  );
}

// ── META migration ────────────────────────────────────────────────────

async function migrateMetaLeadRaw() {
  await batchMigrate(
    "metaLeadRaw",
    `SELECT * FROM meta_lead_raw ORDER BY id`,
    (row: any) => {
      const orgId = idMap.orgs.get(row.org_id);
      if (!orgId) return null;
      return {
        orgId,
        leadgenId: row.leadgen_id,
        pageId: row.page_id,
        formId: row.form_id ?? undefined,
        adId: row.ad_id ?? undefined,
        adgroupId: row.adgroup_id ?? undefined,
        campaignId: row.campaign_id ?? undefined,
        payload: row.payload,
        fieldData: row.field_data ?? undefined,
        status: row.status,
        contactId: idMap.contacts.get(row.contact_id),
        opportunityId: idMap.opportunities.get(row.opportunity_id),
        errorMessage: row.error_message ?? undefined,
        retryCount: row.retry_count ?? 0,
        fetchedAt: new Date(row.fetched_at).getTime(),
        processingStartedAt: row.processing_started_at
          ? new Date(row.processing_started_at).getTime()
          : undefined,
        processedAt: row.processed_at ? new Date(row.processed_at).getTime() : undefined,
      };
    },
    async (docs) => convex.mutation(internal.migration.metaLeadRaw.bulkInsert, { docs })
  );
}

// ── WORKFLOW migration ────────────────────────────────────────────────

async function migrateWorkflows() {
  await batchMigrate(
    "workflows",
    `SELECT * FROM workflows WHERE deleted_at IS NULL ORDER BY id`,
    (row: any) => {
      const workspaceId = idMap.workspaces.get(row.workspace_id);
      if (!workspaceId) return null;
      // V1 ondersteunt zowel object als array — normaliseren naar array
      let triggerConfig: any[] = [];
      if (row.trigger_config) {
        triggerConfig = Array.isArray(row.trigger_config)
          ? row.trigger_config
          : [row.trigger_config];
      }
      return {
        workspaceId,
        name: row.name,
        description: row.description ?? undefined,
        status: row.status,
        triggerConfig,
        version: row.version ?? 1,
        totalExecutions: row.total_executions ?? 0,
        successfulExecutions: row.successful_executions ?? 0,
        failedExecutions: row.failed_executions ?? 0,
        lastExecutedAt: row.last_executed_at
          ? new Date(row.last_executed_at).getTime()
          : undefined,
        lastEditedById: idMap.users.get(row.last_edited_by_id),
      };
    },
    async (docs) => convex.mutation(internal.migration.workflows.bulkInsert, { docs }),
    (row, convexId) => idMap.workflows.set(row.id, convexId)
  );

  // workflowNodes, workflowEdges, workflowExecutions volgen hetzelfde pattern.
  // Skipping execution_logs in migration (te veel rijen + niet kritisch voor
  // historic data) — laat v1 als read-only archief beschikbaar.
}

// ── Verification queries (post-migration) ──────────────────────────────

async function verify() {
  console.log("\n=== Verification ===");

  // Row-count parity per tabel
  const checks = [
    {
      table: "contacts",
      neonSql: "SELECT COUNT(*)::int n FROM contacts WHERE workspace_id IN (SELECT id FROM workspaces)",
      convexQuery: api.contacts.count,  // implement deze in v2
    },
    {
      table: "messages (alle 4 bronnen samen)",
      neonSql: "SELECT (SELECT COUNT(*) FROM email_log) + (SELECT COUNT(*) FROM email_messages) + (SELECT COUNT(*) FROM message_log) AS n",
      convexQuery: api.messages.count,
    },
    // Add more per table
  ];

  for (const check of checks) {
    const neonRes = await neon.query<{ n: number }>(check.neonSql);
    const convexCount = await convex.query(check.convexQuery, {});
    const match = neonRes.rows[0].n === convexCount;
    console.log(`${match ? "✓" : "✗"} ${check.table}: Neon=${neonRes.rows[0].n}, Convex=${convexCount}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting V1 → V2 migration");
  console.log("Source:", process.env.NEON_DATABASE_URL?.split("@")[1]?.split("/")[0]);
  console.log("Target:", process.env.CONVEX_URL);

  try {
    // FK-order
    await migrateUsers();
    await migrateOrgs();
    // await migrateWorkspaces();
    // await migrateMemberships();
    // await migratePipelines();
    // await migratePipelineStages();
    await migrateContacts();
    // await migrateOpportunities();
    // await migrateOpportunityStageHistory();
    // await migrateNotes();
    // await migrateCustomFieldDefinitions();
    // await migrateCustomFieldValues();
    // await migrateMetaConnections();
    // await migrateMetaPages();
    // await migrateMetaForms();
    await migrateMetaLeadRaw();
    // await migrateLeadAttribution();
    await migrateMessageThreads();
    await migrateMessages();
    await migrateWorkflows();
    // await migrateWorkflowNodes();
    // await migrateWorkflowEdges();
    // ... etc

    await verify();
    console.log("\n✅ Migration complete");
  } catch (err) {
    console.error("\n✗ Migration FAILED:", err);
    process.exit(1);
  } finally {
    await neon.end();
  }
}

main();

/**
 * ════════════════════════════════════════════════════════════════════
 * v2-repo Convex side — internal mutations
 * ════════════════════════════════════════════════════════════════════
 *
 * Per-tabel een internal mutation in v2-repo `convex/migration/`:
 *
 * // v2-repo/convex/migration/contacts.ts
 * import { internalMutation } from "../_generated/server";
 * import { v } from "convex/values";
 *
 * export const bulkInsert = internalMutation({
 *   args: { docs: v.array(v.any()) },  // strict types per tabel
 *   handler: async (ctx, args) => {
 *     const ids: string[] = [];
 *     for (const doc of args.docs) {
 *       // Idempotency check via natural key
 *       const existing = await ctx.db
 *         .query("contacts")
 *         .withIndex("by_workspace_email", q =>
 *           q.eq("workspaceId", doc.workspaceId).eq("email", doc.email)
 *         )
 *         .first();
 *       if (existing) {
 *         ids.push(existing._id);
 *         continue;
 *       }
 *       const id = await ctx.db.insert("contacts", doc);
 *       ids.push(id);
 *     }
 *     return ids;
 *   },
 * });
 *
 * Pattern voor elke tabel. Voor tabellen ZONDER goede natural key (zoals
 * notes, workflows) is `lookupBy: externalLegacyId` een goede fallback —
 * voeg tijdelijk een `legacyId: v.optional(v.string())` field toe in
 * Convex schema during migration, drop later.
 *
 * ════════════════════════════════════════════════════════════════════
 * Operational tips
 * ════════════════════════════════════════════════════════════════════
 *
 * 1. DRY-RUN eerst: run met `--dry-run` flag dat alle transforms doet
 *    maar geen Convex-writes. Print sample-rows + counts.
 *
 * 2. RESUMABLE: bij crash op tabel X, hervat met `--from contacts` etc.
 *    Per-tabel volgordelijst is in main() te zien.
 *
 * 3. CUTOVER procedure:
 *    a. Zet v1 app in read-only mode (toggle een flag of CDN-route)
 *    b. Run final delta-migration (alleen rows met updated_at > vorige run)
 *    c. Switch DNS van wetryleadflow.com naar v2 deployment
 *    d. v1 blijft 30d available op v1.wetryleadflow.com voor read-back
 *
 * 4. ENCRYPTION carry-over: tokens in metaPages.access_token zijn
 *    encrypted in v1 met META_TOKEN_ENCRYPTION_KEY. Bij migratie:
 *    decrypt-then-encrypt met v2-key. Of: hou v1 key in v2 als fallback
 *    voor periode, dan re-encrypt batchwise.
 *
 * 5. STACK AUTH transition: Convex Auth (of Clerk) heeft eigen user-id's.
 *    Tijdens cutover: bij eerste login per user, match op email →
 *    backfill v2 user.externalAuthId met new provider's id. Stuur welcome-
 *    back email met magic-link voor smooth re-onboarding.
 *
 * 6. WORKFLOW state migration: pause alle running v1 executions vóór
 *    cutover (status=paused). Migreer naar v2 ALS YOU WANT, of laat v1
 *    ze afmaken in read-only mode (geen nieuwe triggers). Geen
 *    cross-system execution-state mixing — dat wordt een nachtmerrie.
 *
 * 7. TEST-data: maak een nieuwe test-workspace in Neon met ~10 dummy
 *    contacts + workflows. Migreer eerst alleen die workspace om de
 *    script te valideren. Daarna full Staycool-workspace 12 migration.
 */
