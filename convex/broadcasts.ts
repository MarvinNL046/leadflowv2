import {findLegacyReceipt} from './providerRouting';
import {requireWorkspacePermission, type CompanyPermission} from './lib/permissions';
import {loadEmailTransport} from "./companyEmail";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderTemplate, htmlToPlainText, leadTemplateVars } from "./templateRender";
import { signUnsubToken } from "./unsubscribeToken";
import { buildListUnsubHeaders } from "./broadcastsLogic";
import { renderEmailShell } from "./emailShell";
import { dedupeByEmail, isMailable } from "./segmentsLogic";
import { MAX_BATCH_BYTES } from './broadcastDelivery';
import { contactStillMatches } from './segments';

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_SIZE = 20;

async function requireWorkspace(ctx: QueryCtx, workspaceId: Id<"workspaces">, permission: CompanyPermission = 'crm') {
  return (await requireWorkspacePermission(ctx, workspaceId, permission)).userId;
}

const ZERO_STATS = { total: 0, sent: 0, delivered: 0, bounced: 0, unsubscribed: 0, failed: 0 };

// ── Queries ──────────────────────────────────────────────────────────
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db
      .query("broadcasts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return null;
    await requireWorkspace(ctx, b.workspaceId);
    return b;
  },
});

/** Volledig gerenderde mail voor de preview op de campagne-detailpagina:
 *  zelfde shell + template-variabelen als de echte verzending, met
 *  "Voorbeeld" als voornaam en een dode afmeldlink. */
export const previewHtml = query({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return null;
    await requireWorkspace(ctx, b.workspaceId);
    const settings = await ctx.db
      .query("crmSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", b.workspaceId))
      .first();
    const ws = await ctx.db.get(b.workspaceId);
    const org = ws ? await ctx.db.get(ws.orgId) : null;
    const companyName = settings?.companyName ?? org?.name ?? "Uw bedrijf";
    const vars = leadTemplateVars({ firstName: "Voorbeeld", lastName: "" }, companyName);
    const subject = renderTemplate(b.subject, vars);
    return {
      subject,
      html: renderEmailShell(renderTemplate(b.body ?? "", vars), {
        companyName,
        unsubUrl: "#",
        previewText: subject,
      }),
    };
  },
});

/** Ontvangers van een broadcast, gepagineerd, verrijkt met de bezorgstatus
 *  uit de messages-tabel (gevoed door de Resend-webhook): zo toont de
 *  detailpagina per adres verzonden/afgeleverd/gebounced/geopend. */
export const recipientsPage = query({
  args: {
    broadcastId: v.id("broadcasts"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) throw new Error("Broadcast niet gevonden");
    await requireWorkspace(ctx, b.workspaceId);
    const page = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) => q.eq("broadcastId", args.broadcastId))
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, 100),
      });
    const rows = await Promise.all(
      page.page.map(async (r) => {
        let delivery: "delivered" | "bounced" | "read" | "failed" | null = null;
        let bounceReason: string | undefined;
        if (r.externalMessageId !== undefined) {
          const message = await ctx.db
            .query("messages")
            .withIndex("by_external_id", (q) =>
              q.eq("externalMessageId", r.externalMessageId as string),
            )
            .first();
          if (message?.status === "delivered" || message?.status === "bounced" || message?.status === "read" || message?.status === "failed") {
            delivery = message.status;
          }
          if (message?.status === "bounced") {
            bounceReason = message.errorMessage ?? undefined;
          }
        }
        return {
          _id: r._id,
          email: r.email,
          name: [r.firstName, r.lastName].filter(Boolean).join(" "),
          status: r.status,
          delivery,
          bounceReason,
          errorMessage: r.errorMessage,
        };
      }),
    );
    return { ...page, page: rows };
  },
});

