import { describe, it, expect } from 'vitest'
import { toLocalDatetimeInputValue } from './datetime'

describe('toLocalDatetimeInputValue', () => {
  it('behoudt de lokale tijd (geen UTC-shift zoals toISOString)', () => {
    // Lokale constructor → de output moet exact deze lokale tijd tonen,
    // ongeacht de tijdzone waarin de test draait.
    const d = new Date(2026, 5, 14, 10, 0, 0, 0) // 14 jun 2026 10:00 lokaal
    expect(toLocalDatetimeInputValue(d)).toBe('2026-06-14T10:00')
  })

  it('pad maand/dag/uur/minuut naar 2 cijfers', () => {
    const d = new Date(2026, 0, 5, 9, 7, 0, 0) // 5 jan 2026 09:07
    expect(toLocalDatetimeInputValue(d)).toBe('2026-01-05T09:07')
  })
})
