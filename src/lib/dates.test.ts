import { describe, expect, it } from 'vitest'
import * as D from './dates'

describe('calendar dates', () => {
  it('only accepts real days', () => {
    expect(D.parse('2026-10-31')).toEqual({ y: 2026, m: 10, d: 31 })
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '31/10/2026', '', null, undefined]) expect(D.parse(bad)).toBeNull()
    expect(D.isDate('2028-02-29')).toBe(true) // a leap day
    expect(D.isDate('2027-02-29')).toBe(false)
  })

  it('moves by days across month and year ends', () => {
    expect(D.addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(D.addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(D.addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('moves by months and years without overflowing into the next month', () => {
    expect(D.addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(D.addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(D.addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(D.addMonths('2026-01-15', -2)).toBe('2025-11-15')
    expect(D.addYears('2028-02-29', 1)).toBe('2029-02-28')
  })

  it('starts the week on Monday', () => {
    expect(D.weekday('2026-10-31')).toBe(5) // Saturday
    expect(D.weekday('2026-11-02')).toBe(0) // Monday
    expect(D.startOfWeek('2026-10-31')).toBe('2026-10-26')
    expect(D.endOfWeek('2026-10-31')).toBe('2026-11-01')
  })

  it('lays a month out as six Monday-first weeks that contain every day of it', () => {
    const g = D.monthGrid(2026, 10)
    expect(g).toHaveLength(6)
    expect(g.every((w) => w.length === 7)).toBe(true)
    expect(D.weekday(g[0]![0]!)).toBe(0)
    const days = g.flat()
    for (let d = 1; d <= 31; d++) expect(days).toContain(D.toStr(2026, 10, d))
    expect(days).toContain('2026-09-28') // the leading days from September
  })

  it('compares, clamps and checks ranges', () => {
    expect(D.compare('2026-01-01', '2026-01-02')).toBe(-1)
    expect(D.clamp('2026-05-01', '2026-06-01', '2026-07-01')).toBe('2026-06-01')
    expect(D.clamp('2026-09-01', '2026-06-01', '2026-07-01')).toBe('2026-07-01')
    expect(D.inRange('2026-06-15', '2026-06-01', '2026-06-30')).toBe(true)
    expect(D.inRange('2026-07-15', '2026-06-01', '2026-06-30')).toBe(false)
    expect(D.inRange('2026-07-15')).toBe(true)
  })

  it('writes dates the way people read them', () => {
    expect(D.longLabel('2026-10-31')).toBe('Saturday 31 October 2026')
    expect(D.shortLabel('2026-10-31')).toBe('31 Oct 2026')
    expect(D.monthYearLabel('2026-10-31')).toBe('October 2026')
  })
})