// ── Mutations ────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    bodyBlocks: v.optional(v.array(v.any())),
    segmentId: v.id("segments"),
  },
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId, 'manage');
    if (!args.name.trim() || !args.subject.trim() || !args.body.trim()) throw new Error('Vul naam, onderwerp en inhoud in.');
    const segment = await ctx.db.get(args.segmentId);
    if (!segment || segment.workspaceId !== args.workspaceId) throw new Error('Ongeldig segment');
    const id = await ctx.db.insert("broadcasts", {
      workspaceId: args.workspaceId,
      name: args.name,
      subject: args.subject,
      body: args.body,
      bodyBlocks: args.bodyBlocks,
      segmentId: args.segmentId,
      status: "draft",
      stats: ZERO_STATS,
    });
    await ctx.scheduler.runAfter(0, internal.broadcastAudience.refresh, { broadcastId: id });
    return id;
  },
});

export const cancel = mutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return;
    await requireWorkspace(ctx, b.workspaceId, 'manage');
    if (b.status === "scheduled" || b.status === "sending") {
      if (b.scheduledJobId) await ctx.scheduler.cancel(b.scheduledJobId);
      await ctx.db.patch(args.broadcastId, { status: "cancelled" });
    }
  },
});

export const update = mutation({
  args: {
    broadcastId: v.id("broadcasts"), name: v.string(), subject: v.string(),
    body: v.string(), bodyBlocks: v.optional(v.array(v.any())), segmentId: v.id("segments"),
  },
  returns: v.null(),
  handler: async (ctx, { broadcastId, ...fields }) => {
    const b = await ctx.db.get(broadcastId);
    if (!b) throw new Error("Campagne niet gevonden.");
    await requireWorkspace(ctx, b.workspaceId, 'manage');
    if (b.status !== "draft") throw new Error("Zet de campagne eerst terug naar concept.");
    const segment = await ctx.db.get(fields.segmentId);
    if (!segment || segment.workspaceId !== b.workspaceId) throw new Error("Ongeldig segment.");
    if (!fields.name.trim() || !fields.subject.trim() || !fields.body.trim()) throw new Error("Vul naam, onderwerp en inhoud in.");
    await ctx.db.patch(broadcastId, { ...fields, audienceCount: undefined, audienceCountedAt: undefined, audienceRules: undefined });
    await ctx.scheduler.runAfter(0, internal.broadcastAudience.refresh, { broadcastId });
    return null;
  },
});

export const restoreDraft = mutation({
  args: { broadcastId: v.id("broadcasts") },
  returns: v.null(),
  handler: async (ctx, { broadcastId }) => {
    const b = await ctx.db.get(broadcastId);
    if (!b) throw new Error("Campagne niet gevonden.");
    await requireWorkspace(ctx, b.workspaceId, 'manage');
    if (b.status !== "cancelled" && b.status !== "scheduled") throw new Error("Deze campagne kan niet worden hersteld.");
    const recipient = await ctx.db.query("broadcastRecipients")
      .withIndex("by_broadcast_status", q => q.eq("broadcastId", broadcastId)).first();
    if (b.startedAt !== undefined || b.stats.total > 0 || b.stats.sent > 0 || recipient) {
      throw new Error("De verzending is al gestart. Maak een nieuwe campagne om dubbele mails te voorkomen.");
    }
    if (b.scheduledJobId) await ctx.scheduler.cancel(b.scheduledJobId);
    await ctx.db.patch(broadcastId, { status: "draft", scheduledAt: undefined, scheduledJobId: undefined });
    return null;
  },
});

// ── Actions: testmail + verzenden ────────────────────────────────────
export const sendTest = action({
  args: { broadcastId: v.id("broadcasts"), toEmail: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    await ctx.runQuery(internal.broadcasts.assertBroadcastAccess, { broadcastId: args.broadcastId });
    const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId: args.broadcastId });
    if (!b) throw new Error("Broadcast niet gevonden");
    const vars = leadTemplateVars({ firstName: "Test", lastName: "" }, b.companyName);
    const html = renderEmailShell(renderTemplate(b.body ?? "", vars), {
      companyName: b.companyName,
      unsubUrl: "https://example.com/unsubscribe?token=TEST",
      previewText: renderTemplate(b.subject, vars),
    });
    await postBatch([
      {
        from: b.from,
        to: args.toEmail,
        subject: `[TEST] ${renderTemplate(b.subject, vars)}`,
        html,
        text: htmlToPlainText(html),
      },
    ], b.emailApiKey);
    return { ok: true };
  },
});

