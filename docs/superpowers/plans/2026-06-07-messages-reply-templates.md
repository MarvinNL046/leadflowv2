# Messages — Reply-templates in de inbox-compose — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak-voor-taak uit te voeren. Steps gebruiken checkbox-syntax (`- [ ]`).

**Goal:** Bestaande email-templates bereikbaar maken vanuit de Messages-inbox-compose (`ReplyForm`), met kanaal-bewuste rendering (platte tekst voor SMS/WA, subject+body voor e-mail).

**Architecture:** Geen schema-/Convex-wijziging. Eén pure render-helper in `src/lib/templates.ts` (unit-getest), hergebruik van de bestaande `emailTemplates.list`-query, en een shadcn-`DropdownMenu` template-picker in `ReplyForm`. Invoegen overschrijft de compose-velden (met "Overschrijven"-toast bij al-getypte tekst).

**Tech Stack:** TanStack Start (React) + Convex + shadcn/ui + vitest. Plain-text rendering via bestaande `renderTemplate` + `htmlToPlainText`.

**Spec:** `docs/superpowers/specs/2026-06-07-messages-reply-templates-design.md`

**Niet mergen/prod zonder Marvins go.**

---

## File Structure

- `vitest.config.ts` — `include` uitbreiden zodat `src/**/*.test.ts` ook draait (pure-function tests; node-env blijft).
- `src/lib/templates.ts` — + `renderTemplateForChannel` (pure, kanaal-bewust). Eén verantwoordelijkheid: template-string → render-resultaat per kanaal.
- `src/lib/templates.test.ts` — nieuw; unit-tests voor `renderTemplateForChannel`.
- `src/routes/crm.messages.tsx` — alleen de `ReplyForm`-component: imports, templates-query, `applyTemplate`/`handlePick`, DropdownMenu-UI.

---

### Task 0: Setup — feature-branch

**Files:** geen.

- [ ] **Step 1: Maak en checkout de branch (vanaf actuele main)**

```bash
cd /home/marvin/Projecten/leadflowv2
git checkout main && git pull --ff-only origin main
git checkout -b feat/messages-reply-templates
```

Expected: `Switched to a new branch 'feat/messages-reply-templates'`.

---

### Task 1: vitest pikt `src/**/*.test.ts` op

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Breid `include` uit**

Vervang in `vitest.config.ts`:

```ts
    include: ["convex/**/*.test.ts"],
```

door:

```ts
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
```

- [ ] **Step 2: Verifieer dat de bestaande suite nog groen is**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run`
Expected: PASS — 18 bestaande convex-tests slagen (nog geen src-tests). Geen fouten.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test(config): vitest pikt ook src/**/*.test.ts op"
```

---

### Task 2: `renderTemplateForChannel`-helper (TDD)

**Files:**
- Create: `src/lib/templates.test.ts`
- Modify: `src/lib/templates.ts` (append na `leadTemplateVars`)

- [ ] **Step 1: Schrijf de falende test**

