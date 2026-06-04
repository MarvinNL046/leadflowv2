# AI Lead-Response Agent (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een nieuwe lead (Meta/website) krijgt binnen seconden een gepersonaliseerde eerste reactie die naar een afspraak boekt — auto-versturen of als concept klaarzetten, per-workspace instelbaar met guardrails.

**Architecture:** Standalone Convex `internalAction` (`aiLeadResponse.handleNewLead`) gescheduled vanuit lead-intake, onafhankelijk van de workflow-engine. Pure helpers (channel-keuze, quiet-hours, prompt) gescheiden van de Convex-laag voor testbaarheid. Config + suggesties in twee nieuwe tabellen.

**Tech Stack:** Convex (internalAction/mutation/query, scheduler), Anthropic Messages API via `fetch`, bestaande `lib/crypto` (encrypt key), `messaging.sendInternal` (verzendpad), vitest (unit-tests pure helpers).

**Spec:** `docs/superpowers/specs/2026-06-04-ai-lead-response-agent-design.md`

---

## File Structure
- `convex/schema.ts` — +2 tabellen: `aiLeadResponseConfigs`, `aiSuggestedResponses`.
- `convex/aiLeadResponse/helpers.ts` — pure, ctx-loze helpers (testbaar): `pickChannel`, `isWithinQuietHours`, `buildPrompt`. (NIEUW)
- `convex/aiLeadResponse/helpers.test.ts` — vitest unit-tests. (NIEUW)
- `convex/aiAgentConfig.ts` — config-CRUD: `DEFAULT_AI_CONFIG`, `get` (query), `update` (mutation, encrypt key), `getConfigInternal` (internalQuery). (NIEUW)
- `convex/aiLeadResponse.ts` — `handleNewLead` (internalAction) + interne helpers `recentlyResponded` (internalQuery), `countAutoSentToday` (internalQuery), `recordSuggestion` (internalMutation), `markResponded` (internalMutation), `generatePreview` (action voor de test-knop). (NIEUW)
- `convex/metaProcessor.ts` — schedule `handleNewLead` na lead-verwerking (regel ~481).
- `src/routes/crm.settings_.ai-agent.tsx` — settings-formulier + test-knop. (NIEUW)
- `src/routes/crm.settings.tsx` — kaart "AI-agent" toevoegen aan de hub.
- `src/components/crm/lead-card.tsx` — pending AI-suggestie tonen (Verstuur/Negeer).

---

### Task 1: Schema — config + suggesties tabellen

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Voeg de twee tabellen toe** (bij de andere defineTable-blokken, vóór de afsluitende `})` van het schema-object)

```ts
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
```

- [ ] **Step 2: Deploy + verifieer schema**

Run: `npx convex dev --once`
Expected: "Convex functions ready", nieuwe tabel-indexes toegevoegd, geen schema-fout.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(ai-agent): schema aiLeadResponseConfigs + aiSuggestedResponses"
```

---

### Task 2: Pure helpers + tests (channel, quiet-hours, prompt)

**Files:**
- Create: `convex/aiLeadResponse/helpers.ts`
- Test: `convex/aiLeadResponse/helpers.test.ts`

- [ ] **Step 1: Schrijf de falende tests**

```ts
import { describe, it, expect } from "vitest";
import { pickChannel, isWithinQuietHours, buildPrompt } from "./helpers";

describe("pickChannel", () => {
  const contact = { phone: "+31612345678", email: "a@b.nl" };
  it("kiest sms vóór email bij order [sms,email]", () => {
    expect(pickChannel(["sms", "email"], contact, null)).toBe("sms");
  });
  it("slaat whatsapp over zonder template, valt terug op sms", () => {
    expect(pickChannel(["whatsapp", "sms"], contact, null)).toBe("sms");
  });
  it("kiest whatsapp mét template", () => {
    expect(pickChannel(["whatsapp", "sms"], contact, "welkom_template")).toBe("whatsapp");
  });
  it("valt terug op email als geen phone", () => {
    expect(pickChannel(["sms", "email"], { email: "a@b.nl" }, null)).toBe("email");
  });
  it("geeft null als geen kanaal beschikbaar", () => {
    expect(pickChannel(["sms"], {}, null)).toBeNull();
  });
});

