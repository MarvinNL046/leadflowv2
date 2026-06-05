# AI-reactie als Workflow-node — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox (`- [ ]`) syntax.

**Goal:** De standalone AI-agent omvormen tot een herbruikbare workflow-node ("AI-reactie"), met de AI-instellingen workspace-breed in Settings en mode/kanaal/doel per node.

**Architecture:** Extract `handleNewLead` → herbruikbare internalAction `runAiResponse({contactId, workspaceId, config})`. De workflow-engine `runNode` krijgt een `ai_respond` action-subType die `runAiResponse` aanroept met `node.config`. De directe trigger in `metaProcessor` vervalt; lead-intake → `triggerContactCreated` → workflow → AI-node. Settings houdt key/context/toon/model/guardrails; mode/kanaal/bookingUrl verhuizen naar de node.

**Tech Stack:** Convex (internalAction/runNode-engine), TanStack Start + React, shadcn.

**Spec:** `docs/superpowers/specs/2026-06-05-ai-workflow-node-consolidation-design.md`

**Belangrijk:** agent draait dormant → geen live gedrag te behouden. Niet mergen/prod zonder Marvins go.

---

### Task 1: Pure helpers — `resolveAiNodeConfig` + `buildPrompt` goal-veld

**Files:**
- Modify: `convex/aiLeadResponse/helpers.ts`
- Modify: `convex/aiLeadResponse/helpers.test.ts`

- [ ] **Stap 1: Test toevoegen (helpers.test.ts)**

```ts
import { resolveAiNodeConfig } from "./helpers";

describe("resolveAiNodeConfig", () => {
  it("vult veilige defaults bij lege config", () => {
    const c = resolveAiNodeConfig({});
    expect(c.mode).toBe("suggest");
    expect(c.channelOrder).toEqual(["sms", "email"]);
    expect(c.bookingUrl).toContain("afspraken.staycoolairco.nl");
  });
  it("respecteert opgegeven node-config", () => {
    const c = resolveAiNodeConfig({
      mode: "auto",
      channelOrder: ["whatsapp", "sms"],
      bookingUrl: "https://x.nl/",
      goal: "kort opvolgen",
    });
    expect(c.mode).toBe("auto");
    expect(c.channelOrder).toEqual(["whatsapp", "sms"]);
    expect(c.goal).toBe("kort opvolgen");
  });
  it("valt terug op suggest bij onbekende mode", () => {
    expect(resolveAiNodeConfig({ mode: "xxx" }).mode).toBe("suggest");
  });
});
```

- [ ] **Stap 2: Run → faalt** `npx vitest run` → `resolveAiNodeConfig is not a function`.

- [ ] **Stap 3: Implementeer in helpers.ts** (onderaan toevoegen)

```ts
export interface AiNodeConfig {
  mode: "suggest" | "auto";
  channelOrder: Channel[];
  bookingUrl: string;
  whatsappTemplateName?: string;
  goal?: string;
}

/** Normaliseert de vrije workflow-node-config (config: v.any) naar een veilige
 *  AiNodeConfig met defaults. mode/kanaal/doel komen van de node; key/toon/model
 *  + guardrails komen workspace-breed uit aiLeadResponseConfigs. */
export function resolveAiNodeConfig(raw: unknown): AiNodeConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  const order = Array.isArray(c.channelOrder)
    ? (c.channelOrder as Channel[]).filter((x) =>
        ["whatsapp", "sms", "email"].includes(x),
      )
    : [];
  return {
    mode: c.mode === "auto" ? "auto" : "suggest",
    channelOrder: order.length ? order : ["sms", "email"],
    bookingUrl:
      typeof c.bookingUrl === "string" && c.bookingUrl
        ? c.bookingUrl
        : "https://afspraken.staycoolairco.nl/",
    whatsappTemplateName:
      typeof c.whatsappTemplateName === "string"
        ? c.whatsappTemplateName
        : undefined,
    goal: typeof c.goal === "string" && c.goal ? c.goal : undefined,
  };
}
```

- [ ] **Stap 4: `buildPrompt` uitbreiden met optioneel `goal`** — voeg `goal?: string` toe aan de opts en, indien gezet, een regel aan `system`:

In de `opts`-type van `buildPrompt`, voeg `goal?: string;` toe. In de `system`-array, vóór de "Regels:"-regel, voeg toe:
```ts
    opts.goal ? `Extra doel/instructie: ${opts.goal}` : "",
```

