/**
 * Render een v1-stijl Handlebars-light template met simpele variabele-
 * substitutie. Ondersteunt `{{varName}}` en `{{nested.path}}`.
 *
 * V1 templates uit emailTemplates-tabel kunnen variables hebben zoals
 * {{contact.firstName}}, {{company}}, {{appointmentDate}}. Voor een MVP
 * zonder Handlebars-dependency volstaat deze regex.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in acc) {
        return (acc as Record<string, unknown>)[key]
      }
      return undefined
    }, vars)
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

/** Strip HTML tags voor een quick text-preview van een HTML body. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Bouw context-vars voor template-rendering uit een lead. */
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
