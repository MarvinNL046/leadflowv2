# Per-workspace bedrijfsnaam (email `{{company}}`) — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development of executing-plans. Checkbox-syntax.

**Goal:** Vervang de hardcoded `{{company}}` = "Staycool Airconditioning" in e-mails door een per-workspace `crmSettings.companyName`, met de org-naam als default.

**Architecture:** `companyName` als `company`-parameter door de render-helpers (beide twins) + resolved per workspace (`settings.companyName ?? org.name`) in `crmSettings.get`/`getEffectiveSettings`. Callers (backend afscheidsmail + 3 frontend-sites) geven de resolved company door. UI-veld op de templates-settings-pagina.

**Tech Stack:** Convex (query/mutation), TanStack Start (React), vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-company-name-setting-design.md`

**Additief; voor StayCool functioneel ongewijzigd (org.name = "Staycool Airconditioning"). `company`-param wordt REQUIRED → een gemiste caller = compile-fout (veilig). Normale merge-route na go.**

---

### Task 0: Branch (AL GEDAAN)
Branch `feat/company-name-setting` bestaat + spec gecommit. Geen actie.

---

### Task 1: Backend render-helper `templateRender.ts` (TDD)

**Files:** Modify `convex/templateRender.ts`, `convex/templateRender.test.ts`

- [ ] **Step 1: Test bijwerken naar nieuwe signatuur + company-case** — vervang in
  `convex/templateRender.test.ts` het `renderTemplate`-describe-blok:
```ts
describe("renderTemplate", () => {
  it("substitueert contact-vars + company", () => {
    const vars = leadTemplateVars(contact);
    expect(renderTemplate("Beste {{contact.firstName}}", vars)).toBe(
      "Beste Jan",
    );
    expect(renderTemplate("{{contact.fullName}}", vars)).toBe("Jan Jansen");
    expect(renderTemplate("{{company}}", vars)).toBe("Staycool Airconditioning");
  });
  it("ontbrekende var → lege string", () => {
    expect(renderTemplate("[{{onbekend}}]", {})).toBe("[]");
  });
});
```
  door:
```ts
describe("renderTemplate", () => {
  it("substitueert contact-vars + doorgegeven company", () => {
    const vars = leadTemplateVars(contact, "Acme BV");
    expect(renderTemplate("Beste {{contact.firstName}}", vars)).toBe(
      "Beste Jan",
    );
    expect(renderTemplate("{{contact.fullName}}", vars)).toBe("Jan Jansen");
    expect(renderTemplate("{{company}}", vars)).toBe("Acme BV");
  });
  it("ontbrekende var → lege string", () => {
    expect(renderTemplate("[{{onbekend}}]", {})).toBe("[]");
  });
});
```

- [ ] **Step 2:** Run → FAIL (company genegeerd door oude impl):
  `cd /home/marvin/Projecten/leadflowv2 && npx vitest run convex/templateRender.test.ts`

- [ ] **Step 3: Implementeer** — in `convex/templateRender.ts`, wijzig `leadTemplateVars`:
  vervang
```ts
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
  door
```ts
export function leadTemplateVars(
  lead: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    company?: string | null;
  },
  company: string,
): Record<string, unknown> {
  return {
    contact: {
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      fullName: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      city: lead.city ?? "",
    },
    company,
  };
}
```

- [ ] **Step 4:** Run → PASS: `npx vitest run convex/templateRender.test.ts`
  (`convex/contacts.ts` heeft nu een type-fout op de 1-arg-call — opgelost in Task 4; commit deze task NA Task 4 zodat de branch nooit een broken tsc tussenstand pusht. Ga door naar Task 2-4, commit dan samen.)

---

### Task 2: Schema — `crmSettings.companyName`

**Files:** Modify `convex/schema.ts`

- [ ] **Step 1:** In de `crmSettings`-tabel, ná
  `dashboardWindowDays: v.optional(v.number()),` toevoegen:
```ts
    /** Bedrijfsnaam voor de {{company}}-var in e-mails. Afwezig = org-naam. */
    companyName: v.optional(v.string()),
```

- [ ] **Step 2:** `npx convex dev --once` → schoon. (Commit samen in Task 4.)

