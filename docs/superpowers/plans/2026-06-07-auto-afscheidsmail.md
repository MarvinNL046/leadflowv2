# Auto-afscheidsmail bij 3-strike — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** Optioneel automatisch de "Afscheidsmail (Deal Verloren)"-template mailen bij 3-strike-onbereikbaar. Opt-in, default uit.

**Architecture:** Nieuwe setting `sendEmailOnUnreachable`; backend-twin van de template-render-helpers; send-trigger in het bestaande `isFinalStrike`-blok via `scheduler → sendInternal`. Toggle in lead-flow-settings.

**Spec:** `docs/superpowers/specs/2026-06-07-auto-afscheidsmail-design.md`

**Outward-action maar opt-in/default-uit + gegate. Normale merge-route na go.**

---

### Task 0: Branch
```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/auto-afscheidsmail
```

---

### Task 1: Render-helpers `convex/templateRender.ts` (TDD)

**Files:** create `convex/templateRender.test.ts`, `convex/templateRender.ts`

- [ ] **Step 1: Falende test** — `convex/templateRender.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  htmlToPlainText,
  leadTemplateVars,
} from "./templateRender";

const contact = {
  firstName: "Jan",
  lastName: "Jansen",
  email: "jan@x.nl",
  phone: "0612",
  city: "Maastricht",
  company: null,
};

describe("renderTemplate", () => {
  it("substitueert contact-vars + company", () => {
    const vars = leadTemplateVars(contact);
    expect(renderTemplate("Beste {{contact.firstName}}", vars)).toBe("Beste Jan");
    expect(renderTemplate("{{contact.fullName}}", vars)).toBe("Jan Jansen");
    expect(renderTemplate("{{company}}", vars)).toBe("Staycool Airconditioning");
  });
  it("ontbrekende var → lege string", () => {
    expect(renderTemplate("[{{onbekend}}]", {})).toBe("[]");
  });
});

describe("htmlToPlainText", () => {
  it("strip tags", () => {
    expect(htmlToPlainText("<p>Hallo <b>Jan</b></p>")).toBe("Hallo Jan");
  });
});
```

- [ ] **Step 2:** Run → FAIL: `npx vitest run convex/templateRender.test.ts`

- [ ] **Step 3: Implementeer** — `convex/templateRender.ts` (backend-twin van `src/lib/templates.ts`):
```ts
/**
 * Backend-twin van src/lib/templates.ts (Convex kan niet uit src/ importeren).
 * Pure helpers → unit-testbaar. Houd in sync met src/lib/templates.ts.
 */

export function renderTemplate(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, vars);
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function leadTemplateVars(lead: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  company?: string | null;
}): Record<string, unknown> {
  return {
    contact: {
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      fullName: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      city: lead.city ?? "",
    },
    company: "Staycool Airconditioning",
  };
}
```

- [ ] **Step 4:** Run → PASS. Commit:
```bash
git add convex/templateRender.ts convex/templateRender.test.ts
git commit -m "feat(email): backend template-render-helpers + tests"
```

---

### Task 2: Schema — setting

**Files:** `convex/schema.ts`

- [ ] **Step 1:** In `crmSettings`, voeg ná `customerCallbackDays: v.optional(v.number()),` toe:
```ts
    /** true = auto-afscheidsmail sturen bij 3-strike-onbereikbaar (default false). */
    sendEmailOnUnreachable: v.optional(v.boolean()),
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/schema.ts
git commit -m "feat(email): crmSettings.sendEmailOnUnreachable veld"
```

---

### Task 3: `crmSettings.ts`

**Files:** `convex/crmSettings.ts`

- [ ] **Step 1:** `DEFAULT_SETTINGS` + ná `customerCallbackDays: 7,`:
```ts
  sendEmailOnUnreachable: false,
```

- [ ] **Step 2:** `get`-return + ná de `customerCallbackDays`-regel:
```ts
      sendEmailOnUnreachable:
        settings?.sendEmailOnUnreachable ??
        DEFAULT_SETTINGS.sendEmailOnUnreachable,
```

- [ ] **Step 3:** `update.args` + ná `customerCallbackDays: v.optional(v.number()),`:
```ts
    sendEmailOnUnreachable: v.optional(v.boolean()),
```
en in het patch-blok ná de `customerCallbackDays`-patch:
```ts
    if (args.sendEmailOnUnreachable !== undefined)
      patch.sendEmailOnUnreachable = args.sendEmailOnUnreachable;
```

- [ ] **Step 4:** `getEffectiveSettings` return-type + ná `customerCallbackDays: number;`:
```ts
  sendEmailOnUnreachable: boolean;
```
en return-value ná de `customerCallbackDays`-regel:
```ts
    sendEmailOnUnreachable:
      settings?.sendEmailOnUnreachable ??
      DEFAULT_SETTINGS.sendEmailOnUnreachable,
```

