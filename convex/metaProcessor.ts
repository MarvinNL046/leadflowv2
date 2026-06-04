import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Meta lead processor — verwerkt metaLeadRaw rows tot contacts +
 * leadAttribution. Triggered door scheduler vanuit metaIngest.insertMetaLeadRaw.
 *
 * V2 MVP-scope (kleiner dan v1):
 * - 1 page-access-token via env-var META_PAGE_ACCESS_TOKEN (skip
 *   per-page rotation, encryption, system-user fallback)
 * - 1 default workspace (Staycool's "Default") — skip lead_ingest_routes
 * - Geen opportunity-creation (pipelines nog niet geport)
 * - Unmapped fields → opgeslagen in een notes-row + bewaard in raw payload
 * - Geen webhookEvents audit-trail (focus op werkende flow)
 *
 * Retry: max 5 pogingen via metaLeadRaw.retryCount. Daarna dead-letter
 * (status="failed"). Convex scheduler retried niet automatisch — wij
 * mark failed + return zonder throw.
 */

const MAX_RETRY = 5;
const GRAPH_API_VERSION = "v21.0";

// EN/NL aliases → canonical contact field. Bron: v1 DEFAULT_FIELD_MAPPINGS
// uit src/lib/integrations/meta/processor.ts (compleet overgenomen).
const FIELD_MAPPINGS: Record<string, string> = {
  email: "email",
  "e-mailadres": "email",
  "e-mail": "email",
  emailadres: "email",
  phone_number: "phone",
  telefoonnummer: "phone",
  telefoon: "phone",
  mobiel: "phone",
  mobiel_nummer: "phone",
  full_name: "fullName",
  volledige_naam: "fullName",
  naam: "fullName",
  first_name: "firstName",
  voornaam: "firstName",
  last_name: "lastName",
  achternaam: "lastName",
  company_name: "company",
  bedrijfsnaam: "company",
  bedrijf: "company",
  organisatie: "company",
  job_title: "position",
  functie: "position",
  functietitel: "position",
  city: "city",
  stad: "city",
  plaats: "city",
  woonplaats: "city",
  street_address: "street",
  straat: "street",
  adres: "street",
  straatnaam: "street",
  postal_code: "postalCode",
  zip_code: "postalCode",
  postcode: "postalCode",
  state: "province",
  province: "province",
  provincie: "province",
  country: "country",
  land: "country",
};

interface MetaGraphLead {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
  field_data?: Array<{ name: string; values: string[] }>;
}

interface ContactFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
  city?: string;
  street?: string;
  postalCode?: string;
  province?: string;
  country?: string;
}

// ──────────────────────────────────────────────────────────────────────
// MAIN ACTION
// ──────────────────────────────────────────────────────────────────────