describe("isWithinQuietHours", () => {
  it("21-8: 23:00 is stil", () => {
    expect(isWithinQuietHours(23, 21, 8)).toBe(true);
  });
  it("21-8: 12:00 is niet stil", () => {
    expect(isWithinQuietHours(12, 21, 8)).toBe(false);
  });
  it("21-8: 7:00 is stil (over middernacht)", () => {
    expect(isWithinQuietHours(7, 21, 8)).toBe(true);
  });
});

describe("buildPrompt", () => {
  it("bevat naam, bookingUrl en verbiedt prijzen", () => {
    const p = buildPrompt({
      businessContext: "StayCool airco Limburg",
      tone: "vriendelijk",
      signature: "Groet, StayCool",
      bookingUrl: "https://afspraken.staycoolairco.nl/",
      contact: { firstName: "Pascal", city: "Reuver" },
      formAnswers: ["ruimte: hele woning"],
    });
    expect(p.system).toContain("https://afspraken.staycoolairco.nl/");
    expect(p.system.toLowerCase()).toContain("geen prijzen");
    expect(p.user).toContain("Pascal");
  });
});
```

- [ ] **Step 2: Run tests → falen**

Run: `npx vitest run convex/aiLeadResponse/helpers.test.ts`
Expected: FAIL ("pickChannel is not a function" / module not found).

- [ ] **Step 3: Implementeer de helpers**

```ts
export type Channel = "whatsapp" | "sms" | "email";

export function pickChannel(
  order: Channel[],
  contact: { phone?: string; email?: string },
  whatsappTemplateName: string | null,
): Channel | null {
  for (const ch of order) {
    if (ch === "whatsapp" && whatsappTemplateName && contact.phone) return "whatsapp";
    if (ch === "sms" && contact.phone) return "sms";
    if (ch === "email" && contact.email) return "email";
  }
  return null;
}