- [ ] **Step 5:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/crmSettings.ts
git commit -m "feat(email): sendEmailOnUnreachable in get/update/effective/defaults"
```

---

### Task 4: Final-strike e-mail in `recordCallNoAnswer`

**Files:** `convex/contacts.ts`

- [ ] **Step 1: Import** — voeg bij de imports toe:
```ts
import {
  renderTemplate,
  htmlToPlainText,
  leadTemplateVars,
} from "./templateRender";
```

- [ ] **Step 2:** In `recordCallNoAnswer`, ín het `if (isFinalStrike) { ... }`-blok, direct ná de `triggerLeadUnreachable`-schedule (na de `);` van `ctx.scheduler.runAfter(0, internal.workflowEngine.triggerLeadUnreachable, {...})`), voeg toe:
```ts
      // Optionele auto-afscheidsmail (opt-in, default uit). Alleen bij de
      // transitie naar onbereikbaar (!contact.unreachable = pre-patch) + als
      // er een e-mailadres is. Template ontbreekt → stil skippen.
      if (
        settings.sendEmailOnUnreachable &&
        !contact.unreachable &&
        contact.email
      ) {
        const templates = await ctx.db
          .query("emailTemplates")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", contact.workspaceId),
          )
          .collect();
        const goodbye = templates.find(
          (t) => t.name.toLowerCase() === "afscheidsmail (deal verloren)",
        );
        if (goodbye) {
          const vars = leadTemplateVars({
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            city: contact.city,
            company: contact.company,
          });
          const subject = renderTemplate(goodbye.subject, vars);
          const html = renderTemplate(goodbye.body, vars);
          await ctx.scheduler.runAfter(0, internal.messaging.sendInternal, {
            contactId: args.contactId,
            channel: "email" as const,
            subject,
            body: htmlToPlainText(html),
            htmlBody: html,
          });
        }
      }
```

- [ ] **Step 3:** `npx convex dev --once` → schoon. Commit:
```bash
git add convex/contacts.ts
git commit -m "feat(email): auto-afscheidsmail bij 3-strike (opt-in, gegate)"
```

---

### Task 5: UI-toggle in lead-flow-settings

**Files:** `src/routes/crm.settings_.lead-flow.tsx`

- [ ] **Step 1:** `DEFAULTS` + `sendEmailOnUnreachable: false,`. State: `const [sendEmailOnUnreachable, setSendEmail] = useState(false)`. In `useEffect([settings])`: `setSendEmail(settings.sendEmailOnUnreachable)`. In `resetToDefaults`: `setSendEmail(false)`. In `handleSave`'s `update({...})`: voeg `sendEmailOnUnreachable,` toe.

- [ ] **Step 2:** In de "Drempelwaarden"-Card (ná de bestaande velden, vóór `</CardContent>`), voeg een toggle-rij toe:
```tsx
            <div className="space-y-1.5">
              <Label>Auto-afscheidsmail bij 3-strike</Label>
              <div>
                <button
                  type="button"
                  onClick={() => setSendEmailOnUnreachable((v) => !v)}
                  className={
                    sendEmailOnUnreachable
                      ? 'rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700'
                      : 'rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50'
                  }
                  aria-pressed={sendEmailOnUnreachable}
                >
                  {sendEmailOnUnreachable ? 'Aan' : 'Uit'}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Stuurt automatisch de "Afscheidsmail (Deal Verloren)"-template
                wanneer een lead na {maxCallAttempts} mislukte belpogingen
                onbereikbaar wordt (alleen als er een e-mailadres is).
              </p>
            </div>
```

- [ ] **Step 3:** `npm run build` → `✓ built`; `npx tsc --noEmit 2>&1 | grep -E "lead-flow\.tsx"` → geen nieuwe fouten. Commit:
```bash
git add src/routes/crm.settings_.lead-flow.tsx
git commit -m "feat(email): toggle 'Auto-afscheidsmail bij 3-strike' in lead-flow-settings"
```

---

### Task 6: Eindverificatie

- [ ] **Step 1:** `npx vitest run` (groen, incl. templateRender) · `npx convex dev --once` (schoon) · `npm run build` (`✓ built`).

- [ ] **Step 2: Dev-smoke** — toggle AAN in `/crm/settings/lead-flow`; op een test-contact mét test-e-mail 3× "Niet bereikt" (via lead-dialog "Bel" → niet bereikt, of een debug-mutatie die callCount opvoert) → bij de 3e: een `messages`-row (channel email) verschijnt + `npx convex logs` toont de sendInternal-run. Toggle UIT → geen mail. (Geen echte persoon mailen — test-adres.)

- [ ] **Step 3:** Branch pushen + rapporteren (normale merge-route na go):
```bash
git push -u origin feat/auto-afscheidsmail
```
