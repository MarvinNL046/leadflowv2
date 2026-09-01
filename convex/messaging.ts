import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getUserId } from "./lib/identity";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizeEmail, normalizePhone } from "./lib/phone";
import { insertContactWithSearchText } from "./lib/contactWrite";

/**
 * Unified messaging — één action `send` met channel-discriminator routes
 * naar Resend (email), Voidfix SMS, of Voidfix WhatsApp Web. Alle outbound
 * landt in `messages` table met status-tracking (pending → sent/failed).
 *
 * V2 MVP-scope (kleiner dan v1):
 * - Geen rate-limiting yet (komt later via @convex-dev/rate-limiter)
 * - Geen inbound webhooks (delivery-receipts/replies) yet
 * - Geen per-org/per-workspace device routing — use platform-defaults
 *   in env (VOIDFIX_SMS_DEVICE_ID). Per-workspace WA session ID kan
 *   later via whatsappWebConfig table.
 * - Geen React Email templates — plain text/HTML body
 * - Geen phone E.164 normalisatie — opgeslagen waarde wordt 1:1 gebruikt
 *
 * Env-vars (set via `npx convex env set`):
 *   RESEND_API_KEY              — email via Resend
 *   EMAIL_FROM                  — default sender (b.v. "LeadFlow <noreply@…>")
 *   VOIDFIX_API_KEY             — shared key voor SMS + WA Voidfix APIs
 *   VOIDFIX_SMS_DEVICE_ID       — platform-default Android device
 *   VOIDFIX_WA_SESSION_ID       — platform-default WA session (optioneel,
 *                                 anders per-workspace via whatsappWebConfig)
 */

const VOIDFIX_SMS_URL = "https://sms.voidfix.com/services/send.php";
const VOIDFIX_WA_URL = "https://wa.voidfix.com/api/external/send-message";
const VOIDFIX_WA_SESSIONS_URL = "https://wa.voidfix.com/api/external/sessions";
const RESEND_URL = "https://api.resend.com/emails";

// ──────────────────────────────────────────────────────────────────────
// MAIN ACTION
// ──────────────────────────────────────────────────────────────────────

export const send = action({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    body: v.string(),
    subject: v.optional(v.string()),  // email only
    htmlBody: v.optional(v.string()), // email only
  },
  handler: async (ctx, args): Promise<{
    messageId: Id<"messages">;
    status: "sent" | "failed";
  }> => {
    // Resolve contact + auth via internal query
    const ctxData = await ctx.runQuery(
      internal.messaging.resolveForSend,
      { contactId: args.contactId, channel: args.channel },
    );
    if ("error" in ctxData) {
      throw new Error(ctxData.error);
    }
    const { contact, workspaceId, userId, recipient } = ctxData;

    // Insert messages-row pending
    const messageId = await ctx.runMutation(
      internal.messaging.insertPending,
      {
        workspaceId,
        contactId: args.contactId,
        channel: args.channel,
        to: recipient,
        body: args.body,
        subject: args.subject,
        htmlBody: args.htmlBody,
        sentById: userId,
      },
    );

    // Channel-specific send
    try {
      let externalId: string | undefined;
      if (args.channel === "email") {
        externalId = await sendViaResend({
          to: recipient,
          subject: args.subject ?? "(geen onderwerp)",
          text: args.body,
          html: args.htmlBody,
        });
      } else if (args.channel === "sms") {
        externalId = await sendViaVoidfixSms({
          to: recipient,
          message: args.body,
        });
      } else {
        externalId = await sendViaVoidfixWa({
          to: recipient,
          message: args.body,
        });
      }

      await ctx.runMutation(internal.messaging.markSent, {
        messageId,
        externalId,
      });
      return { messageId, status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.messaging.markFailed, {
        messageId,
        errorMessage: msg,
      });
      // Re-throw zodat UI toast krijgt
      throw new Error(msg);
    }
  },
});