- [ ] **Stap 5: Run → groen** `npx vitest run` → alle tests passen.

- [ ] **Stap 6: Commit**
```bash
git add convex/aiLeadResponse/helpers.ts convex/aiLeadResponse/helpers.test.ts
git commit -m "feat(ai-node): resolveAiNodeConfig helper + buildPrompt goal-veld"
```

---

### Task 2: `runAiResponse` internalAction (geëxtraheerd uit handleNewLead)

**Files:**
- Modify: `convex/aiLeadResponse.ts`

- [ ] **Stap 1: Voeg `runAiResponse` toe** (naast `handleNewLead`; importeer `resolveAiNodeConfig` uit helpers). Dit is `handleNewLead`'s logica, maar mode/kanaal/bookingUrl/goal komen uit `nodeConfig`, en de quiet-hours-defer her-schedulet `runAiResponse` (niet `handleNewLead`):

```ts
export const runAiResponse = internalAction({
  args: {
    contactId: v.id("contacts"),
    workspaceId: v.id("workspaces"),
    nodeConfig: v.any(),
  },
  handler: async (ctx, { contactId, workspaceId, nodeConfig }): Promise<{
    status: "suggested" | "sent" | "failed" | "deferred" | "skipped";
    reason?: string;
  }> => {
    const node = resolveAiNodeConfig(nodeConfig);
    const cfg = await ctx.runQuery(internal.aiAgentConfig.getConfigInternal, {
      workspaceId,
    });
    if (!cfg) return { status: "skipped", reason: "geen AI-instellingen" };
    if (!cfg.anthropicApiKeyEncrypted)
      return { status: "skipped", reason: "geen Anthropic-key" };

    // dedup (24u)
    const dup = await ctx.runQuery(internal.aiLeadResponse.recentlyResponded, {
      contactId,
      since: Date.now() - DAY_MS,
    });
    if (dup) return { status: "skipped", reason: "recent al gereageerd" };

    const lead = await ctx.runQuery(internal.aiLeadResponse.getLeadContext, {
      contactId,
    });
    if (!lead) return { status: "skipped", reason: "lead niet gevonden" };

    // Amsterdamse wandklok (Convex draait UTC → géén setHours).
    const amsParts = new Intl.DateTimeFormat("nl-NL", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      timeZone: "Europe/Amsterdam",
    }).formatToParts(new Date());
    const amsPart = (t: string) =>
      Number(amsParts.find((p) => p.type === t)?.value ?? 0);
    const hour = amsPart("hour") % 24;
    const minute = amsPart("minute");
    const second = amsPart("second");
    const qStart = cfg.quietHoursStart ?? 21;
    const qEnd = cfg.quietHoursEnd ?? 8;

    if (node.mode === "auto" && isWithinQuietHours(hour, qStart, qEnd)) {
      await ctx.scheduler.runAt(
        Date.now() + msUntilAmsterdamHour(hour, minute, qEnd),
        internal.aiLeadResponse.runAiResponse,
        { contactId, workspaceId, nodeConfig },
      );
      return { status: "deferred", reason: "quiet hours" };
    }

    if (node.mode === "auto") {
      const startOfDay =
        Date.now() - msSinceAmsterdamMidnight(hour, minute, second);
      const sentToday = await ctx.runQuery(
        internal.aiLeadResponse.countAutoSentToday,
        { workspaceId, since: startOfDay },
      );
      const cap = cfg.dailyCap ?? 200;
      if (sentToday >= cap)
        return { status: "skipped", reason: `dagcap ${cap} bereikt` };
    }

    const channel: Channel | null = pickChannel(
      node.channelOrder,
      { phone: lead.phone, email: lead.email },
      node.whatsappTemplateName ?? null,
    );
    if (!channel) return { status: "skipped", reason: "geen kanaal beschikbaar" };

    const apiKey = await decryptSecret(cfg.anthropicApiKeyEncrypted);
    const { system, user } = buildPrompt({
      businessContext: cfg.businessContext,
      tone: cfg.tone,
      signature: cfg.signature,
      bookingUrl: node.bookingUrl,
      goal: node.goal,
      contact: { firstName: lead.firstName, lastName: lead.lastName, city: lead.city },
      formAnswers: lead.formAnswers,
    });

    const body = await callAnthropic(apiKey, cfg.model, system, user);
    if (!body) return { status: "skipped", reason: "geen AI-output" };

    if (node.mode === "auto") {
      try {
        await ctx.runAction(internal.messaging.sendInternal, {
          contactId,
          channel,
          body,
        });
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId, contactId, channel, body, model: cfg.model, status: "sent",
        });
        return { status: "sent" };
      } catch (sendErr) {
        console.error("[ai-node] sendInternal faalde:", sendErr);
        await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
          workspaceId, contactId, channel, body, model: cfg.model, status: "failed",
        });
        return { status: "failed", reason: "verzenden mislukt" };
      }
    }
    await ctx.runMutation(internal.aiLeadResponse.recordSuggestion, {
      workspaceId, contactId, channel, body, model: cfg.model, status: "pending",
    });
    return { status: "suggested" };
  },
});
```

