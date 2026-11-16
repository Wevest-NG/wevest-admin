import { describe, expect, it } from 'vitest'
import { fullName, humanize, integer, money, relative } from './format'

describe('format', () => {
  it('shows minor units as currency', () => {
    expect(money(25_000_000)).toBe('₦250,000.00')
    expect(money(18_000, 'USD')).toContain('180.00')
    expect(money(null)).toBe('—')
  })
  it('groups integers', () => expect(integer(1234567)).toBe('1,234,567'))
  it('humanizes machine names', () => {
    expect(humanize('under_review')).toBe('Under review')
    expect(humanize('payments.resolve')).toBe('Payments resolve')
    expect(humanize(null)).toBe('—')
  })
  it('falls back to the email when a customer has no name', () => {
    expect(fullName({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('Ada Lovelace')
    expect(fullName({ first_name: null, last_name: null, email: 'a@b.c' })).toBe('a@b.c')
  })
  it('says how far away a moment is', () => {
    const now = Date.parse('2026-10-31T12:00:00Z')
    expect(relative('2026-10-31T15:00:00Z', now)).toBe('in 3 hours')
    expect(relative('2026-10-29T12:00:00Z', now)).toBe('2 days ago')
    expect(relative(null, now)).toBe('—')
  })
})