Maak `src/lib/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderTemplateForChannel } from './templates'

const contact = {
  firstName: 'Jan',
  lastName: 'Jansen',
  email: 'jan@example.nl',
  phone: '0612345678',
  city: 'Maastricht',
  company: null,
}

describe('renderTemplateForChannel', () => {
  it('e-mail: rendert subject + platte-tekst body met variabelen', () => {
    const r = renderTemplateForChannel(
      {
        subject: 'Hoi {{contact.firstName}}',
        body: '<p>Beste {{contact.fullName}}</p>',
      },
      contact,
      'email',
    )
    expect(r.subject).toBe('Hoi Jan')
    expect(r.body).toBe('Beste Jan Jansen')
  })

  it('sms: geen subject, HTML gestript naar platte tekst', () => {
    const r = renderTemplateForChannel(
      { subject: 'Onderwerp', body: '<p>Hallo {{contact.firstName}}</p>' },
      contact,
      'sms',
    )
    expect(r.subject).toBeUndefined()
    expect(r.body).toBe('Hallo Jan')
  })

  it('whatsapp: geen subject', () => {
    const r = renderTemplateForChannel(
      { subject: 'X', body: 'Test' },
      contact,
      'whatsapp',
    )
    expect(r.subject).toBeUndefined()
    expect(r.body).toBe('Test')
  })

  it('ontbrekende variabele → lege string, nooit "undefined"', () => {
    const r = renderTemplateForChannel(
      {
        subject: 'S',
        body: 'Naam: [{{contact.firstName}}] Stad: [{{contact.city}}] X: [{{onbekend}}]',
      },
      {
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        city: null,
        company: null,
      },
      'sms',
    )
    expect(r.body).toBe('Naam: [] Stad: [] X: []')
    expect(r.body).not.toContain('undefined')
  })

  it('company: hardcoded "Staycool Airconditioning" (niet uit contact-veld)', () => {
    const r = renderTemplateForChannel(
      { subject: 'S', body: 'Bedrijf: {{company}}' },
      contact,
      'email',
    )
    expect(r.body).toBe('Bedrijf: Staycool Airconditioning')
  })

  it('subject behoudt HTML, body wordt gestript (bewuste asymmetrie)', () => {
    const r = renderTemplateForChannel(
      { subject: 'Hoi <b>{{contact.firstName}}</b>', body: '<p>Test</p>' },
      contact,
      'email',
    )
    expect(r.subject).toBe('Hoi <b>Jan</b>')
    expect(r.body).toBe('Test')
  })
})
```

- [ ] **Step 2: Run de test — verwacht FAIL**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run src/lib/templates.test.ts`
Expected: FAIL — `renderTemplateForChannel is not a function` / geen export.

- [ ] **Step 3: Implementeer de helper**

Voeg onderaan `src/lib/templates.ts` toe (na `leadTemplateVars`):

```ts
/**
 * Render een template voor één kanaal. De inbox-compose is platte tekst, dus
 * de body wordt altijd HTML→plain-text gestript. Alleen e-mail krijgt een
 * (gerenderd) subject; SMS/WhatsApp niet.
 */
export function renderTemplateForChannel(
  template: { subject: string; body: string },
  contact: {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
    city?: string | null
    company?: string | null
  },
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
  const body = htmlToPlainText(renderTemplate(template.body, vars))
  if (channel === 'email') {
    return { body, subject: renderTemplate(template.subject, vars) }
  }
  return { body }
}
```

- [ ] **Step 4: Run de test — verwacht PASS**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run src/lib/templates.test.ts`
Expected: PASS — 6 tests groen.

- [ ] **Step 5: Commit**

```bash
git add src/lib/templates.ts src/lib/templates.test.ts
git commit -m "feat(templates): renderTemplateForChannel helper + unit tests"
```

---

### Task 3: Template-picker in `ReplyForm`

**Files:**
- Modify: `src/routes/crm.messages.tsx` (imports + de `ReplyForm`-component, ~regel 666-801)

- [ ] **Step 1: Voeg de imports toe**

Voeg `FileText` toe aan het bestaande `import { … } from 'lucide-react'`-blok bovenin `src/routes/crm.messages.tsx`.

Voeg twee nieuwe import-regels toe bij de overige imports bovenin (na de bestaande `#/components/ui/...`-imports):

```ts
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '#/components/ui/dropdown-menu.tsx'
import { renderTemplateForChannel } from '#/lib/templates.ts'
```

- [ ] **Step 2: Laad de templates in `ReplyForm`**

In `ReplyForm`, direct ná `const send = useAction(api.messaging.send)`:

```ts
  const templates = useQuery(api.emailTemplates.list, {
    workspaceId: contact.workspaceId,
  })
```

- [ ] **Step 3: Voeg `applyTemplate` + `handlePick` toe**

In `ReplyForm`, ná de `handleSubmit`-functie (vóór `if (!recipient) {`):

