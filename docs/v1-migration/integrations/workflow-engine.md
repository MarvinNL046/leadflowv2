# Workflow Engine — V1 extract voor V2 rebuild

**Volume in v1 (workspace 12, Staycool):** 1 actieve workflow ("Snelle Response"), 4 drafts. 294 executions waarvan 289 succesvol, 5 failed. Dit is **DE feature die in v2 Mia vervangt** voor automatic-response-to-leads.

## Wat doet het

Wanneer een event optreedt (contact created, opportunity-stage-veranderd, etc.) zoekt de engine alle workflows met matching trigger, instantieert een execution per workflow, en doorloopt nodes één voor één. Nodes kunnen acties triggeren (SMS, email, WhatsApp), wachten (delay), conditioneel splitsen (if/else), of contact-state aanpassen (tags, stage, fields). Asynchroon via QStash voor delays >= 1 min.

## Live voorbeeld — Staycool's "Snelle Response" workflow (id=3, active)

```yaml
trigger: contact_created  # nieuwe lead → workflow start
  ↓
delay: 3 minutes  # geeft tijd voor Meta enrichment, voorkomt webhook-race
  ↓
action: send_email
  config:
    useContactEmail: true
    subject: "Re: Je aanvraag bij {{company}}"
    body: |
      Hoi {{contact.firstName}}, dankjewel voor je aanvraag!
      Plan zelf een afspraak via https://afspraken.staycoolairco.nl/
      ...
    ccEmail: info@staycoolairco.nl
  ↓
action: send_whatsapp  (parallel met email)
  config:
    useContactPhone: true
    body: |
      Hoi {{contact.firstName}}, dank voor je aanvraag!
      Plan eenvoudig zelf een afspraak via https://afspraken.staycoolairco.nl/
    ccPhone: +31648169416
```

**Resultaten:** 294 executions, 98.3% slaagde, ~5 mislukte (vermoedelijk ongeldige phone/email). Performance is voldoende voor Staycool's volume.

## Files in v1

| File | Rol | V2-actie |
|---|---|---|
| `src/lib/workflows/engine.ts` | Core: `triggerWorkflows()`, `executeWorkflow()`, state machine | Herbouw als Convex mutation + action combo |
| `src/lib/workflows/executors/index.ts` | Dispatch per node-type (trigger/action/condition/delay) | Port met identieke node-type switch |
| `src/lib/workflows/executors/*.ts` (19 files) | Per actie-implementatie | Port één voor één, alleen die je echt nodig hebt |
| `src/lib/workflows/types.ts` | TypeScript types voor config-objects | Port als Convex `v.object(...)` schemas |
| `src/lib/workflows/templates.ts` | Voorgemaakte workflow-templates (Snelle Response, etc.) | Optioneel: ports als seed data |
| `src/lib/workflows/constants.ts` | Enum constants | Trivieel |
| `src/lib/outbox/handlers.ts` | Outbox-pattern dispatcher die triggerWorkflows() callt | In Convex: real-time queries vervangen outbox; events triggeren direct |

## Data model