---

### Task 3: `crmSettings.ts` — orgNameFor + get + getEffectiveSettings + update

**Files:** Modify `convex/crmSettings.ts`

- [ ] **Step 1: Helper** — voeg ná `requireWorkspaceMembership` (vóór `export const get`)
  toe:
```ts
/** Org-naam van een workspace (fallback-default voor companyName). */
async function orgNameFor(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<string> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) return "";
  const org = await ctx.db.get(workspace.orgId);
  return org?.name ?? "";
}
```

- [ ] **Step 2: `get`** — ná `await requireWorkspaceMembership(ctx, args.workspaceId);`
  (regel 59) toevoegen:
```ts
    const orgName = await orgNameFor(ctx, args.workspaceId);
```
  en in de return, ná het `dashboardWindowDays`-blok (regel 86-88), vóór de `};`:
```ts
      companyName: settings?.companyName ?? orgName,
```

- [ ] **Step 3: `update.args`** — ná `dashboardWindowDays: v.optional(v.number()),`
  (regel 107) toevoegen:
```ts
    companyName: v.optional(v.string()),
```
  en in het patch-blok (ná de `dashboardWindowDays`-patch) toevoegen:
```ts
    if (args.companyName !== undefined)
      patch.companyName = args.companyName.trim();
```

- [ ] **Step 4: `getEffectiveSettings`** — return-type: ná `dashboardWindowDays: number;`
  (regel 196) toevoegen `companyName: string;`. In de handler, ná de `settings`-query
  (regel 201) toevoegen:
```ts
  const orgName = await orgNameFor(ctx, workspaceId);
```
  en in de return-value (ná het `dashboardWindowDays`-blok) toevoegen:
```ts
    companyName: settings?.companyName ?? orgName,
```

- [ ] **Step 5:** `npx convex dev --once` → schoon. (Commit samen in Task 4.)

---

### Task 4: Backend caller + gezamenlijke commit

**Files:** Modify `convex/contacts.ts`

- [ ] **Step 1:** In `recordCallNoAnswer` (afscheidsmail-blok, regel ~800), vervang
```ts
          const vars = leadTemplateVars({
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            city: contact.city,
            company: contact.company,
          });
```
  door
```ts
          const vars = leadTemplateVars(
            {
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              phone: contact.phone,
              city: contact.city,
              company: contact.company,
            },
            settings.companyName,
          );
```
  (`settings` = `getEffectiveSettings(...)` op regel 712, heeft nu `companyName`.)

