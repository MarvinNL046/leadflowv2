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
  }).index("by_user_unread", ["userId", "isRead"])
    .index("by_workspace", ["workspaceId"]),

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
    externalId: v.optional(v.string()),
    // Soft-delete: timestamp van verwijdering, of undefined als actief.
    // Filter in alle list-queries; child-data (notes, messages,
    // attribution) blijven bestaan voor audit-trail.
    deletedAt: v.optional(v.number()),
    // Migration breadcrumb: integer-id van de bron-row in v1 Neon.
    // Idempotency-key voor de Neon→Convex ETL; rerun van migratie
    // detecteert bestaande row en doet patch i.p.v. duplicate insert.
    // Mag eventueel later weg na cutover (geen runtime-gebruik).
    legacyContactId: v.optional(v.number()),
  }).index("by_workspace_created", ["workspaceId"])
    .index("by_workspace_email", ["workspaceId", "email"])
    .index("by_workspace_phone", ["workspaceId", "phone"])
    .index("by_messengerPsid", ["messengerPsid"])
    .index("by_legacyContactId", ["legacyContactId"]),

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
  }).index("by_workspace_stage", ["workspaceId", "stageId"])
    .index("by_contact", ["contactId"])
    .index("by_assignedTo", ["assignedToId"]),

  opportunityStageHistory: defineTable({
    opportunityId: v.id("opportunities"),
    fromStageId: v.optional(v.id("pipelineStages")),
    toStageId: v.id("pipelineStages"),
    changedById: v.optional(v.id("users")),
  }).index("by_opportunity", ["opportunityId"]),

  notes: defineTable({
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    body: v.string(),
    createdById: v.optional(v.id("users")),
    isPinned: v.optional(v.boolean()),
  }).index("by_contact", ["contactId"])
    .index("by_workspace", ["workspaceId"]),

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
  }).index("by_workspace_entity", ["workspaceId", "entityType"]),

  customFieldValues: defineTable({
    definitionId: v.id("customFieldDefinitions"),
    entityType: v.union(v.literal("contact"), v.literal("opportunity")),
    entityId: v.string(),  // contact or opportunity id as string for cross-table use
    value: v.any(),
  }).index("by_entity", ["entityType", "entityId"])
    .index("by_definition", ["definitionId"]),

  crmSettings: defineTable({
    workspaceId: v.id("workspaces"),
    timezone: v.string(),
    businessHours: v.optional(v.any()),
    leadAssignmentStrategy: v.optional(v.string()),
    defaultFollowUpDays: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),

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
  }).index("by_contact_sent", ["contactId", "sentAt"])
    .index("by_workspace_channel_sent", ["workspaceId", "channel", "sentAt"])
    .index("by_external_id", ["externalMessageId"])
    .index("by_thread_sent", ["threadId", "sentAt"]),

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
    description: v.optional(v.string()),
    isSystem: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

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
    .index("by_legacyId", ["legacyId"]),

  // Lead-ingest routes — bepaalt per form-id welk workspace de lead krijgt
  leadIngestRoutes: defineTable({
    orgId: v.id("orgs"),
    sourceType: v.union(v.literal("meta_form"), v.literal("api_key")),
    sourceIdentifier: v.string(),       // meta form-id of api-key
    targetWorkspaceId: v.id("workspaces"),
    defaultPipelineId: v.optional(v.id("pipelines")),
  }).index("by_source", ["sourceType", "sourceIdentifier"]),

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
  }).index("by_workspace_status", ["workspaceId", "status"]),

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
  }).index("by_workflow", ["workflowId"]),

  workflowEdges: defineTable({
    workflowId: v.id("workflows"),
    sourceNodeId: v.string(),
    targetNodeId: v.string(),
    branchLabel: v.optional(v.string()),
  }).index("by_workflow", ["workflowId"]),

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
    .index("by_status_paused", ["status", "pausedUntil"]),

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
  // MARKETPLACE (Marvin's beslissing: schema + UI porten, ondanks 0 customers)
  // ════════════════════════════════════════════════════════════════════

  marketplaceLeadRates: defineTable({
    niche: v.string(),
    region: v.string(),
    sharedMin: v.number(),
    sharedMax: v.number(),
    exclusiveMultiplier: v.number(),  // typisch 4x
    isActive: v.boolean(),
  }).index("by_niche_region", ["niche", "region"]),

  marketplaceApiKeys: defineTable({
    orgId: v.id("orgs"),
    keyHash: v.string(),
    label: v.string(),
    role: v.union(v.literal("buyer"), v.literal("seller")),
    isActive: v.boolean(),
    lastUsedAt: v.optional(v.number()),
  }).index("by_org_role", ["orgId", "role"])
    .index("by_keyHash", ["keyHash"]),

  marketplaceLeads: defineTable({
    sellerOrgId: v.id("orgs"),
    contactId: v.id("contacts"),
    niche: v.string(),
    region: v.string(),
    sharedPrice: v.number(),
    exclusivePrice: v.number(),
    status: v.union(
      v.literal("available"),
      v.literal("sold_shared"),
      v.literal("sold_exclusive"),
      v.literal("withdrawn")
    ),
    qualityScore: v.optional(v.number()),
  }).index("by_status_niche_region", ["status", "niche", "region"]),

  marketplacePurchases: defineTable({
    buyerOrgId: v.id("orgs"),
    leadId: v.id("marketplaceLeads"),
    purchaseType: v.union(v.literal("shared"), v.literal("exclusive")),
    pricePaid: v.number(),
    purchasedAt: v.number(),
  }).index("by_buyer", ["buyerOrgId"])
    .index("by_lead", ["leadId"]),

  marketplaceWallets: defineTable({
    orgId: v.id("orgs"),
    balanceCents: v.number(),
    currency: v.string(),
  }).index("by_org", ["orgId"]),

  marketplaceWalletTransactions: defineTable({
    walletId: v.id("marketplaceWallets"),
    amountCents: v.number(),          // negative for purchase
    type: v.union(v.literal("topup"), v.literal("purchase"), v.literal("refund"), v.literal("payout")),
    relatedPurchaseId: v.optional(v.id("marketplacePurchases")),
    description: v.string(),
  }).index("by_wallet", ["walletId"]),

  marketplaceBuyerPreferences: defineTable({
    orgId: v.id("orgs"),
    niches: v.array(v.string()),
    regions: v.array(v.string()),
    autoBuyEnabled: v.boolean(),
    maxPricePerLead: v.optional(v.number()),
    dailyBudgetCents: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  marketplaceOrgProfiles: defineTable({
    orgId: v.id("orgs"),
    publicName: v.string(),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    rating: v.optional(v.number()),
    reviewCount: v.number(),
  }).index("by_org", ["orgId"]),

  marketplaceReviews: defineTable({
    purchaseId: v.id("marketplacePurchases"),
    buyerOrgId: v.id("orgs"),
    sellerOrgId: v.id("orgs"),
    rating: v.number(),               // 1-5
    comment: v.optional(v.string()),
  }).index("by_seller", ["sellerOrgId"]),

  // platform-wide lead pool waar leads tussen orgs gerouted kunnen worden
  platformLeadsPool: defineTable({
    contactId: v.id("contacts"),
    sourceOrgId: v.id("orgs"),
    niche: v.string(),
    region: v.string(),
    status: v.union(v.literal("available"), v.literal("assigned"), v.literal("expired")),
    assignedToOrgId: v.optional(v.id("orgs")),
  }).index("by_status_niche", ["status", "niche"]),

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
  // 4. ENCRYPTION: alle `accessToken` velden moeten encrypted opgeslagen.
  //    Convex heeft geen native encryption-at-app-layer; gebruik externe
  //    KMS-style key in process.env + crypto.createCipheriv pattern uit
  //    v1's src/lib/crypto.ts. Convex storage zelf is encrypted-at-rest.
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