Voeg `resolveAiNodeConfig` toe aan de helpers-import bovenaan het bestand.

- [ ] **Stap 2: Typecheck** `npx convex dev --once` → schoon.

- [ ] **Stap 3: Commit**
```bash
git add convex/aiLeadResponse.ts
git commit -m "feat(ai-node): runAiResponse internalAction (herbruikbaar, node-config-gedreven)"
```

---

### Task 3: `ai_respond` case in de workflow-engine

**Files:**
- Modify: `convex/workflowEngine.ts` (in `runNode`, de `action`-tak)

- [ ] **Stap 1:** In `runNode`, binnen `if (node.type === "action")`, vóór de bestaande `const channel = ...`-mapping, voeg een aparte tak toe voor `ai_respond`:

```ts
        if (sub === "ai_respond") {
          const result = await ctx.runAction(
            internal.aiLeadResponse.runAiResponse,
            {
              contactId: contact._id,
              workspaceId: execution.workspaceId,
              nodeConfig: node.config,
            },
          );
          await ctx.runMutation(internal.workflowEngine.logNode, {
            executionId: args.executionId,
            nodeId: node.nodeId,
            nodeType: node.type,
            status: result.status === "failed" ? "failed" : "success",
            output: result,
            durationMs: Date.now() - startMs,
          });
          await ctx.runMutation(internal.workflowEngine.dispatchNextNodes, {
            executionId: args.executionId,
            fromNodeId: node.nodeId,
          });
          return;
        }
```

(Plaats deze `if` direct na `const config = node.config as Record<string, unknown>;` en vóór de `const channel =`-regel. De vroege `return` voorkomt dat de bestaande send-logica ook draait.)

- [ ] **Stap 2: Typecheck** `npx convex dev --once` → schoon. Let op: `execution.workspaceId` is beschikbaar via `loadNodeContext` (de `execution`-doc). Bevestig dat `execution` in scope is in `runNode` (`const { node, execution, contact } = ctxData;`).

- [ ] **Stap 3: Commit**
```bash
git add convex/workflowEngine.ts
git commit -m "feat(ai-node): ai_respond action-subType in workflow-engine runNode"
```

---

### Task 4: Workflows-mutations — node-validator + starter-workflow

**Files:**
- Modify: `convex/workflows.ts`

- [ ] **Stap 1: Breid `linearNodeValidator` uit** met de AI-node-variant:

```ts
  v.object({
    type: v.literal("action"),
    subType: v.literal("ai_respond"),
    mode: v.union(v.literal("suggest"), v.literal("auto")),
    channelOrder: v.array(
      v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("email")),
    ),
    bookingUrl: v.string(),
    whatsappTemplateName: v.optional(v.string()),
    goal: v.optional(v.string()),
  }),
```

- [ ] **Stap 2: In `createLinear`** (de node-loop), voeg een tak toe vóór de bestaande `else if (n.subType === "send_email")`-keten:

```ts
      } else if (n.subType === "ai_respond") {
        label = "AI-reactie";
        config = {
          mode: n.mode,
          channelOrder: n.channelOrder,
          bookingUrl: n.bookingUrl,
          whatsappTemplateName: n.whatsappTemplateName,
          goal: n.goal,
        };
```

(Pas dezelfde uitbreiding toe in `replaceContent` als die dezelfde node-constructie heeft.)

- [ ] **Stap 3: Voeg een starter-mutation toe** (onderaan, hergebruikt geen nieuwe helper):