```ts
  function applyTemplate(tpl: Doc<'emailTemplates'>) {
    const rendered = renderTemplateForChannel(tpl, contact, channel)
    setBody(rendered.body)
    if (rendered.subject !== undefined) setSubject(rendered.subject)
  }

  function handlePick(tpl: Doc<'emailTemplates'>) {
    const hasContent =
      body.trim().length > 0 ||
      (channel === 'email' && subject.trim().length > 0)
    if (!hasContent) {
      applyTemplate(tpl)
      toast.success(`Template "${tpl.name}" ingevoegd`)
      return
    }
    toast(`Bestaande tekst overschrijven met "${tpl.name}"?`, {
      action: { label: 'Overschrijven', onClick: () => applyTemplate(tpl) },
    })
  }
```

- [ ] **Step 4: Voeg de DropdownMenu-UI toe in de kanaal-rij**

In de `return`-JSX van `ReplyForm`, in het blok
`<div className="flex items-center gap-1 text-xs">`, ná het sluiten van de
kanaal-`.map(...)` (de regel `})}`) en vóór
`<span className="ml-auto text-zinc-400">→ {recipient}</span>`, voeg toe:

```tsx
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={templates === undefined}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300"
              title="Template invoegen"
            >
              <FileText className="h-3 w-3" />
              Template
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-64 overflow-y-auto"
          >
            {templates && templates.length === 0 ? (
              <DropdownMenuItem asChild>
                <Link
                  to="/crm/settings/templates"
                  className="text-zinc-500"
                >
                  Nog geen templates — maak ze in Instellingen
                </Link>
              </DropdownMenuItem>
            ) : (
              templates?.map((tpl) => (
                <DropdownMenuItem
                  key={tpl._id}
                  onSelect={() => handlePick(tpl)}
                >
                  {tpl.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
```

(`Link` is al geïmporteerd uit `@tanstack/react-router` bovenin het bestand.)

- [ ] **Step 5: Build + typecheck**

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx tsc --noEmit 2>&1 | grep -E "crm.messages.tsx|templates.ts"`
Expected: geen output (geen nieuwe fouten in de gewijzigde bestanden). De ~73 pre-existing baseline-fouten elders zijn niet relevant.

- [ ] **Step 6: Commit**

```bash
git add src/routes/crm.messages.tsx
git commit -m "feat(messages): template-picker in inbox-compose (ReplyForm)"
```

---

### Task 4: Eindverificatie

**Files:** geen.

- [ ] **Step 1: Volledige gates**

Run: `cd /home/marvin/Projecten/leadflowv2 && npx vitest run`
Expected: PASS — 18 convex-tests + 6 nieuwe `templates.test.ts` = 24 groen.

Run: `cd /home/marvin/Projecten/leadflowv2 && npx convex dev --once`
Expected: schoon (geen schema-/functie-wijziging, dus enkel typecheck/deploy-OK).

Run: `cd /home/marvin/Projecten/leadflowv2 && npm run build`
Expected: `✓ built`.

- [ ] **Step 2: Dev-smoke (browser, ingelogd op `localhost:5173/crm/messages`)**

Controleer:
- Open een gesprek met een contact dat naam + telefoon heeft. Kanaal **WhatsApp** → klik **Template** → kies een template → de body-textarea krijgt platte tekst met de ingevulde naam, **geen** subject-veld.
- Kanaal **E-mail** → kies een template → **subject** + **body** beide gevuld (platte tekst).
- Typ eerst iets in de body → kies dan een template → er verschijnt een **"Overschrijven"-toast** i.p.v. stil overschrijven; klik "Overschrijven" → velden vervangen.
- (Indien een workspace zónder templates testbaar is) de dropdown toont de **link naar Instellingen**.

- [ ] **Step 3: Branch pushen — GEEN merge/prod zonder Marvins go**

```bash
cd /home/marvin/Projecten/leadflowv2
git push -u origin feat/messages-reply-templates
```

Rapporteer aan Marvin: slice gebouwd + geverifieerd, branch gepusht, klaar voor zijn merge-besluit.