/** uur 0-23. Quiet-venster mag over middernacht lopen (start > end). */
export function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function buildPrompt(opts: {
  businessContext?: string;
  tone?: string;
  signature?: string;
  bookingUrl: string;
  contact: { firstName?: string; lastName?: string; city?: string };
  formAnswers: string[];
}): { system: string; user: string } {
  const naam = [opts.contact.firstName, opts.contact.lastName].filter(Boolean).join(" ") || "daar";
  const system = [
    opts.businessContext ?? "Wij zijn een installatiebedrijf.",
    `Toon: ${opts.tone ?? "vriendelijk, professioneel, kort, Nederlands"}.`,
    "Schrijf het EERSTE reactiebericht op een nieuwe lead.",
    "Verwelkom de lead, bevestig kort hun aanvraag, en nodig uit om zelf een",
    `vrijblijvende afspraak in te plannen via deze link: ${opts.bookingUrl}`,
    "Regels: GEEN prijzen noemen. Maximaal ~120 woorden. Geen opsommingstekens.",
    opts.signature ? `Sluit af met: ${opts.signature}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    `Naam: ${naam}`,
    opts.contact.city ? `Plaats: ${opts.contact.city}` : "",
    opts.formAnswers.length ? `Aanvraag-details:\n- ${opts.formAnswers.join("\n- ")}` : "",
  ].filter(Boolean).join("\n");
  return { system, user };
}
```

- [ ] **Step 4: Run tests → slagen**

Run: `npx vitest run convex/aiLeadResponse/helpers.test.ts`
Expected: PASS (alle tests groen).

- [ ] **Step 5: Commit**

```bash
git add convex/aiLeadResponse/helpers.ts convex/aiLeadResponse/helpers.test.ts
git commit -m "feat(ai-agent): pure helpers (pickChannel/quietHours/buildPrompt) + tests"
```

---

### Task 3: Config-CRUD (`convex/aiAgentConfig.ts`)

**Files:**
- Create: `convex/aiAgentConfig.ts`

- [ ] **Step 1: Implementeer DEFAULT + get + update + internal getter**

```ts
import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { encryptSecret } from "./lib/crypto";
import { requireWorkspaceMembership } from "./contacts"; // hergebruik bestaande guard

export const DEFAULT_AI_CONFIG = {
  enabled: false,
  mode: "suggest" as const,
  channelOrder: ["sms", "email"] as Array<"whatsapp" | "sms" | "email">,
  bookingUrl: "https://afspraken.staycoolairco.nl/",
  model: "claude-sonnet-4-6",
  tone: "vriendelijk, professioneel, kort, Nederlands",
  signature: "Met vriendelijke groet, StayCool Airconditioning",
  quietHoursStart: 21,
  quietHoursEnd: 8,
  dailyCap: 200,
};

export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspaceMembership(ctx, workspaceId);
    const row = await ctx.db
      .query("aiLeadResponseConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    // Geef NOOIT de key-blob terug; alleen of 'ie gezet is.
    const { anthropicApiKeyEncrypted, ...rest } = row ?? {};
    return {
      ...DEFAULT_AI_CONFIG,
      ...rest,
      hasApiKey: Boolean(anthropicApiKeyEncrypted),
    };
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    enabled: v.optional(v.boolean()),
    mode: v.optional(v.union(v.literal("off"), v.literal("suggest"), v.literal("auto"))),
    channelOrder: v.optional(v.array(v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("email")))),
    bookingUrl: v.optional(v.string()),
    model: v.optional(v.string()),
    businessContext: v.optional(v.string()),
    tone: v.optional(v.string()),
    signature: v.optional(v.string()),
    whatsappTemplateName: v.optional(v.string()),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    dailyCap: v.optional(v.number()),
    anthropicApiKey: v.optional(v.string()), // plaintext input → encrypted opgeslagen
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMembership(ctx, args.workspaceId);
    const { workspaceId, anthropicApiKey, ...fields } = args;
    const patch: Record<string, unknown> = { ...fields };
    if (anthropicApiKey) patch.anthropicApiKeyEncrypted = await encryptSecret(anthropicApiKey);
    const existing = await ctx.db
      .query("aiLeadResponseConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("aiLeadResponseConfigs", {
        workspaceId,
        enabled: fields.enabled ?? DEFAULT_AI_CONFIG.enabled,
        mode: fields.mode ?? DEFAULT_AI_CONFIG.mode,
        channelOrder: fields.channelOrder ?? DEFAULT_AI_CONFIG.channelOrder,
        bookingUrl: fields.bookingUrl ?? DEFAULT_AI_CONFIG.bookingUrl,
        model: fields.model ?? DEFAULT_AI_CONFIG.model,
        ...patch,
      } as never);
    }
    return { ok: true };
  },
});

export const getConfigInternal = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) =>
    ctx.db
      .query("aiLeadResponseConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique(),
});
```

> **Let op:** verifieer dat `requireWorkspaceMembership` geëxporteerd is uit `convex/contacts.ts`; zo niet, importeer 'm uit de module waar 'ie staat (grep `export.*requireWorkspaceMembership`).

- [ ] **Step 2: Deploy + typecheck**

Run: `npx convex dev --once`
Expected: groen, geen tsc-fout.

- [ ] **Step 3: Commit**

```bash
git add convex/aiAgentConfig.ts convex/_generated
git commit -m "feat(ai-agent): config CRUD (get/update met encrypted key)"
```

---

### Task 4: De handler `aiLeadResponse.handleNewLead`

**Files:**
- Create: `convex/aiLeadResponse.ts`

- [ ] **Step 1: Implementeer de internal helpers + de actie**

```ts
import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptSecret } from "./lib/crypto";
import { pickChannel, isWithinQuietHours, buildPrompt, type Channel } from "./aiLeadResponse/helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

export const recentlyResponded = internalQuery({
  args: { contactId: v.id("contacts"), since: v.number() },
  handler: async (ctx, { contactId, since }) => {
    const sug = await ctx.db
      .query("aiSuggestedResponses")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    return sug.some((s) => s._creationTime >= since && s.status !== "dismissed");
  },
});

export const recordSuggestion = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    contactId: v.id("contacts"),
    channel: v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("email")),
    body: v.string(),
    model: v.string(),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
  },
  handler: async (ctx, args) => ctx.db.insert("aiSuggestedResponses", args),
});

export const getLeadContext = internalQuery({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const contact = await ctx.db.get(contactId);
    if (!contact) return null;
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    const formNote = notes.find((n) => n.body.includes("Meta-form antwoorden"));
    const formAnswers = formNote
      ? formNote.body.split("\n").filter((l) => l.startsWith("•")).map((l) => l.replace(/^•\s*/, ""))
      : [];
    return {
      workspaceId: contact.workspaceId,
      firstName: contact.firstName, lastName: contact.lastName,
      phone: contact.phone, email: contact.email, city: contact.city,
      formAnswers,
    };
  },
});

export const handleNewLead = internalAction({
  args: { contactId: v.id("contacts"), workspaceId: v.id("workspaces") },
  handler: async (ctx, { contactId, workspaceId }) => {
    try {
      const cfg = await ctx.runQuery(internal.aiAgentConfig.getConfigInternal, { workspaceId });
      if (!cfg || !cfg.enabled || cfg.mode === "off") return;

      // dedup (24u)
      const dup = await ctx.runQuery(internal.aiLeadResponse.recentlyResponded, {
        contactId, since: Date.now() - DAY_MS,
      });
      if (dup) return;

      const lead = await ctx.runQuery(internal.aiLeadResponse.getLeadContext, { contactId });
      if (!lead) return;

      // quiet-hours (Europe/Amsterdam uur)
      const hour = Number(new Intl.DateTimeFormat("nl-NL", {
        hour: "numeric", hour12: false, timeZone: "Europe/Amsterdam",
      }).format(new Date()));
      const qStart = cfg.quietHoursStart ?? 21, qEnd = cfg.quietHoursEnd ?? 8;
      if (cfg.mode === "auto" && isWithinQuietHours(hour, qStart, qEnd)) {
        // uitstellen tot qEnd vandaag/morgen
        const next = new Date();
        next.setHours(qEnd, 0, 0, 0);
        if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
        await ctx.scheduler.runAt(next.getTime(), internal.aiLeadResponse.handleNewLead, { contactId, workspaceId });
        return;
      }

      const channel: Channel | null = pickChannel(
        cfg.channelOrder, { phone: lead.phone, email: lead.email }, cfg.whatsappTemplateName ?? null,
      );
      if (!channel) return;

      if (!cfg.anthropicApiKeyEncrypted) {
        console.error("[ai-agent] geen Anthropic-key gezet voor workspace", workspaceId);
        return;
      }
      const apiKey = await decryptSecret(cfg.anthropicApiKeyEncrypted);
      const { system, user } = buildPrompt({
        businessContext: cfg.businessContext, tone: cfg.tone, signature: cfg.signature,
        bookingUrl: cfg.bookingUrl,
        contact: { firstName: lead.firstName, lastName: lead.lastName, city: lead.city },
        formAnswers: lead.formAnswers,
      });

      const body = await callAnthropic(apiKey, cfg.model, system, user);
      if (!body) return;

      if (cfg.mode === "auto") {
        await ctx.runAction(internal.messaging.sendInternal, { contactId, channel, body });
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId, contactId, channel, body, model: cfg.model, status: "sent",
        });
      } else {
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId, contactId, channel, body, model: cfg.model, status: "pending",
        });
      }
    } catch (err) {
      console.error("[ai-agent] handleNewLead faalde:", err);
    }
  },
});

async function callAnthropic(apiKey: string, model: string, system: string, user: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model, max_tokens: 400, system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) { console.error("[ai-agent] anthropic", res.status, await res.text()); continue; }
      const json = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = json.content?.map((c) => c.text ?? "").join("").trim();
      return text || null;
    } catch (e) { console.error("[ai-agent] anthropic fetch", e); }
  }
  return null;
}
```

- [ ] **Step 2: Deploy + typecheck**

Run: `npx convex dev --once`
Expected: groen. (Runtime-test volgt in Task 6 via een echte/test-lead.)

- [ ] **Step 3: Commit**

```bash
git add convex/aiLeadResponse.ts convex/_generated
git commit -m "feat(ai-agent): handleNewLead actie (guardrails, generate, send/suggest)"
```

---

### Task 5: Trigger-wiring vanuit lead-intake

**Files:**
- Modify: `convex/metaProcessor.ts` (na de `triggerContactCreated`-schedule, vóór `return { contactId }`)

- [ ] **Step 1: Schedule de AI-agent na elke lead-verwerking**

In `metaProcessor.ts`, direct ná het bestaande `ctx.scheduler.runAfter(0, internal.workflowEngine.triggerContactCreated, ...)`-blok en vóór `return { contactId };`:

```ts
    // AI lead-response agent (speed-to-lead eerste touch). Eigen schedule,
    // los van de workflow-engine. No-op als de agent uit staat.
    await ctx.scheduler.runAfter(0, internal.aiLeadResponse.handleNewLead, {
      contactId,
      workspaceId: workspace._id,
    });
```

> Als er een website-lead-intake-pad bestaat (grep `insertWebsiteLead` / `/api/leads` ingest in convex/), voeg daar dezelfde schedule toe. Voor Meta-leads is bovenstaande voldoende.

- [ ] **Step 2: Deploy**

Run: `npx convex dev --once`
Expected: groen.

- [ ] **Step 3: Commit**

```bash
git add convex/metaProcessor.ts convex/_generated
git commit -m "feat(ai-agent): trigger handleNewLead op Meta lead-intake"
```

---

### Task 6: Settings-pagina `/crm/settings/ai-agent` + test-knop

**Files:**
- Create: `src/routes/crm.settings_.ai-agent.tsx`
- Modify: `src/routes/crm.settings.tsx` (kaart toevoegen)
- Modify: `convex/aiLeadResponse.ts` (preview-actie toevoegen)

- [ ] **Step 1: Voeg een dry-run preview-actie toe** (in `convex/aiLeadResponse.ts`)

```ts
export const generatePreview = internalAction({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }): Promise<{ text: string | null; error?: string }> => {
    const cfg = await ctx.runQuery(internal.aiAgentConfig.getConfigInternal, { workspaceId });
    if (!cfg?.anthropicApiKeyEncrypted) return { text: null, error: "Geen Anthropic-key gezet" };
    const apiKey = await decryptSecret(cfg.anthropicApiKeyEncrypted);
    const { system, user } = buildPrompt({
      businessContext: cfg.businessContext, tone: cfg.tone, signature: cfg.signature,
      bookingUrl: cfg.bookingUrl,
      contact: { firstName: "Pascal", lastName: "Hendriks", city: "Reuver" },
      formAnswers: ["voor welk type ruimte: hele woning", "vermogen: weet ik niet, graag advies"],
    });
    const text = await callAnthropic(apiKey, cfg.model, system, user);
    return { text };
  },
});
```
Maak hiervoor een dunne PUBLIC wrapper `previewMessage` (action) die `requireWorkspaceMembership` doet en `internal.aiLeadResponse.generatePreview` aanroept (zodat de client 'm mag aanroepen).

- [ ] **Step 2: Bouw de settings-route** (mirror van `src/routes/crm.settings_.lead-flow.tsx`)

Form-velden gebonden aan `api.aiAgentConfig.get` / `api.aiAgentConfig.update`:
- master-toggle `enabled`, select `mode` (off/suggest/auto)
- `channelOrder` (3 selects of sortable lijst), `bookingUrl` (text)
- `model` (select: claude-sonnet-4-6 / claude-haiku-4-5)
- `anthropicApiKey` (password-input; placeholder "••• gezet" als `hasApiKey`)
- textareas `businessContext`, `tone`, `signature`; text `whatsappTemplateName`
- numbers `quietHoursStart`, `quietHoursEnd`, `dailyCap`
- Knop "Test bericht genereren" → roept `previewMessage` aan, toont het resultaat in een read-only box.

> Volg exact het patroon van `crm.settings_.lead-flow.tsx` (route-definitie, `useQuery`/`useMutation`, workspaceId via `api.userProfiles.myTenants`, save-knop met toast).

- [ ] **Step 3: Voeg de hub-kaart toe** (in `src/routes/crm.settings.tsx`, naast lead-flow/pipeline/meta)

```tsx
<SettingsCard to="/crm/settings/ai-agent" title="AI-agent" description="Automatische eerste reactie op nieuwe leads (speed-to-lead)" />
```
(gebruik exact dezelfde kaart-component/markup als de bestaande kaarten in die file.)

- [ ] **Step 4: Build + handmatige check**

Run: `npm run build` (groen) + `npx convex dev --once`.
Open `/crm/settings/ai-agent`: vul key + context, klik "Test bericht genereren" → er verschijnt een gegenereerd voorbeeldbericht.

- [ ] **Step 5: Commit**

```bash
git add convex/aiLeadResponse.ts src/routes/crm.settings_.ai-agent.tsx src/routes/crm.settings.tsx convex/_generated
git commit -m "feat(ai-agent): settings-pagina /crm/settings/ai-agent + preview-knop"
```

---

### Task 7: Suggest-modus tonen op de lead-card

**Files:**
- Modify: `convex/aiLeadResponse.ts` (queries/mutations voor de UI)
- Modify: `src/components/crm/lead-card.tsx`

- [ ] **Step 1: Voeg public query + send/dismiss mutations toe**

```ts
export const pendingForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await getAuthUserId(ctx); // import uit @convex-dev/auth/server
    if (!userId) return null;
    return ctx.db
      .query("aiSuggestedResponses")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .order("desc").first();
  },
});

export const sendSuggestion = action({
  args: { suggestionId: v.id("aiSuggestedResponses") },
  handler: async (ctx, { suggestionId }) => {
    // membership-check + lees suggestie via internalQuery, verstuur via
    // messaging.sendInternal, zet status op "sent".
  },
});

export const dismissSuggestion = mutation({
  args: { suggestionId: v.id("aiSuggestedResponses") },
  handler: async (ctx, { suggestionId }) => {
    // membership-check; ctx.db.patch(suggestionId, { status: "dismissed" }).
  },
});
```
Vul de twee handlers concreet in volgens het membership-guard-patroon van `messaging`/`contacts` (lees de suggestie, check `requireWorkspaceMembership(ctx, suggestion.workspaceId)`, dan versturen/patchen).

- [ ] **Step 2: Toon de suggestie op de lead-card**

In `lead-card.tsx`: `const pending = useQuery(api.aiLeadResponse.pendingForContact, { contactId: lead._id })`. Als `pending`, render een blok "🤖 AI-concept (${pending.channel})" met de `body` + knoppen **Verstuur** (`sendSuggestion`) en **Negeer** (`dismissSuggestion`), met optimistic toast.

- [ ] **Step 3: Build + check**

Run: `npm run build` (groen). Met `mode="suggest"` en een test-lead: er verschijnt een AI-concept-blok op de kaart; "Verstuur" stuurt het bericht en het blok verdwijnt.

- [ ] **Step 4: Commit**

```bash
git add convex/aiLeadResponse.ts src/components/crm/lead-card.tsx convex/_generated
git commit -m "feat(ai-agent): suggest-modus — AI-concept op lead-card (verstuur/negeer)"
```

---

### Task 8: End-to-end verificatie (suggest → auto)

- [ ] **Step 1:** Zet in `/crm/settings/ai-agent`: enabled=true, mode=suggest, vul Anthropic-key + businessContext.
- [ ] **Step 2:** Vuur een Meta-test-lead met uniek e-mailadres af → controleer dat er een `aiSuggestedResponses`-rij (pending) komt en een AI-concept op de lead-card.
- [ ] **Step 3:** Verstuur het concept → status `sent`, bericht in `/crm/messages`.
- [ ] **Step 4:** Zet mode=auto, vuur opnieuw een lead met uniek adres → bericht gaat automatisch (status `sent`), respecteert dedup bij directe her-submission (geen 2e binnen 24u).
- [ ] **Step 5:** Final commit / merge via `superpowers:finishing-a-development-branch`.

---

## Self-Review
- **Spec-coverage:** config-tabel (T1/T3), suggesties (T1/T7), handler+guardrails (T4), channel/quiet-hours/prompt (T2), trigger (T5), settings+preview (T6), suggest-UI (T7), e2e (T8). Alle spec-secties gedekt.
- **Types:** `Channel` consistent (helpers.ts → handler). `aiSuggestedResponses.status` union consistent tussen schema (T1) en mutations (T4/T7). `messaging.sendInternal`-args ({contactId, channel, body}) kloppen met de echte signature.
- **Open punt (bewust):** `requireWorkspaceMembership` + `getAuthUserId` exact-import verifiëren tijdens T3/T7 (genoemd in de stappen). De twee UI-handlers in T7 hebben hun guard-patroon beschreven i.p.v. volledig uitgeschreven — invullen volgens bestaand messaging/contacts-patroon.