export const processMetaLead = internalAction({
  args: { rawId: v.id("metaLeadRaw") },
  handler: async (ctx, { rawId }) => {
    // BEWUSTE KEUZE — niet "fixen" naar de per-page metaPages.accessToken:
    // het lead-ophaalpad gebruikt de PERMANENTE system-user-token uit env
    // (META_PAGE_ACCESS_TOKEN). Per-page tokens verlopen/breken bij her-auth
    // → gemiste leads. De env-var is een aparte secret-store (Convex
    // encrypted-at-rest, nooit client-side), dus buiten I1-scope (dat dekt
    // de DB-velden metaConnections/metaPages.accessToken voor forms-sync).
    const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      console.error("[meta-processor] META_PAGE_ACCESS_TOKEN niet gezet");
      await ctx.runMutation(internal.metaProcessor.markFailed, {
        rawId,
        errorMessage: "Server misconfigured: missing META_PAGE_ACCESS_TOKEN",
      });
      return;
    }

    const raw = await ctx.runQuery(internal.metaProcessor.getRawForProcessing, {
      rawId,
    });
    if (!raw) return;

    if (raw.status === "completed") return;
    if (raw.retryCount >= MAX_RETRY) {
      await ctx.runMutation(internal.metaProcessor.markFailed, {
        rawId,
        errorMessage: `Max retries (${MAX_RETRY}) bereikt`,
      });
      return;
    }

    await ctx.runMutation(internal.metaProcessor.markProcessing, { rawId });

    try {
      const graphData = await fetchLeadDetails(raw.leadgenId, accessToken);
      const fieldMap = parseFieldData(graphData.field_data ?? []);
      const contactFields = mapFieldsToContact(fieldMap);

      const result = await ctx.runMutation(
        internal.metaProcessor.upsertContactFromMetaLead,
        {
          orgId: raw.orgId,
          rawId,
          leadgenId: raw.leadgenId,
          pageId: raw.pageId,
          formId: graphData.form_id ?? raw.formId,
          adId: graphData.ad_id ?? raw.adId,
          adsetId: graphData.adset_id,
          campaignId: graphData.campaign_id ?? raw.campaignId,
          contactFields,
          unmappedFields: collectUnmapped(fieldMap),
          rawPayloadEnriched: {
            graph: graphData,
            originalPayload: raw.payload,
          },
        },
      );

      await ctx.runMutation(internal.metaProcessor.markCompleted, {
        rawId,
        contactId: result.contactId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[meta-processor] processing failed for ${rawId}:`, msg);
      await ctx.runMutation(internal.metaProcessor.markFailed, {
        rawId,
        errorMessage: msg,
      });
    }
  },
});

// ──────────────────────────────────────────────────────────────────────
// QUERIES + MUTATIONS — interne helpers voor de action
// ──────────────────────────────────────────────────────────────────────

export const getRawForProcessing = internalQuery({
  args: { rawId: v.id("metaLeadRaw") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.rawId);
  },
});

export const markProcessing = internalMutation({
  args: { rawId: v.id("metaLeadRaw") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rawId);
    if (!row) return;
    await ctx.db.patch(args.rawId, {
      status: "processing",
      retryCount: row.retryCount + 1,
      processingStartedAt: Date.now(),
    });
  },
});

export const markCompleted = internalMutation({
  args: {
    rawId: v.id("metaLeadRaw"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.rawId, {
      status: "completed",
      contactId: args.contactId,
      processedAt: Date.now(),
      errorMessage: undefined,
    });
  },
});

export const markFailed = internalMutation({
  args: {
    rawId: v.id("metaLeadRaw"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.rawId, {
      status: "failed",
      errorMessage: args.errorMessage,
      processedAt: Date.now(),
    });
  },
});

export const upsertContactFromMetaLead = internalMutation({
  args: {
    orgId: v.id("orgs"),
    rawId: v.id("metaLeadRaw"),
    leadgenId: v.string(),
    pageId: v.string(),
    formId: v.optional(v.string()),
    adId: v.optional(v.string()),
    adsetId: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    contactFields: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      company: v.optional(v.string()),
      position: v.optional(v.string()),
      city: v.optional(v.string()),
      street: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      province: v.optional(v.string()),
      country: v.optional(v.string()),
    }),
    unmappedFields: v.array(
      v.object({ key: v.string(), value: v.string() }),
    ),
    rawPayloadEnriched: v.any(),
  },
  handler: async (ctx, args) => {
    // ── ROUTE RESOLUTION ────────────────────────────────────────────────
    // Volgorde: 1) per-form leadIngestRoute  2) per-page workspaceId
    // 3) default workspace van de org.
    //
    // Per-form route overschrijft page-mapping zodat je voor één form een
    // specifieke pipeline/stage/assignee kunt instellen, terwijl de rest
    // van de pagina naar de page-default gaat.

    let route: Doc<"leadIngestRoutes"> | null = null;
    if (args.formId) {
      const r = await ctx.db
        .query("leadIngestRoutes")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", "meta_form").eq("sourceIdentifier", args.formId!),
        )
        .first();
      if (r && r.orgId === args.orgId && (r.isActive ?? true)) {
        route = r;
      }
    }

    let workspaceId: Id<"workspaces"> | null = route?.targetWorkspaceId ?? null;

    // Fallback 1: per-page workspaceId via metaPages.workspaceId
    if (!workspaceId) {
      const metaPage = await ctx.db
        .query("metaPages")
        .withIndex("by_pageId_active", (q) =>
          q.eq("pageId", args.pageId).eq("isActive", true),
        )
        .first();
      if (metaPage?.workspaceId) {
        // Verifieer dat de gemapte workspace bij de juiste org hoort
        const ws = await ctx.db.get(metaPage.workspaceId);
        if (ws && ws.orgId === args.orgId) {
          workspaceId = metaPage.workspaceId;
        }
      }
    }

    // Fallback 2: default workspace voor deze org
    if (!workspaceId) {
      const def = await ctx.db
        .query("workspaces")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      if (!def) {
        throw new Error(`Geen default workspace voor org ${args.orgId}`);
      }
      workspaceId = def._id;
    }

    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} bestaat niet`);
    }

    const f = args.contactFields;
    const normalizedEmail = f.email?.toLowerCase().trim() || undefined;
    const normalizedPhone = f.phone
      ? f.phone.replace(/[^\d+]/g, "")
      : undefined;

    // Dedup: email-match eerst, dan phone-match — beide binnen workspace.
    let contact = normalizedEmail
      ? await ctx.db
          .query("contacts")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", workspace._id).eq("email", normalizedEmail),
          )
          .first()
      : null;

    if (!contact && normalizedPhone) {
      contact = await ctx.db
        .query("contacts")
        .withIndex("by_workspace_phone", (q) =>
          q.eq("workspaceId", workspace._id).eq("phone", normalizedPhone),
        )
        .first();
    }

    let contactId: Id<"contacts">;
    let isNewContact = false;
    if (contact) {
      // Merge: alleen lege velden invullen, niet overschrijven.
      const merged: Record<string, string | undefined> = {};
      if (!contact.firstName && f.firstName) merged.firstName = f.firstName;
      if (!contact.lastName && f.lastName) merged.lastName = f.lastName;
      if (!contact.email && normalizedEmail) merged.email = normalizedEmail;
      if (!contact.phone && normalizedPhone) merged.phone = normalizedPhone;
      if (!contact.company && f.company) merged.company = f.company;
      if (!contact.position && f.position) merged.position = f.position;
      if (!contact.city && f.city) merged.city = f.city;
      if (!contact.street && f.street) merged.street = f.street;
      if (!contact.postalCode && f.postalCode) merged.postalCode = f.postalCode;
      if (!contact.province && f.province) merged.province = f.province;
      if (!contact.country && f.country) merged.country = f.country;
      if (Object.keys(merged).length > 0) {
        await ctx.db.patch(contact._id, merged);
      }
      contactId = contact._id;
    } else {
      contactId = await ctx.db.insert("contacts", {
        workspaceId: workspace._id,
        firstName: f.firstName,
        lastName: f.lastName,
        email: normalizedEmail,
        phone: normalizedPhone,
        company: f.company,
        position: f.position,
        city: f.city,
        street: f.street,
        postalCode: f.postalCode,
        province: f.province,
        country: f.country,
        callCount: 0,
      });
      isNewContact = true;
    }

    // Attribution-row altijd insert (1-op-1 met deze meta-lead).
    await ctx.db.insert("leadAttribution", {
      contactId,
      source: "meta",
      metaPageId: args.pageId,
      metaFormId: args.formId,
      metaLeadgenId: args.leadgenId,
      metaAdId: args.adId,
      metaAdsetId: args.adsetId,
      metaCampaignId: args.campaignId,
      rawPayload: args.rawPayloadEnriched,
    });

    // Opportunity aanmaken zodat lead in Kanban verschijnt. ELKE submission
    // krijgt een verse opp — ook bij een bestaand/gededupt contact (Marvin's
    // keuze: elke formulier-inzending = een nieuwe deal om op te volgen).
    //
    // Pipeline-resolutie volgt de route: route.defaultPipelineId →
    // workspace default pipeline. Stage: route.defaultStageId → eerste
    // non-won/lost stage. Assignee en value komen uit de route.
    {
      let pipeline = route?.defaultPipelineId
        ? await ctx.db.get(route.defaultPipelineId)
        : null;
      if (!pipeline) {
        pipeline = await ctx.db
          .query("pipelines")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", workspace._id),
          )
          .filter((q) => q.eq(q.field("isDefault"), true))
          .first();
      }
      if (pipeline) {
        let stage = route?.defaultStageId
          ? await ctx.db.get(route.defaultStageId)
          : null;
        // Als gekozen stage niet bij gekozen pipeline hoort, fallback.
        if (stage && stage.pipelineId !== pipeline._id) {
          stage = null;
        }
        if (!stage) {
          const stages = await ctx.db
            .query("pipelineStages")
            .withIndex("by_pipeline_order", (q) =>
              q.eq("pipelineId", pipeline._id),
            )
            .collect();
          stage =
            stages.find((s) => !s.isWonStage && !s.isLostStage) ?? null;
        }
        if (stage) {
          const oppContact = await ctx.db.get(contactId);
          const oppTitle =
            (oppContact &&
              [oppContact.firstName, oppContact.lastName]
                .filter(Boolean)
                .join(" ")) ||
            oppContact?.email ||
            oppContact?.phone ||
            "Nieuwe lead";
          const oppId = await ctx.db.insert("opportunities", {
            workspaceId: workspace._id,
            contactId,
            pipelineId: pipeline._id,
            stageId: stage._id,
            title: oppTitle,
            value: route?.defaultLeadValue,
            assignedToId: route?.assignToUserId,
          });
          await ctx.db.insert("opportunityStageHistory", {
            opportunityId: oppId,
            toStageId: stage._id,
            changedById: route?.assignToUserId,
          });
        }
      }
    }

    // Unmapped fields → note voor traceability (kort, line-per-field).
    if (args.unmappedFields.length > 0) {
      const noteBody = [
        "📋 Meta-form antwoorden (niet-gemapt):",
        ...args.unmappedFields.map((u) => `• ${u.key}: ${u.value}`),
      ].join("\n");
      await ctx.db.insert("notes", {
        workspaceId: workspace._id,
        contactId,
        body: noteBody,
      });
    }

    // Workflow trigger bij ELKE submission (Marvin's keuze "wel triggeren") —
    // ook bij een herhaalde inzending van een bestaand contact, zodat de
    // speed-to-lead auto-reactie elke nieuwe aanvraag afgaat.
    await ctx.scheduler.runAfter(
      0,
      internal.workflowEngine.triggerContactCreated,
      { workspaceId: workspace._id, contactId },
    );

    return { contactId };
  },
});

