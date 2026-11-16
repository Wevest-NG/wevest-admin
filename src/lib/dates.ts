/**
 * Calendar-day helpers. Dates are plain "YYYY-MM-DD" strings (the same thing <input type="date"> produced), and all arithmetic is done in UTC
 * so daylight-saving shifts and the user's time zone can never move a day.
 */
const RE = /^(\d{4})-(\d{2})-(\d{2})$/

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const fromDate = (d: Date) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export function parse(s: string | null | undefined): { y: number; m: number; d: number } | null {
  const x = s ? RE.exec(s) : null
  if (!x) return null
  const [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])]
  const back = utc(y, m, d)
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? { y, m, d } : null // rejects 2026-02-30
}

export const isDate = (s: string | null | undefined): s is string => parse(s) !== null

export function toStr(y: number, m: number, d: number): string {
  return fromDate(utc(y, m, d))
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addDays(s: string, n: number): string {
  const p = parse(s)!
  return fromDate(utc(p.y, p.m, p.d + n))
}

/** Same day-of-month where it exists, otherwise the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: string, n: number): string {
  const p = parse(s)!
  const total = p.y * 12 + (p.m - 1) + n
  const y = Math.floor(total / 12)
  const m = (((total % 12) + 12) % 12) + 1
  return toStr(y, m, Math.min(p.d, daysInMonth(y, m)))
}

export const addYears = (s: string, n: number) => addMonths(s, n * 12)

export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0) // ISO dates sort as text

/** 0 = Monday … 6 = Sunday (the week the dashboard shows starts on Monday). */
export function weekday(s: string): number {
  const p = parse(s)!
  return (utc(p.y, p.m, p.d).getUTCDay() + 6) % 7
}

export const startOfWeek = (s: string) => addDays(s, -weekday(s))
export const endOfWeek = (s: string) => addDays(s, 6 - weekday(s))

/** Six weeks of days covering the month, including the neighbours' days that fill the first and last rows. */
export function monthGrid(y: number, m: number): string[][] {
  const first = startOfWeek(toStr(y, m, 1))
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
}

export function clamp(s: string, min?: string, max?: string): string {
  if (min && compare(s, min) < 0) return min
  if (max && compare(s, max) > 0) return max
  return s
}

export const inRange = (s: string, min?: string, max?: string) => (!min || compare(s, min) >= 0) && (!max || compare(s, max) <= 0)

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Written out (not Intl) so the labels read the same on every browser and ICU version ("Sep", never "Sept"; no stray commas).
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Saturday 31 October 2026": read out by screen readers for each day. */
export const longLabel = (s: string) => { const p = parse(s)!; return `${WEEKDAYS_LONG[weekday(s)]} ${p.d} ${MONTHS_LONG[p.m - 1]} ${p.y}` }
/** "31 Oct 2026": shown on the button. */
export const shortLabel = (s: string) => { const p = parse(s)!; return `${p.d} ${MONTHS_SHORT[p.m - 1]} ${p.y}` }
export const monthYearLabel = (s: string) => { const p = parse(s)!; return `${MONTHS_LONG[p.m - 1]} ${p.y}` }
export const monthShort = (m: number) => MONTHS_SHORT[m - 1]!