```typescript
// Convex schema (sketch):

workflows: defineTable({
  workspaceId: v.id("workspaces"),
  name: v.string(),
  description: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("active"), v.literal("paused"), v.literal("archived")),
  triggerConfig: v.array(v.object({
    type: v.string(),     // "contact_created" | "opportunity_stage_changed" | ...
    nodeId: v.string(),   // matches workflowNodes.nodeId
  })),
  version: v.number(),
  totalExecutions: v.number(),
  successfulExecutions: v.number(),
  failedExecutions: v.number(),
  lastExecutedAt: v.optional(v.number()),
}).index("by_workspace_status", ["workspaceId", "status"]),

workflowNodes: defineTable({
  workflowId: v.id("workflows"),
  nodeId: v.string(),     // stable identifier across saves (frontend-generated)
  type: v.union(v.literal("trigger"), v.literal("action"), v.literal("condition"), v.literal("delay")),
  subType: v.optional(v.string()),  // bv. "send_email", "send_sms" voor actions
  positionX: v.number(),  // canvas coords (React Flow / similar)
  positionY: v.number(),
  config: v.any(),        // shape varies per subType — see types.ts
  label: v.optional(v.string()),
}).index("by_workflow", ["workflowId"]),

workflowEdges: defineTable({
  workflowId: v.id("workflows"),
  sourceNodeId: v.string(),
  targetNodeId: v.string(),
  // For condition nodes: which branch ("true" or "false")
  branchLabel: v.optional(v.string()),
}).index("by_workflow", ["workflowId"]),

workflowExecutions: defineTable({
  workflowId: v.id("workflows"),
  workspaceId: v.id("workspaces"),
  entityType: v.union(v.literal("contact"), v.literal("opportunity")),
  entityId: v.string(),
  entityData: v.any(),     // snapshot at trigger-time
  status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("paused")),
  currentNodeId: v.optional(v.string()),
  pausedUntil: v.optional(v.number()),  // for delays
  scheduledFunctionId: v.optional(v.id("_scheduled_functions")),  // Convex-native scheduling
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
```

## Trigger types in scope

Uit `src/lib/workflows/types.ts` (TriggerSubType):
- `contact_created` ✅ Staycool gebruikt deze
- `contact_updated`
- `opportunity_created`
- `opportunity_stage_changed`
- `tag_added`
- `tag_removed`
- `custom_field_changed`
- `time_based` (= cron-style scheduled trigger)
- `webhook` (= external webhook triggers workflow)

V2-aanbeveling: implement alleen `contact_created` + `opportunity_stage_changed` voor v1.0 launch. Rest on-demand.

## Action sub-types (20+ executors in v1)

| ActionSubType | V2 prio | Notes |
|---|---|---|
| `send_email` | ✅ MUST | Resend gateway, template-interpolation |
| `send_whatsapp` | ✅ MUST | Voidfix WA gateway |
| `send_sms` | ✅ MUST | Voidfix SMS gateway |
| `wait` / `delay` | ✅ MUST | Convex `scheduler.runAfter()` native — schoner dan QStash |
| `add_note` | ✅ MUST | Trivieel — INSERT note |
| `update_contact` | ✅ MUST | Trivieel — patch contact fields |
| `change_stage` | ✅ MUST | Pipeline kanban move |
| `condition` | ✅ MUST | if/else routing op contact data |
| `add_tag` / `remove_tag` | ✅ MUST | Tags-array manipulation |
| `create_task` | 🟡 NICE | Voor follow-up task assignment |
| `assign_user` | 🟡 NICE | Owner-assignment |
| `internal_notification` | 🟡 NICE | Push naar user in-app |
| `webhook` | 🟡 NICE | Outbound to klant's eigen URL |
| `add_to_workflow` | 🟡 NICE | Sub-workflow inclusion |
| `remove_from_workflow` | 🟡 NICE | Stop running execution |
| `voicemail_drop` | ❌ SKIP | Voicemail-feature niet actief gebruikt |
| `voice_call` | ❌ SKIP | Voice-call AI niet actief |

## Trigger-firing pattern

In v1:
```typescript
// Vanuit Meta processor of andere event-bron:
await publishContactEvent(OutboxEventTypes.CONTACT_CREATED, contactId, payload);
// → outbox-handler dispatches naar triggerWorkflows({eventType: "contact_created", ...})
// → engine zoekt matching workflows, start een execution per match
```

In v2 (Convex):
```typescript
// In de mutation die contact aanmaakt:
const contactId = await ctx.db.insert("contacts", {...});
await ctx.scheduler.runAfter(0, internal.workflows.trigger, {
  eventType: "contact_created",
  workspaceId,
  entityType: "contact",
  entityId: contactId,
  entityData: contact,
});
// Geen aparte outbox-tabel nodig; Convex scheduler garandeert at-least-once delivery
```

## Template-interpolation pattern

In SMS/email/WhatsApp bodies gebruik `{{contact.firstName}}`, `{{contact.email}}`, `{{company}}` etc. — interpolatie gebeurt vlak voor send.

