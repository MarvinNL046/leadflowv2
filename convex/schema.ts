/**
 * V2 Convex Schema — afgeleid van V1 Drizzle schema voor LeadFlow rebuild.
 *
 * Scope per feature-usage-audit.md: ~45 tables van ~110 in v1.
 * Skipped: invoicing, email campaigns, marketplace_*, conversation_ai_*,
 * Mia AI Control Room, support tickets, Google Business, Twilio legacy,
 * calendar, landing pages, gamification.
 *
 * Belangrijke simplifications vs v1:
 *  - 4 messaging tables (email_log + email_messages + email_threads +
 *    message_log) → 1 `messages` table met channel enum + optional
 *    `threads` table voor email-conversaties.
 *  - `outbox_events` weg — Convex scheduler + real-time queries doen
 *    hetzelfde patroon native.
 *  - `cron_job_*`, `webhook_deliveries`, `webhook_endpoints` weg —
 *    Convex retry built-in.
 *  - `workspace_snapshots` weg — Convex heeft eigen backups.
 *
 * Pas dit ID-type-pattern aan op je Convex-installatie:
 *   - `v.id("contacts")` voor cross-references binnen Convex
 *   - `v.string()` voor external IDs (Meta leadgen_id, Voidfix message-id)
 *
 * Marketplace-tabellen zijn opgenomen per Marvin's beslissing
 * (productvisie, ook al 0 customers nu).
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  marketplaceLeadScore,
  marketplaceNiche,
  marketplaceSegment,
  marketplaceServiceType,
} from "./marketplace/types";

export default defineSchema({
  // ════════════════════════════════════════════════════════════════════
  // CONVEX AUTH — built-in tables (users, authSessions, authAccounts,
  // authRefreshTokens, authVerificationCodes, authVerifiers,
  // authRateLimits). authTables.users heeft email + name + image + phone
  // + verificationTimes. Niet zelf overschrijven.
  // ════════════════════════════════════════════════════════════════════
  ...authTables,

  // ════════════════════════════════════════════════════════════════════
  // APP-LEVEL USER PROFILE — extra velden die niet in authTables.users
  // passen (locale-voorkeur, Staycool super-admin flag). FK naar
  // authTables.users (v.id("users")). 1:1 relatie; rij wordt aangemaakt
  // bij eerste sign-in via een getOrCreateUserProfile mutation.
  // firstName/lastName ook hier: authTables.users heeft alleen `name`
  // als single string, wij willen split fields voor i18n + sortering.
  // ════════════════════════════════════════════════════════════════════
  userProfiles: defineTable({
    userId: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    locale: v.union(v.literal("en"), v.literal("nl")),
    isSuperAdmin: v.boolean(),
    lastLoginAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  orgs: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    // Plan/billing — koppel later aan Stripe; in v1 was er client_subscriptions
    plan: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    // Marketplace access gate — true enables /feed routes + marketplace API.
    // v1: orgs.marketplace_enabled (default false). undefined === false.
    marketplaceEnabled: v.optional(v.boolean()),
  }).index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  workspaces: defineTable({
    orgId: v.id("orgs"),
    name: v.string(),
    isDefault: v.boolean(),
  }).index("by_org", ["orgId"]),

  memberships: defineTable({
    userId: v.id("users"),
    orgId: v.id("orgs"),
    workspaceId: v.optional(v.id("workspaces")),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  }).index("by_user_org", ["userId", "orgId"])
    .index("by_org", ["orgId"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    keys: v.object({ p256dh: v.string(), auth: v.string() }),
    userAgent: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  notifications: defineTable({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    isRead: v.boolean(),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_user_unread", ["userId", "isRead"])
    .index("by_workspace", ["workspaceId"])
    .index("by_legacyId", ["legacyId"]),

  // ════════════════════════════════════════════════════════════════════
  // CRM CORE
  // ════════════════════════════════════════════════════════════════════

  contacts: defineTable({
    workspaceId: v.id("workspaces"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    position: v.optional(v.string()),
    // Address
    street: v.optional(v.string()),
    houseNumber: v.optional(v.string()),
    houseNumberAddition: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    city: v.optional(v.string()),
    province: v.optional(v.string()),
    country: v.optional(v.string()),
    // Messenger identifiers
    messengerPsid: v.optional(v.string()),
    messengerPageId: v.optional(v.string()),
    // Tracking
    callCount: v.number(),
    lastCallAt: v.optional(v.number()),
    lastCallResult: v.optional(v.string()),
    nextFollowUpAt: v.optional(v.number()),
    // Tags as comma-separated of in een aparte tags-tabel — keuze
    tags: v.optional(v.array(v.string())),
    // Source flags
    outsideArea: v.optional(v.boolean()),
    // Onbereikbaar na 3x niet opnemen — verbergt uit nieuwe-leads
    // dashboard. Lead blijft zichtbaar in Contacts-lijst voor handmatige
    // heropening (reset bij stage-drag terug naar Lead).
    unreachable: v.optional(v.boolean()),
    // ── Marketing-consent (e-mail module). Afwezig = subscribed (impliciete
    // opt-in: contact zocht zelf contact). cleaned = harde bounce/spam-klacht.
    emailMarketingStatus: v.optional(
      v.union(
        v.literal("subscribed"),
        v.literal("unsubscribed"),
        v.literal("cleaned"),
      ),
    ),
    marketingUnsubscribedAt: v.optional(v.number()),
    marketingUnsubscribedReason: v.optional(
      v.union(
        v.literal("user"),
        v.literal("bounced"),
        v.literal("complained"),
        v.literal("manual"),
      ),
    ),
    externalId: v.optional(v.string()),
    // Soft-delete: timestamp van verwijdering, of undefined als actief.
    // Filter in alle list-queries; child-data (notes, messages,
    // attribution) blijven bestaan voor audit-trail.
    deletedAt: v.optional(v.number()),
    // Gesprek-archief voor de inbox: timestamp = gearchiveerd (verbergen uit
    // listConversations), undefined = actief. Reversibel; raakt opp/dashboard niet.
    messagesArchivedAt: v.optional(v.number()),
    // Migration breadcrumb: integer-id van de bron-row in v1 Neon.
    // Idempotency-key voor de Neon→Convex ETL; rerun van migratie
    // detecteert bestaande row en doet patch i.p.v. duplicate insert.
    // Mag eventueel later weg na cutover (geen runtime-gebruik).
    legacyContactId: v.optional(v.number()),
  }).index("by_workspace_created", ["workspaceId"])
    .index("by_workspace_email", ["workspaceId", "email"])
    .index("by_workspace_phone", ["workspaceId", "phone"])
    .index("by_messengerPsid", ["messengerPsid"])
    .index("by_legacyContactId", ["legacyContactId"])
    // Voor de follow-up-cron: due-leads efficiënt vinden (range op
    // nextFollowUpAt binnen workspace).
    .index("by_workspace_nextFollowUp", ["workspaceId", "nextFollowUpAt"])
    .index("by_workspace_marketingStatus", ["workspaceId", "emailMarketingStatus"]),

  pipelines: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    isDefault: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

  pipelineStages: defineTable({
    pipelineId: v.id("pipelines"),
    name: v.string(),
    order: v.number(),
    color: v.optional(v.string()),
    isWonStage: v.boolean(),
    isLostStage: v.boolean(),
    // true = follow-up-cron zet opps in deze stage NIET auto terug naar Nieuw
    // (bv. "Afspraak Ingepland"). Leeg/false = huidig gedrag.
    noResurface: v.optional(v.boolean()),
    /** Per-stage retry-interval (dagen tot volgende belpoging na "Niet bereikt").
     * Afwezig = workspace-default (crmSettings.defaultFollowUpDays). */
    followUpDays: v.optional(v.number()),
  }).index("by_pipeline_order", ["pipelineId", "order"]),

  opportunities: defineTable({
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    pipelineId: v.id("pipelines"),
    stageId: v.id("pipelineStages"),
    title: v.string(),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    expectedCloseDate: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    closedReason: v.optional(v.string()),
    assignedToId: v.optional(v.id("users")),
    description: v.optional(v.string()),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_workspace_stage", ["workspaceId", "stageId"])
    .index("by_contact", ["contactId"])
    .index("by_assignedTo", ["assignedToId"])
    .index("by_legacyId", ["legacyId"]),

  opportunityStageHistory: defineTable({
    opportunityId: v.id("opportunities"),
    fromStageId: v.optional(v.id("pipelineStages")),
    toStageId: v.id("pipelineStages"),
    changedById: v.optional(v.id("users")),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_opportunity", ["opportunityId"])
    .index("by_legacyId", ["legacyId"]),

  notes: defineTable({
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    body: v.string(),
    createdById: v.optional(v.id("users")),
    isPinned: v.optional(v.boolean()),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_contact", ["contactId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_legacyId", ["legacyId"]),

  customFieldDefinitions: defineTable({
    workspaceId: v.id("workspaces"),
    entityType: v.union(v.literal("contact"), v.literal("opportunity")),
    key: v.string(),
    label: v.string(),
    fieldType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("date"),
      v.literal("select")
    ),
    selectOptions: v.optional(v.array(v.string())),
    isRequired: v.boolean(),
    sortOrder: v.number(),
    /** true = handmatig veld (settings-CRUD); leeg/false = Meta-form-veld. */
    isManual: v.optional(v.boolean()),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_workspace_entity", ["workspaceId", "entityType"])
    .index("by_legacyId", ["legacyId"]),

  customFieldValues: defineTable({
    definitionId: v.id("customFieldDefinitions"),
    entityType: v.union(v.literal("contact"), v.literal("opportunity")),
    entityId: v.string(),  // contact or opportunity id as string for cross-table use
    value: v.any(),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_entity", ["entityType", "entityId"])
    .index("by_definition", ["definitionId"])
    .index("by_legacyId", ["legacyId"]),

  crmSettings: defineTable({
    workspaceId: v.id("workspaces"),
    timezone: v.string(),
    businessHours: v.optional(v.any()),
    leadAssignmentStrategy: v.optional(v.string()),
    /** Aantal dagen tussen "Niet bereikt"-pogingen (default 2). */
    defaultFollowUpDays: v.optional(v.number()),
    /** 3-strike threshold: max belpogingen voor lead → Verloren (default 3). */
    maxCallAttempts: v.optional(v.number()),
    /** Dagen vóór follow_up_due trigger vuurt na "Niet bereikt" (default 2). */
    followUpReminderDays: v.optional(v.number()),
    /** Terugbel-knoppen in de lead-dialog (leeg = standaardlijst). */
    callbackPresets: v.optional(
      v.array(v.object({ days: v.number(), label: v.string() })),
    ),
    /** Safety-net dagen voor "klant belt zelf terug" (default 7). */
    customerCallbackDays: v.optional(v.number()),
    /** true = auto-afscheidsmail bij 3-strike-onbereikbaar (default false). */
    sendEmailOnUnreachable: v.optional(v.boolean()),
    /** Recency-venster speed-to-lead-dashboard (dagen). Default 90. Leads ouder
     * dan dit + zonder due follow-up vallen van het bord (blijven in pipeline). */
    dashboardWindowDays: v.optional(v.number()),
    /** Bedrijfsnaam voor de {{company}}-var in e-mails. Afwezig = org-naam. */
    companyName: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  emailBacklog: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    type: v.optional(v.string()),
    timing: v.optional(v.string()),
    category: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("sent")),
    sentAt: v.optional(v.number()),
    sortOrder: v.number(),
    subject: v.optional(v.string()),
    bodyBlocks: v.optional(v.array(v.any())),
  }).index("by_workspace", ["workspaceId"]),

  segments: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    rules: v.object({
      match: v.union(v.literal("all"), v.literal("any")),
      conditions: v.array(
        v.object({
          field: v.string(),
          op: v.string(),
          value: v.any(),
        }),
      ),
    }),
    cachedCount: v.optional(v.number()),
    cachedAt: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),

  broadcasts: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    subject: v.string(),
    body: v.optional(v.string()),            // HTML; leeg als templateId gezet
    bodyBlocks: v.optional(v.array(v.any())),
    templateId: v.optional(v.id("emailTemplates")),
    segmentId: v.id("segments"),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    scheduledAt: v.optional(v.number()),
    stats: v.object({
      total: v.number(),
      sent: v.number(),
      delivered: v.number(),
      bounced: v.number(),
      unsubscribed: v.number(),
      failed: v.number(),
    }),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  }).index("by_workspace_status", ["workspaceId", "status"]),

  broadcastRecipients: defineTable({
    broadcastId: v.id("broadcasts"),
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("sending"), v.literal("sent"), v.literal("failed")),
    externalMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  }).index("by_broadcast_status", ["broadcastId", "status"]),

  // ════════════════════════════════════════════════════════════════════
  // AI LEAD-RESPONSE AGENT
  // ════════════════════════════════════════════════════════════════════

  aiLeadResponseConfigs: defineTable({
    workspaceId: v.id("workspaces"),
    enabled: v.boolean(),
    mode: v.union(v.literal("off"), v.literal("suggest"), v.literal("auto")),
    channelOrder: v.array(
      v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("email")),
    ),
    bookingUrl: v.string(),
    model: v.string(),
    anthropicApiKeyEncrypted: v.optional(v.string()),
    businessContext: v.optional(v.string()),
    tone: v.optional(v.string()),
    signature: v.optional(v.string()),
    whatsappTemplateName: v.optional(v.string()),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    dailyCap: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),

  aiSuggestedResponses: defineTable({
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("email")),
    body: v.string(),
    model: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("dismissed"),
      v.literal("failed"),
    ),
  }).index("by_contact", ["contactId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  // ════════════════════════════════════════════════════════════════════
  // UNIFIED MESSAGES (vervangt v1's email_log + email_messages +
  // email_threads + message_log)
  // ════════════════════════════════════════════════════════════════════

  messages: defineTable({
    workspaceId: v.id("workspaces"),
    contactId: v.optional(v.id("contacts")),
    threadId: v.optional(v.id("messageThreads")),
    channel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("messenger")
    ),
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
      v.literal("bounced"),
      v.literal("rate_limited")
    ),
    externalMessageId: v.optional(v.string()),  // Resend/Voidfix/Meta id
    to: v.string(),
    from: v.optional(v.string()),
    subject: v.optional(v.string()),            // email only
    body: v.string(),
    htmlBody: v.optional(v.string()),           // email only
    mediaUrl: v.optional(v.string()),
    mediaType: v.optional(v.string()),
    templateName: v.optional(v.string()),
    templateVariables: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    sentById: v.optional(v.id("users")),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_contact_sent", ["contactId", "sentAt"])
    .index("by_workspace_channel_sent", ["workspaceId", "channel", "sentAt"])
    .index("by_external_id", ["externalMessageId"])
    .index("by_thread_sent", ["threadId", "sentAt"])
    .index("by_legacyId", ["legacyId"]),

  messageThreads: defineTable({
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("messenger")
      // sms is per-message, no threading
    ),
    subject: v.optional(v.string()),           // email subject
    externalThreadId: v.optional(v.string()),  // Gmail thread-id, etc.
    lastMessageAt: v.number(),
    unreadCount: v.number(),
    isArchived: v.boolean(),
  }).index("by_contact_lastMessage", ["contactId", "lastMessageAt"])
    .index("by_workspace_unread", ["workspaceId", "unreadCount"])
    .index("by_externalThreadId", ["externalThreadId"]),

  emailTemplates: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    subject: v.string(),
    body: v.string(),      // HTML string
    bodyBlocks: v.optional(v.array(v.any())),
    description: v.optional(v.string()),
    isSystem: v.boolean(),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"])
    .index("by_legacyId", ["legacyId"]),

  emailConnections: defineTable({
    workspaceId: v.id("workspaces"),
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    email: v.string(),
    accessToken: v.string(),    // encrypted
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    syncedAt: v.optional(v.number()),
    isActive: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

  chatConversations: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    createdById: v.id("users"),
    lastMessageAt: v.number(),
  }).index("by_workspace_lastMessage", ["workspaceId", "lastMessageAt"]),

  chatMessages: defineTable({
    conversationId: v.id("chatConversations"),
    senderId: v.optional(v.id("users")),
    body: v.string(),
    isSystem: v.boolean(),
  }).index("by_conversation", ["conversationId"]),

  // ════════════════════════════════════════════════════════════════════
  // META LEAD ADS + ATTRIBUTION
  // ════════════════════════════════════════════════════════════════════

  metaConnections: defineTable({
    orgId: v.id("orgs"),
    metaUserId: v.string(),
    accessToken: v.string(),       // encrypted
    isActive: v.boolean(),
    syncedAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  metaPages: defineTable({
    orgId: v.id("orgs"),
    workspaceId: v.optional(v.id("workspaces")),
    pageId: v.string(),            // Meta page-id (string)
    pageName: v.string(),
    accessToken: v.string(),       // encrypted per-page token
    isActive: v.boolean(),
  }).index("by_pageId_active", ["pageId", "isActive"])
    .index("by_org", ["orgId"]),

  metaForms: defineTable({
    orgId: v.id("orgs"),
    pageId: v.id("metaPages"),
    formId: v.string(),            // Meta form-id
    formName: v.optional(v.string()),
    formFields: v.optional(v.any()),  // [{key, label, type}, ...]
    isActive: v.boolean(),
    lastSyncAt: v.optional(v.number()),
  }).index("by_page_form", ["pageId", "formId"]),

  metaMessagingConfig: defineTable({
    workspaceId: v.id("workspaces"),
    metaPageId: v.id("metaPages"),
    welcomeMessage: v.optional(v.string()),
    autoReplyEnabled: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

  metaLeadRaw: defineTable({
    orgId: v.id("orgs"),
    leadgenId: v.string(),
    pageId: v.string(),
    formId: v.optional(v.string()),
    adId: v.optional(v.string()),
    adgroupId: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    payload: v.any(),
    fieldData: v.optional(v.any()),  // parsed key/value from Graph API
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    contactId: v.optional(v.id("contacts")),
    opportunityId: v.optional(v.id("opportunities")),
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
    fetchedAt: v.number(),
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  }).index("by_leadgenId", ["leadgenId"])
    .index("by_status_org", ["status", "orgId"]),

  leadAttribution: defineTable({
    contactId: v.id("contacts"),
    workspaceId: v.optional(v.id("workspaces")),
    source: v.union(v.literal("meta"), v.literal("api"), v.literal("manual")),
    metaPageId: v.optional(v.string()),
    metaFormId: v.optional(v.string()),
    metaLeadgenId: v.optional(v.string()),
    metaAdId: v.optional(v.string()),
    metaCampaignId: v.optional(v.string()),
    metaAdsetId: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
    costPerLead: v.optional(v.number()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    utmContent: v.optional(v.string()),
    utmTerm: v.optional(v.string()),
    // Migration breadcrumb: serial-id van bron-row in v1 Neon. Idempotency
    // voor de Neon→Convex ETL; geen natural unique key beschikbaar
    // (source=manual/api hebben geen metaLeadgenId).
    legacyId: v.optional(v.number()),
  }).index("by_contact", ["contactId"])
    .index("by_metaLeadgenId", ["metaLeadgenId"])
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"]),

  // Lead-ingest routes — bepaalt per form-id welk workspace de lead krijgt,
  // plus default pipeline/stage/assignee/value voor de auto-aangemaakte
  // opportunity. Match v1's lead_routes-feature.
  leadIngestRoutes: defineTable({
    orgId: v.id("orgs"),
    sourceType: v.union(v.literal("meta_form"), v.literal("api_key")),
    sourceIdentifier: v.string(),       // meta form-id of api-key
    targetWorkspaceId: v.id("workspaces"),
    defaultPipelineId: v.optional(v.id("pipelines")),
    /** Specifieke startstage; anders eerste non-won/lost stage van pipeline. */
    defaultStageId: v.optional(v.id("pipelineStages")),
    /** Auto-assign opportunity aan deze user. */
    assignToUserId: v.optional(v.id("users")),
    /** Default opportunity-value in €. Voor marketplace-pricing later. */
    defaultLeadValue: v.optional(v.number()),
    /** Toggle om route tijdelijk uit te zetten zonder te verwijderen. */
    isActive: v.optional(v.boolean()),
  })
    .index("by_source", ["sourceType", "sourceIdentifier"])
    .index("by_org", ["orgId"]),

  // ════════════════════════════════════════════════════════════════════
  // WEBHOOK EVENTS (dedup + audit trail)
  // ════════════════════════════════════════════════════════════════════

  webhookEvents: defineTable({
    provider: v.string(),               // "meta", "resend", "voidfix-sms", "voidfix-wa", "gmail"
    externalEventId: v.string(),
    eventType: v.string(),
    payload: v.any(),
    status: v.union(v.literal("received"), v.literal("processed"), v.literal("failed")),
    retryCount: v.number(),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
  }).index("by_provider_external", ["provider", "externalEventId"])
    .index("by_status", ["status"]),

  // ════════════════════════════════════════════════════════════════════
  // WORKFLOWS (Snelle Response + future flows)
  // ════════════════════════════════════════════════════════════════════

  workflows: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived")
    ),
    triggerConfig: v.array(v.object({
      type: v.string(),
      nodeId: v.string(),
    })),
    version: v.number(),
    totalExecutions: v.number(),
    successfulExecutions: v.number(),
    failedExecutions: v.number(),
    lastExecutedAt: v.optional(v.number()),
    lastEditedById: v.optional(v.id("users")),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_workspace_status", ["workspaceId", "status"])
    .index("by_legacyId", ["legacyId"]),

  workflowNodes: defineTable({
    workflowId: v.id("workflows"),
    nodeId: v.string(),
    type: v.union(
      v.literal("trigger"),
      v.literal("action"),
      v.literal("condition"),
      v.literal("delay")
    ),
    subType: v.optional(v.string()),    // "send_email" etc.
    positionX: v.number(),
    positionY: v.number(),
    config: v.any(),
    label: v.optional(v.string()),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_workflow", ["workflowId"])
    .index("by_legacyId", ["legacyId"]),

  workflowEdges: defineTable({
    workflowId: v.id("workflows"),
    sourceNodeId: v.string(),
    targetNodeId: v.string(),
    branchLabel: v.optional(v.string()),
    // Migration breadcrumb: idempotency-key voor Neon→Convex ETL.
    legacyId: v.optional(v.number()),
  }).index("by_workflow", ["workflowId"])
    .index("by_legacyId", ["legacyId"]),

  workflowExecutions: defineTable({
    workflowId: v.id("workflows"),
    workspaceId: v.id("workspaces"),
    entityType: v.union(v.literal("contact"), v.literal("opportunity")),
    entityId: v.string(),
    entityData: v.any(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("paused"),
      v.literal("cancelled")
    ),
    currentNodeId: v.optional(v.string()),
    pausedUntil: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    metadata: v.optional(v.any()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_workflow", ["workflowId"])
    .index("by_status_paused", ["status", "pausedUntil"])
    .index("by_entity", ["entityType", "entityId"]),

  workflowExecutionLogs: defineTable({
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    nodeType: v.string(),
    status: v.union(v.literal("success"), v.literal("failed"), v.literal("skipped")),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  }).index("by_execution", ["executionId"]),

  // ════════════════════════════════════════════════════════════════════
  // OUTBOUND CHANNEL CONFIG
  // ════════════════════════════════════════════════════════════════════

  voidfixSmsConfig: defineTable({
    orgId: v.id("orgs"),
    deviceUnique: v.string(),
    simSlot: v.number(),       // 1 or 2
    isActive: v.boolean(),
    lastSeenAt: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  platformSmsConfig: defineTable({
    // Singleton-ish: global default device for fallback
    deviceId: v.string(),
    isActive: v.boolean(),
  }),

  whatsappWebConfig: defineTable({
    workspaceId: v.id("workspaces"),
    sessionId: v.string(),
    phoneNumber: v.string(),
    isActive: v.boolean(),
    lastSeenAt: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),

  whatsappTemplates: defineTable({
    workspaceId: v.optional(v.id("workspaces")),  // null = platform-wide
    name: v.string(),
    language: v.string(),
    body: v.string(),
    variables: v.optional(v.array(v.string())),
    isActive: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

  // ════════════════════════════════════════════════════════════════════
  // WEBSITE LEAD API (inbound from staycoolairco.nl contact-form e.d.)
  // ════════════════════════════════════════════════════════════════════

  websiteLeadApiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),         // store hashed, not plaintext
    name: v.string(),
    sourceLabel: v.optional(v.string()),
    isActive: v.boolean(),
    lastUsedAt: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"])
    .index("by_keyHash", ["keyHash"]),

  websiteLeadLogs: defineTable({
    apiKeyId: v.id("websiteLeadApiKeys"),
    status: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("processed")),
    payload: v.any(),
    contactId: v.optional(v.id("contacts")),
    errorMessage: v.optional(v.string()),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  }).index("by_apiKey", ["apiKeyId"]),

  // ════════════════════════════════════════════════════════════════════
  // FEATURE FLAGS (lightweight)
  // ════════════════════════════════════════════════════════════════════

  featureFlags: defineTable({
    key: v.string(),
    description: v.optional(v.string()),
    defaultValue: v.boolean(),
  }).index("by_key", ["key"]),

  featureFlagOverrides: defineTable({
    flagKey: v.string(),
    scope: v.union(v.literal("org"), v.literal("workspace"), v.literal("user")),
    scopeId: v.string(),
    value: v.boolean(),
  }).index("by_flag_scope", ["flagKey", "scope", "scopeId"]),

  // ════════════════════════════════════════════════════════════════════
  // MARKETPLACE (v1-faithful port — LEAN scope)
  // ════════════════════════════════════════════════════════════════════

  // Pricing matrix: per (niche × serviceType × segment) a min/max cents
  // range. calculateLeadPrice() reads this; NOT keyed on score.
  // v1: marketplace_lead_rates.
  marketplaceLeadRates: defineTable({
    niche: v.string(), // seeded with marketplaceNiche values (v1 varchar)
    serviceType: v.string(), // "install" | "repair" | "maintain"
    segment: v.string(), // "b2c" | "b2b"
    minCents: v.number(),
    maxCents: v.number(),
    updatedAt: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_combo", ["niche", "serviceType", "segment"]) // uniqueness enforced in upsert
    .index("by_niche", ["niche"])
    .index("by_legacyId", ["legacyId"]),

  // Platform-level intake API keys (no org scoping). Inbound SEO sites
  // POST with one of these. v1: marketplace_api_keys.
  marketplaceApiKeys: defineTable({
    keyHash: v.string(), // sha256 hex — store hash only, never plaintext
    keyPrefix: v.string(), // display prefix e.g. "lmk_ab12cd34"
    name: v.string(),
    defaultNiche: marketplaceNiche,
    allowedNiches: v.array(v.string()), // validate ⊆ niche union in mutation
    isActive: v.boolean(),
    createdByUserId: v.optional(v.id("users")),
    lastUsedAt: v.optional(v.number()),
    legacyId: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"]) // auth lookup (uniqueness enforced in mint)
    .index("by_active", ["isActive"])
    .index("by_legacyId", ["legacyId"]),

  // Platform-owned lead inventory. PII stored in clear at rest; the FEED
  // query masks it until purchase. v1: marketplace_leads.
  marketplaceLeads: defineTable({
    apiKeyId: v.optional(v.id("marketplaceApiKeys")),
    niche: marketplaceNiche,
    serviceType: v.optional(marketplaceServiceType),
    segment: marketplaceSegment, // default "b2c"
    region: v.optional(v.string()),
    province: v.optional(v.string()),
    projectType: v.optional(v.string()),
    projectDescription: v.optional(v.string()),
    jobSize: v.optional(
      v.union(
        v.literal("s"),
        v.literal("m"),
        v.literal("l"),
        v.literal("xl"),
      ),
    ),
    buyerIntention: v.optional(
      v.union(v.literal("yes"), v.literal("unknown"), v.literal("no")),
    ),
    nicheData: v.optional(v.any()),
    photos: v.optional(v.array(v.string())),
    // PII (clear at rest, masked in feed)
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerifiedAt: v.optional(v.number()),
    emailVerifiedAt: v.optional(v.number()),
    postalCode: v.optional(v.string()),
    city: v.optional(v.string()),
    urgency: v.optional(v.string()),
    message: v.optional(v.string()),
    metadata: v.optional(v.any()),
    score: marketplaceLeadScore, // computed at intake
    status: v.union(
      v.literal("pending_review"),
      v.literal("published"),
      v.literal("sold_exclusive"),
      v.literal("sold_shared"),
      v.literal("expired"),
      v.literal("duplicate"),
      v.literal("rejected"),
    ),
    priceExclusiveCents: v.number(),
    priceSharedCents: v.number(),
    maxSharedBuyers: v.number(), // default 4
    allowExclusive: v.boolean(), // default true
    allowShared: v.boolean(), // default true
    publishedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
    legacyId: v.optional(v.number()),
  })
    .index("by_niche_status", ["niche", "status"])
    .index("by_status_published", ["status", "publishedAt"]) // FEED main query
    .index("by_phone_niche", ["phone", "niche"]) // dedup at intake
    .index("by_province", ["province"])
    .index("by_legacyId", ["legacyId"]),

  // A buyer org unlocking a lead. contactId = the auto-copied CRM contact.
  // v1: marketplace_purchases. Unique (leadId, buyerOrgId) enforced in
  // mutation.
  marketplacePurchases: defineTable({
    leadId: v.id("marketplaceLeads"),
    buyerOrgId: v.id("orgs"),
    buyerWorkspaceId: v.id("workspaces"),
    buyerUserId: v.id("users"),
    mode: v.union(v.literal("exclusive"), v.literal("shared")),
    priceCents: v.number(),
    contactId: v.optional(v.id("contacts")),
    purchasedAt: v.number(),
    buyerStatus: v.string(), // default "new"
    buyerStatusUpdatedAt: v.optional(v.number()),
    legacyId: v.optional(v.number()),
  })
    .index("by_lead_org", ["leadId", "buyerOrgId"]) // buy-once-per-org guard
    .index("by_buyer_purchased", ["buyerOrgId", "purchasedAt"])
    .index("by_lead", ["leadId"]) // count shared slots
    .index("by_buyerStatus", ["buyerStatus"])
    .index("by_legacyId", ["legacyId"]),

  // One wallet per buyer org (lazy-created). v1 PK = orgId; enforce
  // single-row in getOrCreateWallet. No `currency` field (implicitly EUR).
  marketplaceWallets: defineTable({
    orgId: v.id("orgs"),
    balanceCents: v.number(),
    updatedAt: v.number(),
    legacyOrgId: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // Append-only wallet ledger, keyed by orgId (v1 wallet has no serial
  // id). v1: marketplace_wallet_transactions.
  marketplaceWalletTransactions: defineTable({
    orgId: v.id("orgs"),
    type: v.union(
      v.literal("topup"),
      v.literal("purchase"),
      v.literal("refund"),
      v.literal("admin_adjustment"),
    ),
    amountCents: v.number(), // SIGNED: + credit / − debit
    balanceAfterCents: v.number(), // running-balance snapshot for audit
    referenceType: v.optional(v.string()), // "stripe_payment" | "purchase"
    referenceId: v.optional(v.string()), // session.id | `lead_<id>_<ts>`
    notes: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    legacyId: v.optional(v.number()),
  })
    .index("by_org", ["orgId"]) // ledger list (order by _creationTime)
    .index("by_ref", ["referenceType", "referenceId"]) // Stripe idempotency lookup
    .index("by_legacyId", ["legacyId"]),

  // Per-buyer-org feed filters + onboarding flag (one row per org).
  // null array = "accept all"; [] = "accept none" — preserve the
  // distinction. v1: marketplace_buyer_preferences.
  marketplaceBuyerPreferences: defineTable({
    orgId: v.id("orgs"),
    niches: v.array(v.string()), // default []
    serviceTypes: v.optional(v.array(v.string())), // undefined = all
    segments: v.optional(v.array(v.string())), // default ["b2c","b2b"]
    regions: v.optional(v.array(v.string())), // stored, unused in feed
    provinces: v.optional(v.array(v.string())), // ACTIVE geo filter
    postalCodePrefixes: v.optional(v.array(v.string())), // stored, unused in feed
    preferredMode: v.union(
      v.literal("exclusive"),
      v.literal("shared"),
      v.literal("both"),
    ),
    notifyOnNewLead: v.boolean(),
    notifyChannel: v.union(
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("both"),
      v.literal("none"),
    ),
    onboardingCompletedAt: v.optional(v.number()),
    updatedAt: v.number(),
    legacyOrgId: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // Lead-view dedup tracking (light analytics — kept because the
  // lead-detail route writes it). v1: marketplace_lead_views.
  marketplaceLeadViews: defineTable({
    leadId: v.id("marketplaceLeads"),
    orgId: v.id("orgs"),
    userId: v.id("users"),
    viewedAt: v.number(),
  })
    .index("by_lead_user", ["leadId", "userId", "viewedAt"]) // 5-min dedup lookup
    .index("by_lead", ["leadId", "viewedAt"]),

  // ════════════════════════════════════════════════════════════════════
  // PERFORMANCE TIPS / OPEN VRAGEN
  // ════════════════════════════════════════════════════════════════════
  //
  // 1. `messages` heeft 4 indexes (by_contact_sent, by_workspace_channel_sent,
  //    by_external_id, by_thread_sent). Bij hoge volume (>100k messages)
  //    overweeg sharding op workspaceId via Convex's componentSystem.
  //
  // 2. `webhookEvents` groeit lineair met inbound traffic. TTL via Convex
  //    scheduler — bv. cleanup van rows ouder dan 90 dagen.
  //
  // 3. `workflowExecutionLogs` idem — log retention policy nodig.
  //
  // 4. ENCRYPTION: `accessToken`-velden worden app-layer encrypted via
  //    convex/lib/crypto.ts (AES-256-GCM, Web Crypto, ENCRYPTION_KEY env).
  //    GEÏMPLEMENTEERD voor metaConnections.accessToken + metaPages.accessToken
  //    (encrypt in http.ts OAuth-callback, decrypt in integrations.syncFormsForPage).
  //    TODO bij activatie email-sync: pas hetzelfde toe op emailConnections
  //    .accessToken/.refreshToken (nu nog ongebruikte tabel). Convex storage
  //    zelf is óók encrypted-at-rest; dit is de extra app-layer.
  //
  // 5. MULTI-TENANT GUARD: elke query/mutation MOET workspaceId-check doen
  //    voor data-isolation. Convex heeft geen RLS — guard in handler.
  //    Vergelijkbaar met v1's requireAuthContext + workspace.id pattern.
  //
  // 6. STACK AUTH MIGRATION: v1 users.externalAuthId = Stack Auth user-id.
  //    Bij overgang naar @convex-dev/auth of Clerk: nieuwe externalAuthId.
  //    ETL moet email-based matching doen tijdens migratie (alle gebruikers
  //    krijgen welcome-back email met magic-link voor nieuwe auth provider).
});