// ──────────────────────────────────────────────────────────────────────
// PURE HELPERS — geen ctx-toegang
// ──────────────────────────────────────────────────────────────────────

async function fetchLeadDetails(
  leadgenId: string,
  accessToken: string,
): Promise<MetaGraphLead> {
  const fields = [
    "id",
    "created_time",
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "form_id",
    "is_organic",
    "platform",
    "field_data",
  ].join(",");
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
    leadgenId,
  )}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as MetaGraphLead;
}

function parseFieldData(
  fieldData: Array<{ name: string; values: string[] }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldData) {
    if (f.values && f.values.length > 0) {
      out[f.name] = f.values[0];
    }
  }
  return out;
}

function mapFieldsToContact(fields: Record<string, string>): ContactFields {
  const contact: ContactFields = {};
  let fullName: string | undefined;

  for (const [rawKey, value] of Object.entries(fields)) {
    const key = rawKey.toLowerCase();
    const target = FIELD_MAPPINGS[key];
    if (!target) continue;

    if (target === "fullName") {
      fullName = value;
    } else {
      (contact as Record<string, string>)[target] = value;
    }
  }

  // Split fullName als firstName/lastName niet expliciet zijn.
  if (fullName && (!contact.firstName || !contact.lastName)) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length > 0) {
      if (!contact.firstName) contact.firstName = parts[0];
      if (!contact.lastName && parts.length > 1) {
        contact.lastName = parts.slice(1).join(" ");
      }
    }
  }

  return contact;
}

function collectUnmapped(
  fields: Record<string, string>,
): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const [rawKey, value] of Object.entries(fields)) {
    const key = rawKey.toLowerCase();
    if (!FIELD_MAPPINGS[key]) {
      out.push({ key: rawKey, value });
    }
  }
  return out;
}
