# WhatsApp outbound-capture (bug 3) — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** `message.outbound`-webhooks (telefoon-verstuurde WhatsApp) opslaan als outbound-bericht gekoppeld aan het `to`-contact, zodat de volledige conversatie in Leadflow staat.

**Architecture:** `recordOutbound` internalMutation (spiegel van `recordInbound`, contact op `to`, dedup op externalMessageId) + handler vangt `event:"message.outbound"` af + ack-numerieke status (2→delivered, 3→read).

**Tech Stack:** Convex (httpAction + internalMutation).

**Spec:** `docs/superpowers/specs/2026-06-08-whatsapp-outbound-capture-design.md`

**Additief; raakt alleen tot nu toe genegeerde webhooks. Prod-smoke met Marvins telefoon. Normale merge-route na go.**

---

### Task 0: Branch (AL GEDAAN)
Branch `fix/whatsapp-outbound-capture` bestaat + spec gecommit. Geen actie.

---

### Task 1: `recordOutbound` internalMutation

**Files:** Modify `convex/messaging.ts`

- [ ] **Step 1:** Voeg direct ná de `recordInbound`-mutation (eindigt met `return { matched:
  !!contactId, messageId }; }, });`) toe:
```ts

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
          contactId = await ctx.db.insert("contacts", {
            workspaceId: args.workspaceId,
            email: normalized,
            callCount: 0,
          });
        }
      } else {
        const normalized = normalizePhone(args.to);
        if (normalized) {
          contactId = await ctx.db.insert("contacts", {
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
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/messaging\.ts"` && echo FOUTEN || echo schoon. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/messaging.ts convex/_generated
git commit -m "feat(whatsapp): recordOutbound-mutation (slaat outbound-webhook op)"
```

---

### Task 2: Handler — `message.outbound` + ack-numerieke status

**Files:** Modify `convex/http.ts`

- [ ] **Step 1: `VoidfixWaEvent`-type uitbreiden** — vervang (regel ~844-855):
```ts
interface VoidfixWaEvent {
  event?: string;
  from?: string;
  phoneNumber?: string;
  body?: string;
  message?: string;
  messageId?: string;
  id?: string;
  status?: string;
  mediaUrl?: string;
  mediaType?: string;
}
```
  door:
```ts
interface VoidfixWaEvent {
  event?: string;
  from?: string;
  to?: string;
  phoneNumber?: string;
  body?: string;
  message?: string;
  messageId?: string;
  id?: string;
  status?: string | number;
  mediaUrl?: string;
  mediaType?: string;
}
```

- [ ] **Step 2: `message.outbound` afvangen** — in de `/webhooks/voidfix-wa`-handler, direct
  ná het `payload = JSON.parse(...)`-blok (de `catch { ... }`) en VÓÓR de
  `// Filter op inbound events`-comment, toevoegen:
```ts
    // Outbound: bericht verstuurd vanaf de gekoppelde bedrijfstelefoon (of een
    // echo van een via-Leadflow verstuurd bericht). recordOutbound dedupt op
    // externalMessageId, dus API-verstuurde berichten worden niet dubbel opgeslagen.
    if (payload.event === "message.outbound") {
      const to = payload.to ?? payload.phoneNumber;
      if (!to) {
        return jsonResponse({ received: true, skipped: "no to" }, 200);
      }
      const wsId = await ctx.runQuery(
        internal.messaging.getStaycoolWorkspaceIdInternal,
        {},
      );
      if (!wsId) {
        return jsonResponse({ error: "Workspace not provisioned" }, 500);
      }
      await ctx.runMutation(internal.messaging.recordOutbound, {
        workspaceId: wsId,
        channel: "whatsapp",
        to,
        body: payload.message ?? payload.body ?? "",
        from: payload.from,
        externalMessageId: payload.messageId ?? payload.id ?? undefined,
        mediaUrl: payload.mediaUrl ?? undefined,
        mediaType: payload.mediaType ?? undefined,
      });
      return jsonResponse({ received: true, type: "outbound" }, 200);
    }

```

- [ ] **Step 3: ack-numerieke status** — vervang de `statusMap`-declaratie in de
  status-receipt-tak:
```ts
        const statusMap: Record<
          string,
          "delivered" | "failed" | "bounced" | "read" | null
        > = {
          sent: null,
          delivered: "delivered",
          read: "read",
          failed: "failed",
        };
```
  door (numerieke WhatsApp-ack-levels toegevoegd: 1=sent, 2=delivered, 3=read):