/**
 * Internal variant — voor systeem-acties (workflow engine, scheduled
 * jobs) die geen user-session hebben. Skipt auth-check; resolve contact
 * direct via internal query. Engine moet zelf zorgen dat contact in
 * verwachte workspace zit.
 */
export const sendInternal = internalAction({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    body: v.string(),
    subject: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    sentById: v.optional(v.id("users")),  // optioneel; nil voor systeem
  },
  handler: async (ctx, args): Promise<{
    messageId: Id<"messages">;
    status: "sent" | "failed";
  }> => {
    const data = await ctx.runQuery(
      internal.messaging.resolveForSendInternal,
      { contactId: args.contactId, channel: args.channel },
    );
    if ("error" in data) {
      throw new Error(data.error);
    }
    const { workspaceId, recipient } = data;

    const messageId = await ctx.runMutation(
      internal.messaging.insertPendingInternal,
      {
        workspaceId,
        contactId: args.contactId,
        channel: args.channel,
        to: recipient,
        body: args.body,
        subject: args.subject,
        htmlBody: args.htmlBody,
        sentById: args.sentById,
      },
    );

    try {
      let externalId: string | undefined;
      if (args.channel === "email") {
        externalId = await sendViaResend({
          to: recipient,
          subject: args.subject ?? "(geen onderwerp)",
          text: args.body,
          html: args.htmlBody,
        });
      } else if (args.channel === "sms") {
        externalId = await sendViaVoidfixSms({
          to: recipient,
          message: args.body,
        });
      } else {
        externalId = await sendViaVoidfixWa({
          to: recipient,
          message: args.body,
        });
      }
      await ctx.runMutation(internal.messaging.markSent, {
        messageId,
        externalId,
      });
      return { messageId, status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.messaging.markFailed, {
        messageId,
        errorMessage: msg,
      });
      throw new Error(msg);
    }
  },
});

// ──────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS — auth + db
// ──────────────────────────────────────────────────────────────────────

export const resolveForSend = internalQuery({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { error: string }
    | {
        contact: Doc<"contacts">;
        workspaceId: Id<"workspaces">;
        userId: Id<"users">;
        recipient: string;
      }
  > => {
    const userId = await getUserId(ctx);
    if (!userId) return { error: "Not authenticated" };

    const contact = await ctx.db.get(args.contactId);
    if (!contact) return { error: "Contact not found" };

    // Membership check
    const workspace = await ctx.db.get(contact.workspaceId);
    if (!workspace) return { error: "Workspace not found" };
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) return { error: "Not a member of this workspace" };

    // Recipient lookup per channel
    let recipient: string | undefined;
    if (args.channel === "email") recipient = contact.email;
    else recipient = contact.phone;  // sms + wa beide phone
    if (!recipient) {
      return {
        error: `Contact heeft geen ${args.channel === "email" ? "email" : "telefoonnummer"}`,
      };
    }

    return {
      contact,
      workspaceId: contact.workspaceId,
      userId,
      recipient,
    };
  },
});

export const insertPending = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    to: v.string(),
    body: v.string(),
    subject: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    sentById: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      channel: args.channel,
      direction: "outbound",
      status: "pending",
      to: args.to,
      body: args.body,
      subject: args.subject,
      htmlBody: args.htmlBody,
      sentById: args.sentById,
    });
  },
});

/** Internal-versie: sentById optioneel (systeem-message zonder user). */
export const insertPendingInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    to: v.string(),
    body: v.string(),
    subject: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    sentById: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      channel: args.channel,
      direction: "outbound",
      status: "pending",
      to: args.to,
      body: args.body,
      subject: args.subject,
      htmlBody: args.htmlBody,
      sentById: args.sentById,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────
// INBOUND WEBHOOKS — delivery-receipts + replies vanaf Resend/Voidfix
// ──────────────────────────────────────────────────────────────────────