/** Gedeelde verzendpijplijn (na de status-flip naar "sending"): ontvangers
 *  resolven uit het segment, recipient-rijen schrijven en de eerste batch
 *  inplannen. Gebruikt door sendNow (direct) en runScheduled (ingepland). */
async function runSendPipeline(
  ctx: { runQuery: ActionCtx["runQuery"]; runMutation: ActionCtx["runMutation"]; scheduler: ActionCtx["scheduler"] },
  broadcastId: Id<"broadcasts">,
): Promise<{ total: number }> {
  const b = await ctx.runQuery(internal.broadcasts.loadForSend, { broadcastId });
  if (!b) throw new Error("Broadcast niet gevonden");

  // Stap 1: haal alle ontvangers op via gepagineerde internalQuery
  const seg = await ctx.runQuery(internal.broadcasts.loadSegment, { segmentId: b.segmentId });
  if (!seg) throw new Error("Segment niet gevonden");
  if (seg.workspaceId !== b.workspaceId) throw new Error('Segment hoort niet bij deze workspace');

  const allRecipients: Array<{
    contactId: Id<"contacts">;
    email: string;
    firstName?: string;
    lastName?: string;
  }> = [];
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result: {
      recipients: Array<{ contactId: Id<"contacts">; email: string; firstName?: string; lastName?: string }>;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runQuery(internal.segments.resolvePage, {
      workspaceId: b.workspaceId,
      rules: seg.rules,
      cursor,
      numItems: 200,
    });
    allRecipients.push(...result.recipients);
    cursor = result.continueCursor;
    isDone = result.isDone;
  }

  // Stap 2: dedupe op lowercased email
  const deduped = dedupeByEmail(allRecipients);
  if (!deduped.length) throw new Error("Deze doelgroep bevat geen mailbare ontvangers.");

  // Stap 3: schrijf broadcastRecipients-rijen in chunks van ≤ 500
  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    await ctx.runMutation(internal.broadcasts.addRecipients, {
      broadcastId,
      workspaceId: b.workspaceId,
      rows: deduped.slice(i, i + CHUNK),
    });
  }

  // Stap 4: sla totaal op en plan eerste batch in
  await ctx.runMutation(internal.broadcasts.setTotal, {
    broadcastId,
    total: deduped.length,
  });
  return { total: deduped.length };
}

export const sendNow = action({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args): Promise<{ total: number }> => {
    await ctx.runQuery(internal.broadcasts.assertBroadcastAccess, { broadcastId: args.broadcastId });

    // Fix 1: atomic draft-guard — flip status draft→sending before doing any work.
    // A second call (double-click, scheduler retry) sees status != "draft" and aborts.
    const begin = await ctx.runMutation(internal.broadcasts.beginSend, {
      broadcastId: args.broadcastId,
    });
    if (!begin.started) throw new Error("Deze broadcast is al gestart of verzonden.");

    try {
      return await runSendPipeline(ctx, args.broadcastId);
    } catch (err) {
      // A partially prepared audience must not be restarted as a fresh campaign.
      await ctx.runMutation(internal.broadcasts.resetToDraft, { broadcastId: args.broadcastId });
      throw err;
    }
  },
});

// ── Inplannen ────────────────────────────────────────────────────────

/** Plan een concept-broadcast in voor een later verzendmoment. De flip
 *  draft→scheduled gebeurt hier atomisch; op het gekozen tijdstip start
 *  runScheduled de gewone pijplijn. Annuleren kan tot het moment zelf via
 *  de bestaande cancel-mutatie (runScheduled controleert de status). */