V2: simpele regex `/{{(.+?)}}/g` met lookup in `{contact, opportunity, workspace, custom_fields}` context object. Geen Handlebars/Liquid library nodig.

## Delay-handling — v1 vs v2

**V1 (QStash):**
- Delay node berekent `resumeAt = now + delayMinutes`
- Engine roept QStash `publishJSON` met `delay: ...` → QStash callt `/api/jobs/resume-workflow` op tijd
- workflowExecutions.status = "paused", currentNodeId stored
- Bij callback: execution wordt opgepakt, start vanaf currentNodeId

**V2 (Convex scheduler):**
- Delay node: `await ctx.scheduler.runAfter(delayMs, internal.workflows.resume, {executionId})`
- Store `scheduledFunctionId` in workflowExecutions voor cancel-capability
- Schoner: geen externe QStash dependency, minder env vars, minder failure-modes

## Required env vars (v1 → wat valt weg in v2)

```bash
# V1 nodig:
QSTASH_TOKEN=...              # Skip in v2 (Convex scheduler native)
UPSTASH_REDIS_REST_TOKEN=...  # Skip — was voor rate-limiting (Convex heeft eigen)

# Behouden in v2:
RESEND_API_KEY=...            # voor send_email executor
VOIDFIX_API_KEY=...           # voor SMS + WhatsApp executors
```

## Gotchas (v1 lessons)

- **Trigger-config format-shift**: v1 ondersteunt zowel `triggerConfig: {type: ...}` (oud, object) als `[{type: ...}]` (nieuw, array). Engine.ts heeft een complex SQL-query om beide te matchen. **V2: alleen array-format, geen backwards-compat. Schoner.**
- **Outbox-pattern overhead**: 1505 outbox_events rows voor Staycool — events die wachten op processing. Door Convex's real-time mutations zijn de meeste van deze events redundant. Alleen workflow-triggers blijven via scheduler (cleaner).
- **stage_history bug**: opportunity_stage_history was apart bedoeld voor analytics maar wordt redelijk vol (1071 rows). In v2: optioneel.
- **Workflow-loops voorkomen**: `add_to_workflow` kan oneindige lussen veroorzaken als workflow A → workflow B → A. Engine.ts heeft hier max-depth guard. **V2: zelfde guard implementeren (`metadata.callChain` met max 5 levels)**.
- **Execution logs groeien snel**: 1153 rows in 294 executions = ~4 logs per execution gemiddeld. V2: retention-policy (laatste 90 dagen, dan archive).

## Convex-specifieke implementatie-tip

Convex `actions` ondersteunen `fetch` (voor externe API calls naar Voidfix/Resend/Meta) maar geen database-mutations direct. Pattern:

```typescript
export const sendSmsAction = internalAction({
  args: { contactId: v.id("contacts"), body: v.string(), workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const contact = await ctx.runQuery(internal.contacts.getById, { contactId: args.contactId });
    const response = await fetch(VOIDFIX_API, {...});
    await ctx.runMutation(internal.messageLog.insert, {...});
    return { success: response.ok };
  },
});
```

Engine wordt dan een orchestrator-mutation die per node:
- node.type === "action" → schedule de bijbehorende action
- node.type === "condition" → evaluate inline, branch
- node.type === "delay" → scheduler.runAfter
- node.type === "trigger" → no-op (pass-through)

Real-time UI: workflowExecutions table heeft een Convex `useQuery` subscription → UI ziet automatisch elke status-overgang. Geen polling, geen socket-context.

## Test plan voor v2

1. Reproduce "Snelle Response" workflow in v2: contact_created → delay 3min → email + WhatsApp
2. Trigger via een fake `contacts` insert
3. Verify: workflowExecution row + 4 execution_logs rijen + 1 email_log + 1 message_log
4. Check delay timing: scheduledFunctionId resolves precies 3 min later
5. Edge case: contact zonder phone → executor faalt graceful, execution markeert als failed met clear error

Eens dit werkt voor Snelle Response, is de engine genoeg foundation om de andere triggers (opportunity_stage_changed, etc.) on-demand toe te voegen.