/**
 * Markeer alle inbound messages binnen een workspace als gelezen.
 * Voor de "Alles als gelezen markeren"-knop bovenaan /crm/messages.
 *
 * Strategie: vind inbound rows zonder readAt — patch readAt naar nu.
 * Bounded scan: filter via workspace-channel-sent index, dan in-memory
 * filter op direction + readAt. Voor groot volume later sharden via
 * paginate, voor MVP volstaat één pass.
 */
export const markAllRead = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_workspace_channel_sent", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    let marked = 0;
    const now = Date.now();
    for (const m of rows) {
      if (m.direction !== "inbound") continue;
      if (m.readAt !== undefined) continue;
      await ctx.db.patch(m._id, { readAt: now });
      marked++;
    }
    return { marked };
  },
});

/**
 * Markeer alle inkomende ongelezen berichten van één contact als gelezen.
 * Aangeroepen bij het openen van een gesprek (clear het ongelezen-bolletje).
 */
export const markConversationRead = mutation({
  args: { workspaceId: v.id("workspaces"), contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_contact_sent", (q) => q.eq("contactId", args.contactId))
      .collect();

    let marked = 0;
    const now = Date.now();
    for (const m of rows) {
      if (m.workspaceId !== args.workspaceId) continue;
      if (m.direction !== "inbound") continue;
      if (m.readAt !== undefined) continue;
      await ctx.db.patch(m._id, { readAt: now });
      marked++;
    }
    return { marked };
  },
});

/**
 * Update messages-row op externalMessageId match. Voor Resend
 * delivery/bounce events of toekomstige Voidfix delivery-receipts.
 * Silent skip als externalId niet gevonden (campaign-mails van buiten
 * v2 of duplicate events na cleanup).
 */
export const updateStatusByExternalId = internalMutation({
  args: {
    externalMessageId: v.string(),
    newStatus: v.union(
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("bounced"),
      v.literal("read"),
    ),
    deliveredAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) =>
        q.eq("externalMessageId", args.externalMessageId),
      )
      .first();
    if (!msg) return { matched: false, firstRead: false };

    const patch: Record<string, unknown> = { status: args.newStatus };
    // Webhook-events kunnen door elkaar binnenkomen: een (herhaald)
    // delivered-event mag een al-geopende mail niet terugzetten naar
    // "delivered" — dan verdwijnt het "Geopend"-label weer uit de UI.
    if (msg.status === "read" && args.newStatus === "delivered") {
      delete patch.status;
    }
    if (args.deliveredAt !== undefined) patch.deliveredAt = args.deliveredAt;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    // firstRead: alleen de EERSTE open telt (herhaalde opens van dezelfde
    // ontvanger bumpen de broadcast-teller niet nog eens).
    const firstRead = args.newStatus === "read" && msg.readAt === undefined;
    if (firstRead) patch.readAt = Date.now();

    await ctx.db.patch(msg._id, patch);
    return { matched: true, messageId: msg._id, firstRead };
  },
});

/**
 * Record inbound message (reply van klant). Lookup contact via phone
 * binnen workspace. Contact niet gevonden → bewaar message met
 * contactId=undefined zodat Marvin via UI kan koppelen.
 */