export const schedule = mutation({
  args: { broadcastId: v.id("broadcasts"), scheduledAt: v.number() },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) throw new Error("Broadcast niet gevonden");
    await requireWorkspace(ctx, b.workspaceId, 'manage');
    if (b.status !== "draft" && b.status !== "scheduled") {
      throw new Error("Alleen een concept of ingeplande campagne kan worden ingepland.");
    }
    if (!Number.isFinite(args.scheduledAt) || args.scheduledAt <= Date.now()) {
      throw new Error("Kies een moment in de toekomst.");
    }
    if (b.scheduledJobId) await ctx.scheduler.cancel(b.scheduledJobId);
    await ctx.scheduler.runAfter(0, internal.broadcastAudience.refresh, { broadcastId: b._id });
    const scheduledJobId = await ctx.scheduler.runAt(args.scheduledAt, internal.broadcasts.runScheduled, {
      broadcastId: args.broadcastId,
      scheduledAt: args.scheduledAt,
    });
    await ctx.db.patch(args.broadcastId, { status: "scheduled", scheduledAt: args.scheduledAt, scheduledJobId });
  },
});

/** Atomische guard voor de ingeplande start (scheduled→sending). Een
 *  geannuleerde of al gestarte broadcast geeft { started: false }. */
export const beginScheduledSend = internalMutation({
  args: { broadcastId: v.id("broadcasts"), scheduledAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return { started: false as const };
    if (b.status !== "scheduled") return { started: false as const };
    // Legacy jobs have no timestamp: they must still respect the current slot.
    if (b.scheduledAt === undefined || b.scheduledAt > Date.now()) return { started: false as const };
    if (args.scheduledAt !== undefined && args.scheduledAt !== b.scheduledAt) return { started: false as const };
    await ctx.db.patch(args.broadcastId, { status: "sending", startedAt: Date.now(), recipientsReady: false });
    return { started: true as const };
  },
});

/** Door de scheduler afgevuurd op scheduledAt. Geen auth (system-scheduled,
 *  zelfde model als runBatch); de autorisatie zat op de schedule-mutatie. */
export const runScheduled = internalAction({
  args: { broadcastId: v.id("broadcasts"), scheduledAt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const begin = await ctx.runMutation(internal.broadcasts.beginScheduledSend, {
      broadcastId: args.broadcastId,
      scheduledAt: args.scheduledAt,
    });
    if (!begin.started) return; // geannuleerd of al gestart — stil stoppen
    try {
      await runSendPipeline(ctx, args.broadcastId);
    } catch (err) {
      console.error(`[runScheduled] broadcast ${args.broadcastId}:`, err);
      await ctx.runMutation(internal.broadcasts.preparationFailed, { broadcastId: args.broadcastId, error: err instanceof Error ? err.message : 'Voorbereiden van de verzendlijst mislukt.' });
    }
  },
});

// ── Internal: orchestratie ───────────────────────────────────────────

/** Auth-gate voor publieke broadcast-acties: verifieert dat de aanroeper lid
 *  is van de workspace van deze broadcast. Auth propageert via ctx.runQuery
 *  vanuit de action. runBatch (system-scheduled) gebruikt dit NIET. */
export const assertBroadcastAccess = internalQuery({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) throw new Error("Broadcast niet gevonden");
    await requireWorkspace(ctx, b.workspaceId, 'manage');
    return null;
  },
});

export const loadForSend = internalQuery({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return null;
    const transport=await loadEmailTransport(ctx,b.workspaceId);
    const settings = await ctx.db
      .query("crmSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", b.workspaceId))
      .first();
    const ws = await ctx.db.get(b.workspaceId);
    const org = ws ? await ctx.db.get(ws.orgId) : null;
    const companyName = settings?.companyName ?? org?.name ?? "Uw bedrijf";
    // Afzender-adres komt uit EMAIL_FROM (gedeelde, in Resend geverifieerde
    // sender). Bevat het transport al een display-naam ("Naam <addr>") dan gebruiken
    // we die ongewijzigd; bij een kaal adres zetten we de workspace-bedrijfsnaam
    // ervoor → per-tenant afzender-naam zonder per-workspace config.
    const fromAddress = transport.from;
    const from = fromAddress.includes("<")
      ? fromAddress
      : `${companyName} <${fromAddress}>`;
    return {
      ...b,
      companyName,
      from,
      emailApiKey:transport.apiKey,
      emailConnectionId:transport.connectionId,
    };
  },
});

