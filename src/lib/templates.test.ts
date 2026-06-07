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
      'Acme BV',
    )
    expect(r.subject).toBe('Hoi Jan')
    expect(r.body).toBe('Beste Jan Jansen')
  })

  it('sms: geen subject, HTML gestript naar platte tekst', () => {
    const r = renderTemplateForChannel(
      { subject: 'Onderwerp', body: '<p>Hallo {{contact.firstName}}</p>' },
      contact,
      'sms',
      'Acme BV',
    )
    expect(r.subject).toBeUndefined()
    expect(r.body).toBe('Hallo Jan')
  })

  it('whatsapp: geen subject', () => {
    const r = renderTemplateForChannel(
      { subject: 'X', body: 'Test' },
      contact,
      'whatsapp',
      'Acme BV',
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
      'Acme BV',
    )
    expect(r.body).toBe('Naam: [] Stad: [] X: []')
    expect(r.body).not.toContain('undefined')
  })

  it('company: gebruikt de doorgegeven bedrijfsnaam (niet uit contact-veld)', () => {
    const r = renderTemplateForChannel(
      { subject: 'S', body: 'Bedrijf: {{company}}' },
      contact,
      'email',
      'Acme BV',
    )
    expect(r.body).toBe('Bedrijf: Acme BV')
  })

  it('subject behoudt HTML, body wordt gestript (bewuste asymmetrie)', () => {
    const r = renderTemplateForChannel(
      { subject: 'Hoi <b>{{contact.firstName}}</b>', body: '<p>Test</p>' },
      contact,
      'email',
      'Acme BV',
    )
    expect(r.subject).toBe('Hoi <b>Jan</b>')
    expect(r.body).toBe('Test')
  })
})