export const recordInbound = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    from: v.string(),
    body: v.string(),
    externalMessageId: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaType: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Idempotency: skip als externalId al binnenkwam
    if (args.externalMessageId) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_external_id", (q) =>
          q.eq("externalMessageId", args.externalMessageId),
        )
        .first();
      if (existing) return { duplicate: true, messageId: existing._id };
    }

    // Contact-lookup: gebruik centrale normalisatie zodat input
    // (Voidfix-formats, NL 06-prefix, oud-int 00...) altijd matchet
    // tegen E.164-stored contact phones.
    let contactId: Id<"contacts"> | undefined;
    if (args.channel === "email") {
      const normalized = normalizeEmail(args.from);
      if (normalized) {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("email", normalized),
          )
          .first();
        if (contact) contactId = contact._id;
      }
    } else {
      const normalized = normalizePhone(args.from);
      if (normalized) {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_phone", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("phone", normalized),
          )
          .first();
        if (contact) contactId = contact._id;
      }
    }

    // Geen match → maak een kaal contact zodat het bericht zichtbaar wordt in
    // de inbox (listConversations skipt contactloze messages). GEEN opp /
    // leadAttribution / trigger: een inbound van een onbekende is nog geen
    // gekwalificeerde lead — de gebruiker vult aan / promoot via de contact-UI.
    if (!contactId) {
      if (args.channel === "email") {
        const normalized = normalizeEmail(args.from);
        if (normalized) {
          contactId = await insertContactWithSearchText(ctx, {
            workspaceId: args.workspaceId,
            email: normalized,
            callCount: 0,
          });
        }
      } else {
        const normalized = normalizePhone(args.from);
        if (normalized) {
          contactId = await insertContactWithSearchText(ctx, {
            workspaceId: args.workspaceId,
            phone: normalized,
            callCount: 0,
          });
        }
      }
    }

    const messageId = await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      contactId,
      channel: args.channel,
      direction: "inbound",
      status: "delivered",
      externalMessageId: args.externalMessageId,
      to: "",  // inbound — recipient is wijzelf, leeg laten
      from: args.from,
      body: args.body,
      mediaUrl: args.mediaUrl,
      mediaType: args.mediaType,
      sentAt: args.receivedAt ?? Date.now(),
      deliveredAt: args.receivedAt ?? Date.now(),
    });

    return { matched: !!contactId, messageId };
  },
});

/**
 * Outbound-bericht opslaan vanuit een Voidfix `message.outbound`-webhook
 * (bericht verstuurd vanaf de gekoppelde bedrijfstelefoon, óf een echo van een
 * via-Leadflow verstuurd bericht). Spiegel van recordInbound: contact wordt
 * gezocht op het `to`-nummer (de ontvanger = de lead). Idempotent op
 * externalMessageId → geen dubbele rij voor via-de-API verstuurde berichten.
 */
export const recordOutbound = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
    to: v.string(),
    body: v.string(),
    from: v.optional(v.string()),
    externalMessageId: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaType: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Idempotency: skip als externalId al bestaat (bv. Leadflow stuurde 't zelf
    // via de Voidfix-API → markSent zette dezelfde externalMessageId).
    if (args.externalMessageId) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_external_id", (q) =>
          q.eq("externalMessageId", args.externalMessageId),
        )
        .first();
      if (existing) return { duplicate: true, messageId: existing._id };
    }

    // Contact-lookup op het `to`-nummer (de ontvanger/lead), centrale normalisatie.
    let contactId: Id<"contacts"> | undefined;
    if (args.channel === "email") {
      const normalized = normalizeEmail(args.to);
      if (normalized) {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("email", normalized),
          )
          .first();
        if (contact) contactId = contact._id;
      }
    } else {
      const normalized = normalizePhone(args.to);
      if (normalized) {
        const contact = await ctx.db
          .query("contacts")
          .withIndex("by_workspace_phone", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("phone", normalized),
          )
          .first();
        if (contact) contactId = contact._id;
      }
    }

    // Geen match → kaal contact (zodat het gesprek zichtbaar wordt in de inbox;
    // zoals recordInbound). Geen opp/leadAttribution/trigger.
    if (!contactId) {
      if (args.channel === "email") {
        const normalized = normalizeEmail(args.to);
        if (normalized) {
          contactId = await insertContactWithSearchText(ctx, {
            workspaceId: args.workspaceId,
            email: normalized,
            callCount: 0,
          });
        }
      } else {
        const normalized = normalizePhone(args.to);
        if (normalized) {
          contactId = await insertContactWithSearchText(ctx, {
            workspaceId: args.workspaceId,
            phone: normalized,
            callCount: 0,
          });
        }
      }
    }

    const messageId = await ctx.db.insert("messages", {
      workspaceId: args.workspaceId,
      contactId,
      channel: args.channel,
      direction: "outbound",
      status: "sent",
      externalMessageId: args.externalMessageId,
      to: args.to,
      from: args.from,
      body: args.body,
      mediaUrl: args.mediaUrl,
      mediaType: args.mediaType,
      sentAt: args.sentAt ?? Date.now(),
    });

    return { matched: !!contactId, messageId };
  },
});