export const loadSegment = internalQuery({
  args: { segmentId: v.id("segments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.segmentId);
  },
});

/** Reset een broadcast van "sending" terug naar "draft" als sendNow-setup
 *  mislukt. Zo kan de gebruiker de broadcast opnieuw proberen te verzenden. */
export const resetToDraft = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b && b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "failed", lastError: 'Voorbereiden van de verzendlijst is afgebroken. Controleer de ontvangers voordat u hervat.' });
    }
  },
});

/** Fix 1: Atomische draft-guard. Leest en flipt status in één transactie.
 *  Geeft { started: false } als broadcast niet in "draft" staat — zodat
 *  een tweede aanroep (double-click, scheduler-retry) altijd veilig stopt. */
export const beginSend = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return { started: false as const };
    if (b.status !== "draft") return { started: false as const };
    await ctx.db.patch(args.broadcastId, { status: "sending", startedAt: Date.now(), recipientsReady: false });
    return { started: true as const };
  },
});

/** Sla het totale aantal ontvangers op nadat addRecipients klaar is.
 *  Status is al "sending" (gezet door beginSend). */
export const setTotal = internalMutation({
  args: { broadcastId: v.id("broadcasts"), total: v.number() },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return;
    await ctx.db.patch(args.broadcastId, { stats: { ...b.stats, total: args.total }, recipientsReady: true, lastActivityAt: Date.now() });
    if (b.status === 'sending') await ctx.scheduler.runAfter(0, internal.broadcasts.runBatch, { broadcastId: b._id });
  },
});

