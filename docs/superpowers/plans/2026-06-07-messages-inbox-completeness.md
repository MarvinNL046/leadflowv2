# Messages — Inbox-completeness — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** v2-inbox afmaken: e-mail-filter, ongelezen-per-kanaal-badges, gesprekken archiveren (reversibel), ongekoppelde inbound → auto kaal contact.

**Spec:** `docs/superpowers/specs/2026-06-07-messages-inbox-completeness-design.md`

**Tech:** Convex + TanStack Start. Niet mergen/prod zonder Marvins go.

---

### Task 1: Schema — `contacts.messagesArchivedAt`
**File:** `convex/schema.ts` (contacts-tabel)

- [ ] Voeg veld toe aan `contacts: defineTable({ ... })`:
```ts
    messagesArchivedAt: v.optional(v.number()),
```
- [ ] `npx convex dev --once` → schoon (additief veld, geen migratie).
- [ ] Commit: `feat(messages): contacts.messagesArchivedAt veld voor gesprek-archief`

---

### Task 2: `recordInbound` — auto kaal contact bij geen match
**File:** `convex/messaging.ts` (in `recordInbound`, ná de contact-lookup, vóór `const messageId = await ctx.db.insert("messages"`)

- [ ] Voeg in:
```ts
    // Geen match → maak een kaal contact zodat het bericht zichtbaar wordt in
    // de inbox (listConversations skipt contactloze messages). GEEN opp /
    // leadAttribution / trigger: een inbound van een onbekende is nog geen
    // gekwalificeerde lead — de gebruiker vult aan / promoot via de contact-UI.
    if (!contactId) {
      if (args.channel === "email") {
        const normalized = normalizeEmail(args.from);
        if (normalized) {
          contactId = await ctx.db.insert("contacts", {
            workspaceId: args.workspaceId,
            email: normalized,
            callCount: 0,
          });
        }
      } else {
        const normalized = normalizePhone(args.from);
        if (normalized) {
          contactId = await ctx.db.insert("contacts", {
            workspaceId: args.workspaceId,
            phone: normalized,
            callCount: 0,
          });
        }
      }
    }
```
- [ ] `npx convex dev --once` → schoon. Commit: `feat(messages): inbound van onbekend nummer maakt kaal contact (niet meer verloren)`

---

### Task 3: `listConversations` — `includeArchived` + archief-filter
**File:** `convex/messaging.ts` (`listConversations`)

- [ ] Voeg arg toe (na `channel`):
```ts
    includeArchived: v.optional(v.boolean()),
```
- [ ] In de enrich-map, vervang de filter-regel:
```ts
        if (!c || c.deletedAt !== undefined) return null;
```
door:
```ts
        if (!c || c.deletedAt !== undefined) return null;
        if (!args.includeArchived && c.messagesArchivedAt != null) return null;
```
- [ ] `npx convex dev --once` → schoon. Commit: `feat(messages): listConversations filtert gearchiveerde gesprekken (includeArchived)`

---

### Task 4: archive/unarchive-mutations
**File:** `convex/messaging.ts` (nieuwe exports; hergebruik het membership-patroon van `markConversationRead`)

- [ ] Voeg toe:
```ts
export const archiveConversation = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await getAuthUserId(ctx);
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
    const userId = await getAuthUserId(ctx);
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
```
- [ ] `npx convex dev --once` → schoon. Commit: `feat(messages): archive/unarchiveConversation mutations`

---

### Task 5: `inboxUnreadCounts` query (per-kanaal ongelezen)
**File:** `convex/messaging.ts` (nieuwe export)

- [ ] Voeg toe (telt per kanaal de gesprekken met een ongelezen inkomend laatste bericht; respecteert archief/deleted):
```ts
export const inboxUnreadCounts = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
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
      // Per contact het laatste bericht (recent is desc) → tel ongelezen inbound.
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
```
- [ ] `npx convex dev --once` → schoon. Commit: `feat(messages): inboxUnreadCounts query (ongelezen per kanaal)`

---

### Task 6: UI — `crm.messages.tsx`
**File:** `src/routes/crm.messages.tsx`

- [ ] **E-mail-tab:** voeg aan de kanaalfilter (`ChannelFilterButton`-rij, nu Alle/SMS/WhatsApp) een **"E-mail"**-tab toe die `channel: "email"` meegeeft aan `listConversations`.
- [ ] **Unread-badges:** voeg `const unread = useQuery(api.messaging.inboxUnreadCounts, workspaceId ? { workspaceId } : 'skip')` toe; toon per tab een badge (`unread?.sms` etc.) als > 0. (Alle-tab = `unread?.total`.)
- [ ] **Archief-toggle:** state `showArchived`; geef `includeArchived: showArchived` mee aan `listConversations`; toggle-knop ("Toon gearchiveerd" / "Verberg gearchiveerd") in de lijst-header.
- [ ] **Archiveer-knop per gesprek:** in de `ConversationRow` (hover) én in de thread-header een knop die `api.messaging.archiveConversation`/`unarchiveConversation` (`useMutation`) aanroept met de `contactId`. Toon "Un-archiveer" als het gesprek gearchiveerd is (in showArchived-modus). Gebruik een toast (`sonner`) + `humanizeConvexError`.
- [ ] `npm run build` → `✓ built`; `npx tsc --noEmit` → geen nieuwe fouten in dit bestand.
- [ ] Commit: `feat(messages): inbox-UI — e-mail-tab, ongelezen-badges per kanaal, archiveren + toggle`

---

### Task 7: Eindverificatie
- [ ] `npx vitest run` groen · `npx convex dev --once` schoon · `npm run build` schoon (tsc geen nieuwe fouten).
- [ ] Dev-smoke (browser, ingelogd op localhost:5173/crm/messages): E-mail-tab filtert; ongelezen-badges per kanaal kloppen; archiveer → gesprek weg, "Toon gearchiveerd" → terug + un-archiveer; (optioneel) test-inbound van onbekend nummer → nieuw gesprek met kaal contact.
- [ ] Branch gepusht. GEEN merge/prod zonder Marvins go.