/** Internal: Staycool default workspace voor inbound webhooks (MVP single-tenant). */
export const getStaycoolWorkspaceIdInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "staycool"))
      .unique();
    if (!org) return null;
    const ws = await ctx.db
      .query("workspaces")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
    return ws?._id ?? null;
  },
});

/** Auth-loze resolver voor systeem-sends. */
export const resolveForSendInternal = internalQuery({
  args: {
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("email"),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { error: string }
    | { workspaceId: Id<"workspaces">; recipient: string }
  > => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) return { error: "Contact not found" };
    const recipient =
      args.channel === "email" ? contact.email : contact.phone;
    if (!recipient) {
      return {
        error: `Contact heeft geen ${args.channel === "email" ? "email" : "telefoonnummer"}`,
      };
    }
    return { workspaceId: contact.workspaceId, recipient };
  },
});

export const markSent = internalMutation({
  args: {
    messageId: v.id("messages"),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "sent",
      externalMessageId: args.externalId,
      sentAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: {
    messageId: v.id("messages"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "failed",
      errorMessage: args.errorMessage,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────
// LIST messages voor detail-page (later messages-tab)
// ──────────────────────────────────────────────────────────────────────

async function requireMembershipForContact(
  ctx: QueryCtx,
  contactId: Id<"contacts">,
): Promise<void> {
  const userId = await getUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found");
  const workspace = await ctx.db.get(contact.workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", workspace.orgId),
    )
    .first();
  if (!membership) throw new Error("Not a member of this workspace");
}

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    await requireMembershipForContact(ctx, args.contactId);
    return await ctx.db
      .query("messages")
      .withIndex("by_contact_sent", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .take(50);
  },
});

/**
 * Conversations-list voor chat-UI: groepeer messages per contactId,
 * returnt {contactId, contact-info, lastMessage, lastChannel, lastDirection,
 * lastActivity, totalCount, hasUnreadInbound (= laatste = inbound)} per
 * conversation, gesorteerd op lastActivity desc.
 *
 * MVP: pakt laatste 500 messages, groepeert client-side. Voor schaal
 * later: aparte conversations table met denormalized aggregates.
 */
export const listConversations = query({
  args: {
    workspaceId: v.id("workspaces"),
    channel: v.optional(
      v.union(
        v.literal("email"),
        v.literal("sms"),
        v.literal("whatsapp"),
        v.literal("messenger"),
      ),
    ),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");

    // Pak recente messages (500) en groepeer
    const baseQuery = args.channel
      ? ctx.db
          .query("messages")
          .withIndex("by_workspace_channel_sent", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("channel", args.channel!),
          )
      : ctx.db
          .query("messages")
          .withIndex("by_workspace_channel_sent", (q) =>
            q.eq("workspaceId", args.workspaceId),
          );
    const recentMessages = await baseQuery.order("desc").take(500);

    // Groepeer per contactId (skip null contactIds — unassigned messages
    // krijgen aparte sectie later)
    const byContact = new Map<
      Id<"contacts">,
      {
        latestMessage: Doc<"messages">;
        count: number;
      }
    >();
    for (const m of recentMessages) {
      if (!m.contactId) continue;
      const existing = byContact.get(m.contactId);
      if (!existing) {
        byContact.set(m.contactId, { latestMessage: m, count: 1 });
      } else {
        existing.count++;
        // recentMessages is desc gesorteerd, latestMessage is dus al
        // de eerste die we tegenkomen
      }
    }

    // Verrijk met contact-info
    const conversations = await Promise.all(
      Array.from(byContact.entries()).map(async ([contactId, agg]) => {
        const c = await ctx.db.get(contactId);
        if (!c || c.deletedAt !== undefined) return null;
        if (!args.includeArchived && c.messagesArchivedAt != null) return null;
        const m = agg.latestMessage;
        return {
          contactId,
          contactName:
            [c.firstName, c.lastName].filter(Boolean).join(" ") ||
            c.email ||
            c.phone ||
            "Onbekend",
          contactEmail: c.email ?? null,
          contactPhone: c.phone ?? null,
          contactCity: c.city ?? null,
          lastMessageBody: m.body,
          lastMessageSubject: m.subject ?? null,
          lastMessageChannel: m.channel,
          lastMessageDirection: m.direction,
          lastActivity: m.sentAt ?? m._creationTime,
          totalCount: agg.count,
          unread: m.direction === "inbound" && m.readAt === undefined,
          archived: c.messagesArchivedAt != null,
        };
      }),
    );

    return conversations
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.lastActivity - a.lastActivity);
  },
});

export const archiveConversation = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const contact = await ctx.db.get(contactId);
    if (!contact) throw new Error("Contact not found");
    const workspace = await ctx.db.get(contact.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");
    await ctx.db.patch(contactId, { messagesArchivedAt: Date.now() });
  },
});