/** Schrijf een chunk broadcastRecipients-rijen (status: pending). */
export const addRecipients = internalMutation({
  args: {
    broadcastId: v.id("broadcasts"),
    workspaceId: v.id("workspaces"),
    rows: v.array(v.object({
      contactId: v.id("contacts"),
      email: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const broadcast = await ctx.db.get(args.broadcastId);
    if (!broadcast || broadcast.status !== 'sending' || broadcast.workspaceId !== args.workspaceId) throw new Error('Campagne is niet actief.');
    for (const r of args.rows) {
      const existing = await ctx.db.query('broadcastRecipients').withIndex('by_broadcast_contact', q => q.eq('broadcastId', args.broadcastId).eq('contactId', r.contactId)).first();
      if (existing) continue;
      await ctx.db.insert("broadcastRecipients", {
        broadcastId: args.broadcastId,
        workspaceId: args.workspaceId,
        contactId: r.contactId,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        status: "pending",
      });
    }
  },
});

// FASE-1 LIMITATION: als de runBatch-action crasht ná claimBatch maar vóór recordSends,
// blijven die rijen op status "sending" staan (at-most-once: niet opnieuw verzonden — de
// veilige richting voor e-mail). Geen auto-recovery cron in fase 1; handmatige hervatting
// of een toekomstige sweep die "sending"-rijen ouder dan N min terugzet naar "pending".

/** Fix 2b: Atomic claim — leest pending-rijen EN flipt ze naar "sending" in
 *  één mutatie. Twee gelijktijdige runBatch-aanroepen kunnen dezelfde rijen
 *  NOOIT allebei claimen: de tweede ziet ze al als "sending" en slaat ze over. */
export const claimBatch = internalMutation({
  args: { broadcastId: v.id("broadcasts"), limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) =>
        q.eq("broadcastId", args.broadcastId).eq("status", "pending"),
      )
      .take(args.limit);
    for (const r of rows) {
      await ctx.db.patch(r._id, { status: "sending" });
    }
    return rows.map((r) => ({
      _id: r._id,
      contactId: r.contactId,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
    }));
  },
});

export const recordSends = internalMutation({
  args: {
    broadcastId: v.id("broadcasts"),
    workspaceId: v.id("workspaces"),
    emailConnectionId:v.optional(v.id("companyEmailConnections")),
    subject: v.string(),
    sends: v.array(
      v.object({
        recipientId: v.id("broadcastRecipients"),
        contactId: v.id("contacts"),
        to: v.string(),
        externalMessageId: v.optional(v.string()),
        failed: v.boolean(),
        errorMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let sent = 0;
    let failed = 0;
    for (const s of args.sends) {
      const recipient = await ctx.db.get(s.recipientId);
      if (!recipient || recipient.broadcastId !== args.broadcastId || recipient.workspaceId !== args.workspaceId || recipient.status !== 'sending') continue;
      // Patch de broadcastRecipients-rij (sending → sent/failed)
      await ctx.db.patch(s.recipientId, {
        status: s.failed ? "failed" : "sent",
        externalMessageId: s.externalMessageId,
        errorMessage: s.errorMessage,
      });
      // Insert messages-rij (VERPLICHT: Resend-webhook gebruikt by_external_id)
      await ctx.db.insert("messages", {
        workspaceId: args.workspaceId,
        emailConnectionId:args.emailConnectionId,
        contactId: s.contactId,
        channel: "email",
        direction: "outbound",
        status: s.failed ? "failed" : "sent",
        externalMessageId: s.externalMessageId,
        to: s.to,
        subject: args.subject,
        body: "",
        relatedEntityType: "broadcast",
        relatedEntityId: args.broadcastId as string,
        sentAt: s.failed ? undefined : Date.now(),
        errorMessage: s.errorMessage,
      });
      if (s.failed) failed++;
      else sent++;
    }
    const b = await ctx.db.get(args.broadcastId);
    if (b) {
      await ctx.db.patch(args.broadcastId, {
        stats: { ...b.stats, sent: b.stats.sent + sent, failed: b.stats.failed + failed },
      });
    }
  },
});

export const finishSending = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b || b.status !== "sending") return;
    if (b.recipientsReady === false) return;
    // Guard: finaliseer de broadcast pas als er GEEN "pending" én GEEN "sending"
    // ontvangers meer zijn. In-flight "sending"-rijen (batch crashte na claimBatch
    // maar vóór recordSends) voorkomen premature afsluiting.
    const stillPending = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) =>
        q.eq("broadcastId", args.broadcastId).eq("status", "pending"),
      )
      .first();
    const stillSending = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) =>
        q.eq("broadcastId", args.broadcastId).eq("status", "sending"),
      )
      .first();
    if (stillPending || stillSending) return; // niet finaliseren zolang er werk in-flight is
    await ctx.db.patch(args.broadcastId, { status: "sent", completedAt: Date.now(), lastActivityAt: Date.now(), lastError: undefined });
  },
});

export const markFailed = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b && b.status === "sending") {
      await ctx.db.patch(args.broadcastId, { status: "failed", completedAt: Date.now() });
    }
  },
});

export const bumpStatFromExternalId = internalMutation({
  args: {
    externalMessageId: v.string(),
    field: v.union(
      v.literal("delivered"),
      v.literal("bounced"),
      v.literal("unsubscribed"),
      v.literal("opened"),
    ),
  },
  handler: async (ctx, args) => {
    const message = await findLegacyReceipt(ctx,args.externalMessageId,'email');
    if (!message || message.relatedEntityType !== "broadcast" || !message.relatedEntityId) return;
    const b = await ctx.db.get(message.relatedEntityId as Id<"broadcasts">);
    if (!b || b.workspaceId!==message.workspaceId) return;
    await ctx.db.patch(b._id, {
      stats: { ...b.stats, [args.field]: (b.stats[args.field] ?? 0) + 1 },
    });
  },
});