```ts
        const statusMap: Record<
          string,
          "delivered" | "failed" | "bounced" | "read" | null
        > = {
          sent: null,
          delivered: "delivered",
          read: "read",
          failed: "failed",
          "1": null,
          "2": "delivered",
          "3": "read",
        };
```

- [ ] **Step 4:** `npx convex dev --once` → schoon. `npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/http\.ts"` && echo FOUTEN || echo schoon. Commit:
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/http.ts convex/_generated
git commit -m "feat(whatsapp): webhook slaat message.outbound op + ack-numerieke status (bug 3)"
```

---

### Task 3: Eindverificatie + reversibele CLI-smoke

**Files:** tijdelijk `convex/__debug.ts` (daarna verwijderd)

- [ ] **Step 1: Build-gates**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run            # groen (geen nieuwe tests, suite blijft groen)
npx convex dev --once     # schoon
npm run build             # ✓ built
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/(messaging|http)\.ts" && echo "FOUTEN" || echo "geen nieuwe fouten in changed files"
```

- [ ] **Step 2: Reversibele CLI-smoke** — `convex/__debug.ts`:
```ts
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

type OutboundResult = { matched?: boolean; duplicate?: boolean };

/** WEGWERP — verifieert recordOutbound (match/dedup/kaal contact). Verwijder na run. */
export const smokeOutbound = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (!user) throw new Error("geen user");
    const orgId = await ctx.db.insert("orgs", {
      name: "__smoke_wo",
      slug: "__smoke_wo_" + user._id,
      ownerId: user._id,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      orgId,
      name: "WS",
      isDefault: false,
    });
    const knownPhone = "+31600000001";
    const knownContact = await ctx.db.insert("contacts", {
      workspaceId,
      phone: knownPhone,
      callCount: 0,
    });
    const ext1 = "ext-1-" + workspaceId;
    const ext2 = "ext-2-" + workspaceId;

    // 1) match op `to` → message gekoppeld aan bestaand contact.
    const r1 = (await ctx.runMutation(internal.messaging.recordOutbound, {
      workspaceId,
      channel: "whatsapp" as const,
      to: knownPhone,
      body: "hoi",
      externalMessageId: ext1,
    })) as OutboundResult;
    // 2) dedup: zelfde externalMessageId → geen 2e rij.
    const r2 = (await ctx.runMutation(internal.messaging.recordOutbound, {
      workspaceId,
      channel: "whatsapp" as const,
      to: knownPhone,
      body: "weer",
      externalMessageId: ext1,
    })) as OutboundResult;
    // 3) onbekend `to` → kaal contact + message.
    const r3 = (await ctx.runMutation(internal.messaging.recordOutbound, {
      workspaceId,
      channel: "whatsapp" as const,
      to: "+31600000002",
      body: "nieuw",
      externalMessageId: ext2,
    })) as OutboundResult;

    const knownMsgs = await ctx.db
      .query("messages")
      .withIndex("by_contact_sent", (q) => q.eq("contactId", knownContact))
      .collect();
    const result = {
      matchedExistingContact:
        r1.matched === true &&
        knownMsgs.some((m) => m.direction === "outbound" && m.body === "hoi"),
      deduped: r2.duplicate === true,
      createdContactForUnknown: r3.matched === true,
    };

    // Teardown — per contact z'n messages, dan de contacts, workspace, org.
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();
    for (const c of contacts) {
      for (const m of await ctx.db
        .query("messages")
        .withIndex("by_contact_sent", (q) => q.eq("contactId", c._id))
        .collect())
        await ctx.db.delete(m._id);
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(workspaceId);
    await ctx.db.delete(orgId);

    return result;
  },
});
```

- [ ] **Step 3: Run smoke**
```bash
cd /home/marvin/Projecten/leadflowv2
npx convex dev --once
npx convex run __debug:smokeOutbound '{}'
```
  Verwacht: `{ matchedExistingContact: true, deduped: true, createdContactForUnknown: true }`.

- [ ] **Step 4: Verwijder debug + redeploy**
```bash
cd /home/marvin/Projecten/leadflowv2
rm convex/__debug.ts
npx convex dev --once
```

- [ ] **Step 5: Branch pushen (normale merge-route na go):**
```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin fix/whatsapp-outbound-capture
```

- [ ] **Step 6: PROD-smoke (ná merge + deploy, met Marvin):** Marvin stuurt 1 WhatsApp vanaf
  de bedrijfstelefoon naar een lead → het bericht verschijnt als outbound-bubble in het
  Leadflow-gesprek van dat contact (`/crm` → contact → Messages, of de Messages-inbox).
