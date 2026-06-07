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