export const unarchiveConversation = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const contact = await ctx.db.get(contactId);
    if (!contact) throw new Error("Contact not found");
    const workspace = await ctx.db.get(contact.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");
    await ctx.db.patch(contactId, { messagesArchivedAt: undefined });
  },
});

/** Ongelezen-gesprekken per kanaal (laatste bericht inbound + ongelezen),
 *  voor de filter-tab-badges. Respecteert archief/deleted. */
export const inboxUnreadCounts = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return { sms: 0, whatsapp: 0, email: 0, total: 0 };
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) return { sms: 0, whatsapp: 0, email: 0, total: 0 };
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) return { sms: 0, whatsapp: 0, email: 0, total: 0 };

    const counts = { sms: 0, whatsapp: 0, email: 0 };
    for (const channel of ["sms", "whatsapp", "email"] as const) {
      const recent = await ctx.db
        .query("messages")
        .withIndex("by_workspace_channel_sent", (q) =>
          q.eq("workspaceId", workspaceId).eq("channel", channel),
        )
        .order("desc")
        .take(500);
      // recent is desc → eerste per contact = laatste bericht; tel ongelezen inbound.
      const seen = new Set<string>();
      for (const m of recent) {
        if (!m.contactId || seen.has(m.contactId)) continue;
        seen.add(m.contactId);
        if (m.direction === "inbound" && m.readAt === undefined) {
          const c = await ctx.db.get(m.contactId);
          if (c && c.deletedAt === undefined && c.messagesArchivedAt == null) {
            counts[channel]++;
          }
        }
      }
    }
    return { ...counts, total: counts.sms + counts.whatsapp + counts.email };
  },
});

/**
 * Paginated workspace-wide messages voor de /crm/messages inbox.
 * Optionele channel-filter; default = alle kanalen.
 */
export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    channel: v.optional(
      v.union(
        v.literal("email"),
        v.literal("sms"),
        v.literal("whatsapp"),
        v.literal("messenger"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", userId).eq("orgId", workspace.orgId),
      )
      .first();
    if (!membership) throw new Error("Not a member of this workspace");

    const baseQuery = args.channel
      ? ctx.db
          .query("messages")
          .withIndex("by_workspace_channel_sent", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("channel", args.channel!),
          )
      : ctx.db
          .query("messages")
          .withIndex("by_workspace_channel_sent", (q) =>
            q.eq("workspaceId", args.workspaceId),
          );

    const page = await baseQuery.order("desc").paginate(args.paginationOpts);

    // Verrijk met contact-naam per row
    const enriched = await Promise.all(
      page.page.map(async (m) => {
        let contactName: string | null = null;
        if (m.contactId) {
          const c = await ctx.db.get(m.contactId);
          if (c) {
            contactName =
              [c.firstName, c.lastName].filter(Boolean).join(" ") ||
              c.email ||
              c.phone ||
              null;
          }
        }
        return { ...m, contactName };
      }),
    );

    return { ...page, page: enriched };
  },
});