/** Prepare first, then atomically persist the request, claim rows and schedule delivery. */
export const runBatch = internalAction({
  args: { broadcastId: v.id("broadcasts") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      const b = await ctx.runQuery(internal.broadcasts.loadForSend, args);
      if (!b || b.status !== 'sending') return null;
      const pending = await ctx.runMutation(internal.broadcasts.pendingForPreparation, args);
      if (!pending.length) {
        await ctx.runMutation(internal.broadcasts.finishSending, args);
        return null;
      }
      const siteUrl = process.env.CONVEX_SITE_URL;
      if (!siteUrl) throw new Error('Afmeldadres ontbreekt.');
      const payload = [];
      const recipientIds = [];
      for (const r of pending) {
        const token = await signUnsubToken(String(r.contactId));
        const unsubUrl = siteUrl + '/unsubscribe?token=' + token;
        const vars = leadTemplateVars({ firstName: r.firstName ?? '', lastName: r.lastName ?? '' }, b.companyName);
        const subject = renderTemplate(b.subject, vars);
        const html = renderEmailShell(renderTemplate(b.body ?? '', vars), { companyName: b.companyName, unsubUrl, previewText: subject });
        const email = { from: b.from, to: r.email.trim(), subject, html, text: htmlToPlainText(html), headers: buildListUnsubHeaders(unsubUrl) };
        if (new TextEncoder().encode(JSON.stringify([...payload, email])).length > MAX_BATCH_BYTES) {
          if (!payload.length) throw new Error('De mail is te groot. Verklein de inhoud of afbeeldingen.');
          break;
        }
        payload.push(email);
        recipientIds.push(r._id);
      }
      await ctx.runMutation(internal.broadcastDelivery.enqueue, { broadcastId: b._id, recipientIds, payload: JSON.stringify(payload), emailConnectionId: b.emailConnectionId });
    } catch (err) {
      await ctx.runMutation(internal.broadcasts.preparationFailed, { broadcastId: args.broadcastId, error: err instanceof Error ? err.message : 'Mail voorbereiden mislukt.' });
    }
    return null;
  },
});