```ts
/** Maakt kant-en-klaar een "AI eerste reactie op nieuwe lead"-workflow:
 *  trigger contact_created → AI-reactie-node (suggest). Eén klik vanuit AI-instellingen. */
export const createAiFirstResponseWorkflow = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    await requireWorkspaceMembership(ctx, workspaceId);
    const workflowId = await ctx.db.insert("workflows", {
      workspaceId,
      name: "AI eerste reactie op nieuwe lead",
      description: "Genereert automatisch een concept-antwoord bij elke nieuwe lead.",
      status: "active",
      triggerConfig: [{ type: "contact_created", nodeId: "trigger-1" }],
      version: 1,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
    });
    await ctx.db.insert("workflowNodes", {
      workflowId, nodeId: "trigger-1", type: "trigger", subType: "contact_created",
      positionX: 0, positionY: 0, config: {}, label: "Nieuwe lead",
    });
    await ctx.db.insert("workflowNodes", {
      workflowId, nodeId: "node-1", type: "action", subType: "ai_respond",
      positionX: 200, positionY: 0,
      config: {
        mode: "suggest",
        channelOrder: ["sms", "email"],
        bookingUrl: "https://afspraken.staycoolairco.nl/",
      },
      label: "AI-reactie",
    });
    await ctx.db.insert("workflowEdges", {
      workflowId, sourceNodeId: "trigger-1", targetNodeId: "node-1",
    });
    return { workflowId };
  },
});
```

- [ ] **Stap 4: Typecheck** `npx convex dev --once` → schoon.

- [ ] **Stap 5: Commit**
```bash
git add convex/workflows.ts
git commit -m "feat(ai-node): ai_respond in workflow-validator + createAiFirstResponseWorkflow starter"
```

---

### Task 5: Builder-UI — AI-reactie node-template + editor

**Files:**
- Modify: `src/components/crm/new-workflow-dialog.tsx`

- [ ] **Stap 1: Breid `BuilderNode` uit** met de AI-variant:

```ts
  | {
      type: 'action'
      subType: 'ai_respond'
      mode: 'suggest' | 'auto'
      channelOrder: Array<'whatsapp' | 'sms' | 'email'>
      bookingUrl: string
      goal?: string
    }
```