// ──────────────────────────────────────────────────────────────────────
// PROVIDER HELPERS — geen ctx-toegang, pure fetch
// ──────────────────────────────────────────────────────────────────────

async function sendViaResend(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";
  if (!apiKey) throw new Error("RESEND_API_KEY niet geconfigureerd");

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? "";
}

async function sendViaVoidfixSms(args: {
  to: string;
  message: string;
}): Promise<string> {
  // SMS-gateway = sms.voidfix.com/services/send.php (form-urlencoded POST).
  // Eigen API-key (VOIDFIX_SMS_API_SECRET), als `key`-formveld — NIET de
  // WhatsApp X-API-Key. Veldnamen per v1's werkende client: key/number/
  // message/devices/type/prioritize. Response: { success, data: { messages:[{ID}] } }.
  const key = process.env.VOIDFIX_SMS_API_SECRET;
  const devices = process.env.VOIDFIX_SMS_DEVICE_ID;
  if (!key) throw new Error("VOIDFIX_SMS_API_SECRET niet geconfigureerd");
  if (!devices) throw new Error("VOIDFIX_SMS_DEVICE_ID niet geconfigureerd");

  const form = new URLSearchParams();
  form.set("key", key);
  form.set("number", args.to);
  form.set("message", args.message);
  form.set("devices", devices);
  form.set("type", "sms");
  form.set("prioritize", "0");

  const res = await fetch(VOIDFIX_SMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voidfix SMS ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    success?: boolean;
    error?: { message?: string };
    data?: { messages?: Array<{ ID?: string | number }> };
  };
  if (!json.success) {
    throw new Error(`Voidfix SMS: ${json.error?.message ?? "onbekende fout"}`);
  }
  // Voidfix geeft ID als getal terug → markSent verwacht string.
  const id = json.data?.messages?.[0]?.ID;
  return id != null ? String(id) : "";
}

/** Zoekt de actuele verbonden (WORKING) WhatsApp-sessie op bij Voidfix.
 *  Voorkeur voor de in env gehinte sessie (VOIDFIX_WA_SESSION_ID) als die
 *  verbonden is; anders de eerste verbonden sessie. Zo breekt uitgaand niet
 *  meer bij elke QR-(her)koppeling — die maakt telkens een nieuwe sessionId.
 *  (Eén extra GET /sessions per verzending; acceptabel bij dit volume.) */
async function resolveWorkingWaSession(apiKey: string): Promise<string> {
  const hinted = process.env.VOIDFIX_WA_SESSION_ID;
  let sessions: Array<{
    sessionId: string;
    status?: string;
    isConnected?: boolean;
  }> = [];
  try {
    const res = await fetch(VOIDFIX_WA_SESSIONS_URL, {
      headers: { "X-API-Key": apiKey },
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: typeof sessions };
      sessions = data.data ?? [];
    }
  } catch {
    // Lijst onbereikbaar → val hieronder terug op de env-hint.
  }
  const working = sessions.filter(
    (s) => s.isConnected === true && s.status === "WORKING",
  );
  const preferred = working.find((s) => s.sessionId === hinted) ?? working[0];
  if (preferred) return preferred.sessionId;
  if (hinted) return hinted; // fallback: env-hint (lijst onbereikbaar)
  throw new Error(
    "Geen verbonden WhatsApp-sessie bij Voidfix (scan de QR-code opnieuw)",
  );
}

async function sendViaVoidfixWa(args: {
  to: string;
  message: string;
}): Promise<string> {
  const apiKey = process.env.VOIDFIX_API_KEY;
  if (!apiKey) throw new Error("VOIDFIX_API_KEY niet geconfigureerd");
  const sessionId = await resolveWorkingWaSession(apiKey);

  const res = await fetch(VOIDFIX_WA_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId,
      to: args.to,
      message: args.message,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voidfix WA ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { messageId?: string; id?: string };
  return data.messageId ?? data.id ?? "";
}