export const preparationFailed = internalMutation({
  args: { broadcastId: v.id('broadcasts'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (b?.status === 'sending') await ctx.db.patch(b._id, { status: 'failed', lastError: args.error.slice(0, 400), lastActivityAt: Date.now() });
    return null;
  },
});

export const pendingForPreparation = internalMutation({
  args: { broadcastId: v.id('broadcasts') },
  returns: v.array(v.object({ _id: v.id('broadcastRecipients'), contactId: v.id('contacts'), email: v.string(), firstName: v.optional(v.string()), lastName: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b || b.status !== 'sending') return [];
    const segment = await ctx.db.get(b.segmentId);
    if (!segment || segment.workspaceId !== b.workspaceId) throw new Error('Doelgroep ontbreekt. Controleer de campagne.');
    const rows = await ctx.db.query('broadcastRecipients').withIndex('by_broadcast_status', q => q.eq('broadcastId', args.broadcastId).eq('status', 'pending')).take(BATCH_SIZE);
    const eligible = [];
    let failed = 0;
    for (const r of rows) {
      const c = await ctx.db.get(r.contactId);
      if (!c || c.workspaceId !== b.workspaceId || c.deletedAt || !isMailable(c) || c.email?.trim().toLowerCase() !== r.email.trim().toLowerCase() || !(await contactStillMatches(ctx, c, segment.rules))) {
        await ctx.db.patch(r._id, { status: 'failed', errorMessage: 'Overgeslagen: niet meer mailbaar of niet meer in deze doelgroep.' });
        failed++;
      } else eligible.push(r);
    }
    if (failed) await ctx.db.patch(b._id, { stats: { ...b.stats, failed: b.stats.failed + failed } });
    if (!eligible.length && rows.length) await ctx.scheduler.runAfter(10_000, internal.broadcasts.runBatch, args);
    return eligible.map(r => ({ _id: r._id, contactId: r.contactId, email: r.email, firstName: r.firstName, lastName: r.lastName }));
  },
});

/** Eenmalige backfill van stats.opened voor een al-verzonden broadcast:
 *  telt de messages met readAt (unieke opens) via de ontvangerslijst.
 *  Idempotent — zet de teller absoluut, bumpt niet. */
export const backfillOpenedStat = internalMutation({
  args: { broadcastId: v.id("broadcasts") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.broadcastId);
    if (!b) return { opened: 0 };
    const recipients = await ctx.db
      .query("broadcastRecipients")
      .withIndex("by_broadcast_status", (q) => q.eq("broadcastId", args.broadcastId))
      .collect();
    let opened = 0;
    for (const r of recipients) {
      if (!r.externalMessageId) continue;
      const msg = await ctx.db
        .query("messages")
        .withIndex("by_external_id", (q) => q.eq("externalMessageId", r.externalMessageId))
        .first();
      if (msg?.readAt !== undefined) opened++;
    }
    await ctx.db.patch(args.broadcastId, { stats: { ...b.stats, opened } });
    return { opened };
  },
});

/** Vangnet-cron (na het mail-2-incident van 1 sep 2026): Convex herstart
 *  gecrashte scheduled actions niet, dus één runtime-fout in runBatch laat
 *  de hele keten stilvallen terwijl de broadcast op "sending" blijft staan.
 *  Deze sweep her-antrapt de keten alleen als er (a) nog pending-ontvangers
 *  zijn én (b) geen runBatch meer ingepland/onderweg is — claimBatch is
 *  atomisch, dus een her-aantrap kan nooit dubbel verzenden. Rijen die op
 *  "sending" blijven hangen (mogelijk wél bij Resend bezorgd) worden bewust
 *  NIET teruggezet naar pending: dat blijft handwerk met een Resend-check,
 *  de veilige richting voor e-mail. We loggen ze alleen. */
export const sweepStalledBroadcasts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const sending = await ctx.db.query('broadcasts').withIndex('by_status', q => q.eq('status', 'sending')).take(100);
    for (const b of sending) {
      if (Date.now() - (b.lastActivityAt ?? b.startedAt ?? Date.now()) < 12 * 60_000) continue;
      // Never send a partially materialized audience from an interrupted preparation.
      if (b.recipientsReady === false || (b.recipientsReady === undefined && b.stats.total === 0)) {
        await ctx.db.patch(b._id, { status: 'failed', lastError: 'Verzendlijst niet volledig voorbereid. Controle nodig.' });
        continue;
      }
      const pending = await ctx.db.query('broadcastRecipients').withIndex('by_broadcast_status', q => q.eq('broadcastId', b._id).eq('status', 'pending')).first();
      if (pending) await ctx.scheduler.runAfter(0, internal.broadcasts.runBatch, { broadcastId: b._id });
      else {
        const stuck = await ctx.db.query('broadcastRecipients').withIndex('by_broadcast_status', q => q.eq('broadcastId', b._id).eq('status', 'sending')).first();
        if (stuck) await ctx.db.patch(b._id, { lastError: 'Er zijn ontvangers zonder verzendbevestiging. Controleer de batches; oude verzendingen worden niet automatisch herhaald.' });
        else await ctx.scheduler.runAfter(0, internal.broadcasts.finishSending, { broadcastId: b._id });
      }
    }
    return null;
  },
});

// ── Resend batch-helper ──────────────────────────────────────────────
async function postBatch(
  emails: Array<{
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
  }>,
  apiKey: string,
): Promise<Array<{ id?: string }>> {
  if (!apiKey) throw new Error("RESEND_API_KEY niet geconfigureerd");
  const res = await fetch(RESEND_BATCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend batch ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    if (!Array.isArray(data.data) || data.data.length !== emails.length || data.data.some(item => !item.id)) throw new Error('Incomplete confirmation');
    return data.data;
  } catch {
    throw new Error('Resend heeft de testmail mogelijk verzonden, maar de bevestiging ontbreekt. Controleer Resend voordat u opnieuw test.');
  }
}