- [ ] **Stap 2: Voeg een template toe aan `NODE_TEMPLATES`** (kies een passend lucide-icoon, bv. `Bot` — importeer 'm):

```ts
  ai: {
    label: 'AI-reactie',
    icon: Bot,
    make: () => ({
      type: 'action',
      subType: 'ai_respond',
      mode: 'suggest',
      channelOrder: ['sms', 'email'],
      bookingUrl: 'https://afspraken.staycoolairco.nl/',
    }),
  },
```

- [ ] **Stap 3: `meta`-lookup in NodeRow** uitbreiden zodat een `ai_respond`-node `NODE_TEMPLATES.ai` pakt (voeg een tak toe vóór de email-check):
```ts
    node.subType === 'ai_respond'
      ? NODE_TEMPLATES.ai
      : /* ...bestaande keten... */
```

- [ ] **Stap 4: Config-editor** voor de AI-node (in NodeRow, naast de bestaande editors): mode-select (suggest/auto), kanaalvolgorde (drie selects of een simpele multi), bookingUrl-input, optioneel goal-textarea. Elke wijziging via `onChange({ type:'action', subType:'ai_respond', ...node, <veld> })`. Houd het simpel (mode-select + bookingUrl-input + goal-textarea; channelOrder mag een vaste default blijven met een select voor het eerste kanaal).

```tsx
      {node.type === 'action' && node.subType === 'ai_respond' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-500">Modus</Label>
            <select
              value={node.mode}
              onChange={(e) =>
                onChange({ ...node, mode: e.target.value as 'suggest' | 'auto' })
              }
              className="h-8 rounded-md border px-2 text-sm"
            >
              <option value="suggest">Concept (mens keurt goed)</option>
              <option value="auto">Automatisch versturen</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-500">Boekingslink</Label>
            <Input
              value={node.bookingUrl}
              onChange={(e) => onChange({ ...node, bookingUrl: e.target.value })}
              className="h-8"
            />
          </div>
          <NodeBodyTextarea
            value={node.goal ?? ''}
            onChange={(v) => onChange({ ...node, goal: v })}
            rows={2}
          />
        </div>
      )}
```

- [ ] **Stap 5: Build** `npm run build` → `✓ built`; `npx tsc --noEmit` → geen nieuwe fouten in dit bestand.

- [ ] **Stap 6: Commit**
```bash
git add src/components/crm/new-workflow-dialog.tsx
git commit -m "feat(ai-node): AI-reactie node-template + config-editor in workflow-builder"
```

---

### Task 6: Settings reframe → "AI-instellingen" + starter-knop

**Files:**
- Modify: `src/routes/crm.settings_.ai-agent.tsx`
- (Geen wijziging aan `aiAgentConfig.update` nodig — de extra args blijven optioneel toegestaan; de UI stuurt mode/channelOrder/bookingUrl gewoon niet meer mee.)

- [ ] **Stap 1:** Verwijder uit de settings-UI de velden **mode**, **kanaalvolgorde**, **bookingUrl**, **whatsappTemplateName** en de enabled-toggle (die verhuizen naar de workflow-node). Behoud: Anthropic-key, businessContext, tone, signature, model-select, quietHoursStart/End, dailyCap. Hernoem de paginatitel naar **"AI-instellingen"** met uitleg dat WANNEER/WAAR via Workflows gaat.

- [ ] **Stap 2:** Voeg een knop **"Maak 'AI eerste reactie'-workflow"** toe die `api.workflows.createAiFirstResponseWorkflow` aanroept (`useMutation`), met toast + link naar `/crm/workflows`. Toon een hint: "Zet daarna je Anthropic-key hierboven en de workflow op actief."

- [ ] **Stap 3:** Het hub-kaartje in `crm.settings.tsx` (label "AI-agent") → hernoem naar "AI-instellingen" (optioneel, cosmetisch).

- [ ] **Stap 4: Build** `npm run build` → `✓ built`; geen nieuwe tsc-fouten.

- [ ] **Stap 5: Commit**
```bash
git add src/routes/crm.settings_.ai-agent.tsx src/routes/crm.settings.tsx
git commit -m "feat(ai-node): settings → AI-instellingen (brein+guardrails) + starter-workflow knop"
```

---

### Task 7: Standalone trigger verwijderen

**Files:**
- Modify: `convex/metaProcessor.ts`
- Modify: `convex/aiLeadResponse.ts`

- [ ] **Stap 1:** Verwijder uit `metaProcessor.ts` de regel
`await ctx.scheduler.runAfter(0, internal.aiLeadResponse.handleNewLead, { contactId, workspaceId: workspace._id });`
(plus eventueel bijhorende comment). De lead-intake roept al `triggerContactCreated` aan → de workflow-engine (met de AI-node) neemt het over.

- [ ] **Stap 2:** Verwijder de nu-ongebruikte `handleNewLead` internalAction uit `aiLeadResponse.ts`. (De internalQueries `recentlyResponded`/`countAutoSentToday`/`getLeadContext`/`recordSuggestion` + `callAnthropic` blijven — `runAiResponse` gebruikt ze.)

- [ ] **Stap 3:** Zoek-en-controleer dat er geen andere referenties naar `handleNewLead` meer zijn: `grep -rn "handleNewLead" convex/ src/` → 0 hits.

- [ ] **Stap 4: Typecheck** `npx convex dev --once` → schoon.

- [ ] **Stap 5: Commit**
```bash
git add convex/metaProcessor.ts convex/aiLeadResponse.ts
git commit -m "refactor(ai-node): standalone handleNewLead-trigger weg — AI loopt nu via workflows"
```

---

### Task 8: Eindverificatie

- [ ] **Stap 1:** `npx vitest run` → alle tests groen (incl. resolveAiNodeConfig).
- [ ] **Stap 2:** `npx convex dev --once` → schoon.
- [ ] **Stap 3:** `npm run build` → `✓ built`; `npx tsc --noEmit` → geen nieuwe fouten t.o.v. baseline.
- [ ] **Stap 4: Dev-smoke (browser, ingelogd):**
  - AI-instellingen: key + bedrijfscontext invullen → klik "Maak 'AI eerste reactie'-workflow" → workflow verschijnt in `/crm/workflows` (actief, trigger nieuwe lead → AI-reactie suggest).
  - Vuur een Meta/test-lead met uniek e-mail → AI-node draait → suggest-concept verschijnt in de **Concepten-tab** + lead-kaart (werkstroom B).
  - Controleer dat er **één** concept ontstaat (geen dubbele van een oude trigger).
  - Auto-mode in de node: bericht verstuurd + in `/crm/messages`.

**KLAAR =** taken 1-7 geïmplementeerd + gecommit, tests/convex/build schoon, branch gepusht. GEEN merge/prod zonder Marvins go.