- [ ] **Step 2: Build-gate backend** (alles uit Task 1-4):
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run convex/templateRender.test.ts   # PASS
npx convex dev --once                          # schoon
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/(contacts|crmSettings|templateRender)\.ts" && echo "FOUTEN" || echo "schoon"
```
  Alleen committen bij "schoon".

- [ ] **Step 3: Commit (backend)**
```bash
cd /home/marvin/Projecten/leadflowv2
git add convex/templateRender.ts convex/templateRender.test.ts convex/schema.ts convex/crmSettings.ts convex/contacts.ts convex/_generated
git commit -m "feat(settings): per-workspace companyName voor email {{company}} (backend)"
```

---

### Task 5: Frontend render-helpers `src/lib/templates.ts` (+ test)

**Files:** Modify `src/lib/templates.ts`, `src/lib/templates.test.ts`

- [ ] **Step 1: `leadTemplateVars`** — vervang
```ts
export function leadTemplateVars(lead: {
  firstName: string | null | undefined
  lastName: string | null | undefined
  email: string | null | undefined
  phone: string | null | undefined
  city: string | null | undefined
  company: string | null | undefined
}): Record<string, unknown> {
  return {
    contact: {
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      fullName: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      city: lead.city ?? '',
    },
    company: 'Staycool Airconditioning',
  }
}
```
  door
```ts
export function leadTemplateVars(
  lead: {
    firstName: string | null | undefined
    lastName: string | null | undefined
    email: string | null | undefined
    phone: string | null | undefined
    city: string | null | undefined
    company: string | null | undefined
  },
  company: string,
): Record<string, unknown> {
  return {
    contact: {
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      fullName: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      city: lead.city ?? '',
    },
    company,
  }
}
```

- [ ] **Step 2: `renderTemplateForChannel`** — voeg een `company`-param toe + geef door.
  Vervang de signatuur-regel
```ts
  channel: 'email' | 'sms' | 'whatsapp',
): { body: string; subject?: string } {
  const vars = leadTemplateVars({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    city: contact.city,
    company: contact.company,
  })
```
  door
```ts
  channel: 'email' | 'sms' | 'whatsapp',
  company: string,
): { body: string; subject?: string } {
  const vars = leadTemplateVars(
    {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      city: contact.city,
      company: contact.company,
    },
    company,
  )
```

- [ ] **Step 3: Test bijwerken** — `src/lib/templates.test.ts`: voeg aan ALLE 6
  `renderTemplateForChannel(...)`-calls een 4e argument `'Acme BV'` toe (ná het
  channel-argument). Vervang daarbij de "company"-test (regel 67-74) door:
```ts
  it('company: gebruikt de doorgegeven bedrijfsnaam (niet uit contact-veld)', () => {
    const r = renderTemplateForChannel(
      { subject: 'S', body: 'Bedrijf: {{company}}' },
      contact,
      'email',
      'Acme BV',
    )
    expect(r.body).toBe('Bedrijf: Acme BV')
  })
```
  (De andere 5 calls: voeg simpelweg `, 'Acme BV'` toe ná `'email'`/`'sms'`/`'whatsapp'`.)

- [ ] **Step 4:** Run → PASS: `npx vitest run src/lib/templates.test.ts`
  (Andere frontend-callers hebben nu type-fouten — opgelost in Task 6; commit samen.)

---

### Task 6: Frontend callers geven companyName door

**Files:** Modify `src/components/crm/lead-dialog/views/message-compose.tsx`,
`src/routes/crm.settings_.templates.tsx`, `src/routes/crm.messages.tsx`

- [ ] **Step 1: message-compose.tsx** — voeg een companyName-query toe ná de bestaande
  `template`-query (rond regel 53-56):
```ts
  const crmSettings = useQuery(api.crmSettings.get, { workspaceId })
  const companyName = crmSettings?.companyName ?? ''
```
  Pas in de `useEffect` de `leadTemplateVars`-call aan: vervang
```ts
      const vars = leadTemplateVars({
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        company: lead.company,
      })
```
  door
```ts
      const vars = leadTemplateVars(
        {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          city: lead.city,
          company: lead.company,
        },
        companyName,
      )
```
  en voeg `companyName` toe aan de `useEffect`-dependency-array (ná `lead.company,`).

- [ ] **Step 2: crm.settings_.templates.tsx — thread companyName naar het sub-component.**
  `sampleVars` staat in `TemplateEditor({ template })` (regel 114), een subcomponent ZONDER
  `workspaceId`. `TemplatesEditor` (regel 44, heeft `workspaceId`) rendert ze (regel 108).
  - 2a. In `TemplatesEditor`, ná `const templates = useQuery(api.emailTemplates.list, {
    workspaceId })` (regel 45) toevoegen — **⚠️ KRITISCH: deze hooks moeten VÓÓR de
    early-returns op regel 47-48 staan (`if (templates === undefined) return` /
    `if (templates.length === 0) return`), anders Rules-of-Hooks-overtreding. Plaats ze dus
    direct op regel 46, tussen de templates-query en de eerste early-return:**
```ts
  const crmSettings = useQuery(api.crmSettings.get, { workspaceId })
  const companyName = crmSettings?.companyName ?? ''
```
  - 2b. In de render, vervang de map (regel 107-109)
```tsx
      {templates.map((tpl) => (
        <TemplateEditor key={tpl._id} template={tpl} />
      ))}
```
    door
```tsx
      {templates.map((tpl) => (
        <TemplateEditor key={tpl._id} template={tpl} companyName={companyName} />
      ))}
```
  - 2c. Update de var-uitleg-regel (regel 102)
```tsx
            <VarRow code="company" desc="Staycool Airconditioning (fixed)" />
```
    naar
```tsx
            <VarRow code="company" desc="Je bedrijfsnaam (instelbaar hieronder)" />
```
  - 2d. In `TemplateEditor`, vervang de signatuur (regel 114)
```ts
function TemplateEditor({ template }: { template: Doc<'emailTemplates'> }) {
```
    door
```ts
function TemplateEditor({
  template,
  companyName,
}: {
  template: Doc<'emailTemplates'>
  companyName: string
}) {
```
  - 2e. Vervang de `sampleVars`-call (regel ~129)
```ts
  const sampleVars = leadTemplateVars({
    firstName: 'Jan',
    lastName: 'De Boer',
    email: 'jan@example.nl',
    phone: '+31612345678',
    city: 'Maastricht',
    company: null,
  })
```
    door
```ts
  const sampleVars = leadTemplateVars(
    {
      firstName: 'Jan',
      lastName: 'De Boer',
      email: 'jan@example.nl',
      phone: '+31612345678',
      city: 'Maastricht',
      company: null,
    },
    companyName,
  )
```

- [ ] **Step 3: crm.messages.tsx** — de `renderTemplateForChannel`-call (regel 727) staat
  in `applyTemplate(tpl)` binnen `ReplyForm` (regel 674), dat `contact` in scope heeft.
  - 3a. Voeg in `ReplyForm`, op component-niveau (NIET in een handler), bovenaan toe:
```ts
  const crmSettingsForCompany = useQuery(api.crmSettings.get, {
    workspaceId: contact.workspaceId,
  })
  const companyName = crmSettingsForCompany?.companyName ?? ''
```
  - 3b. Vervang (regel 727)
```ts
    const rendered = renderTemplateForChannel(tpl, contact, channel)
```
    door
```ts
    const rendered = renderTemplateForChannel(tpl, contact, channel, companyName)
```
  *(Controleer dat `useQuery` + `api` al geïmporteerd zijn in crm.messages.tsx — ja, het
  bestand gebruikt beide al.)*

- [ ] **Step 4: Build-gate frontend**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run src/lib/templates.test.ts        # PASS
npm run build                                    # ✓ built
npx tsc --noEmit 2>&1 | grep -E "templates\.ts|message-compose\.tsx|crm\.settings_\.templates\.tsx|crm\.messages\.tsx" && echo "FOUTEN" || echo "schoon"
```
  Alleen committen bij "schoon".

- [ ] **Step 5: Commit (frontend helpers + callers)**
```bash
cd /home/marvin/Projecten/leadflowv2
git add src/lib/templates.ts src/lib/templates.test.ts src/components/crm/lead-dialog/views/message-compose.tsx src/routes/crm.settings_.templates.tsx src/routes/crm.messages.tsx
git commit -m "feat(settings): frontend {{company}} leest workspace-companyName"
```

---

### Task 7: UI-veld op de templates-settings-pagina

**Files:** Modify `src/routes/crm.settings_.templates.tsx`

**Bouwt voort op Task 6 Step 2a** (`crmSettings`-query + `companyName` staan al in
`TemplatesEditor`). Alle benodigde imports bestaan al in dit bestand (geverifieerd:
`useState/useEffect`, `useQuery/useMutation`, `toast`, `Card/CardHeader/CardContent/CardTitle`,
`Input`, `Label`, `Button`, `humanizeConvexError`, `api`). Geen nieuwe imports nodig.

- [ ] **Step 1:** In `TemplatesEditor`, ná de in Task 6 toegevoegde `companyName`-regel,
  toevoegen — **⚠️ óók deze hooks (useMutation/useState/useEffect) VÓÓR de early-returns
  (regel 47-48) plaatsen:**
```ts
  const updateSettings = useMutation(api.crmSettings.update)
  const [companyDraft, setCompanyDraft] = useState('')
```
  En render in de hoofd-`return` een "Bedrijfsgegevens"-Card DIRECT ná het openende
  `<div className="space-y-6">` … `</div>`-header-blok en vóór de "Beschikbare variabelen"-Card.
  Concreet (de Card):
```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bedrijfsgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="company-name">
              Bedrijfsnaam (voor {'{{company}}'} in e-mails)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="company-name"
                value={companyDraft}
                placeholder={companyName || 'Bedrijfsnaam'}
                onChange={(e) => setCompanyDraft(e.target.value)}
                className="max-w-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={companyDraft.trim() === companyName}
                onClick={async () => {
                  try {
                    await updateSettings({
                      workspaceId,
                      companyName: companyDraft.trim(),
                    })
                    toast.success('Bedrijfsnaam opgeslagen')
                  } catch (err) {
                    toast.error(humanizeConvexError(err, 'Opslaan mislukt'))
                  }
                }}
              >
                Opslaan
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Leeg = automatisch de organisatie-naam.
            </p>
          </CardContent>
        </Card>
```
  En init `companyDraft` uit de query — voeg ná de `companyDraft`-declaratie een effect toe
  (`companyDraft` is hierboven al gedeclareerd; hier NIET opnieuw declareren):
```ts
  useEffect(() => {
    if (crmSettings) setCompanyDraft(crmSettings.companyName ?? '')
  }, [crmSettings])
```

- [ ] **Step 2:** `npm run build` → `✓ built`. `npx tsc --noEmit 2>&1 | grep -E "crm\.settings_\.templates\.tsx"` && echo FOUTEN || echo schoon. Commit bij schoon:
```bash
cd /home/marvin/Projecten/leadflowv2
git add src/routes/crm.settings_.templates.tsx
git commit -m "feat(settings): Bedrijfsnaam-veld op templates-settings-pagina"
```

---

### Task 8: Eindverificatie + smokes

**Files:** tijdelijk `convex/__debug.ts` (daarna verwijderd)

- [ ] **Step 1: Build-gates**
```bash
cd /home/marvin/Projecten/leadflowv2
npx vitest run            # groen
npx convex dev --once     # schoon
npm run build             # ✓ built
npx tsc --noEmit 2>&1 | grep -E "(^|/)convex/(contacts|crmSettings|templateRender)\.ts|templates\.ts|message-compose\.tsx|crm\.(settings_\.templates|messages)\.tsx" && echo "FOUTEN" || echo "geen nieuwe fouten in changed files"
```

- [ ] **Step 2: Reversibele CLI-smoke** — `convex/__debug.ts`:
```ts
import { internalMutation } from "./_generated/server";
import { getEffectiveSettings } from "./crmSettings";

/** WEGWERP — verifieert companyName-resolutie (org-default + override). */
export const smokeCompanyName = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (!user) throw new Error("geen user");
    const orgId = await ctx.db.insert("orgs", {
      name: "Acme BV",
      slug: "__smoke_acme_" + user._id,
      ownerId: user._id,
    });
    const workspaceId = await ctx.db.insert("workspaces", {
      orgId,
      name: "WS",
      isDefault: false,
    });

    const def = await getEffectiveSettings(ctx, workspaceId); // org-default
    await ctx.db.insert("crmSettings", {
      workspaceId,
      timezone: "Europe/Amsterdam",
      companyName: "Acme Cooling",
    });
    const override = await getEffectiveSettings(ctx, workspaceId);

    // Teardown
    const rows = await ctx.db
      .query("crmSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.delete(workspaceId);
    await ctx.db.delete(orgId);

    return {
      orgDefault: def.companyName,
      override: override.companyName,
    };
  },
});
```

- [ ] **Step 3: Run smoke**
```bash
cd /home/marvin/Projecten/leadflowv2
npx convex dev --once
npx convex run __debug:smokeCompanyName '{}'
```
  Verwacht: `{ orgDefault: "Acme BV", override: "Acme Cooling" }`.

- [ ] **Step 4: Verwijder debug + redeploy**
```bash
cd /home/marvin/Projecten/leadflowv2
rm convex/__debug.ts
npx convex dev --once
```

- [ ] **Step 5: UI-smoke (browser, reversibel)** — `/crm/settings/templates`: het
  Bedrijfsnaam-veld toont placeholder = org-naam ("Staycool Airconditioning"); zet een
  waarde (bv. "Test BV") → Opslaan → de live preview met `{{company}}` toont "Test BV";
  wis weer → terug naar org-naam. (Config, geen verzonden mail.)

- [ ] **Step 6: Branch pushen (normale merge-route na go):**
```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/company-name-setting
```
