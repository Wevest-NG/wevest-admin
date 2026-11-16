const nf = (currency: string) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', currencyDisplay: 'narrowSymbol' })

/** Amounts arrive as integer minor units (kobo / cents). */
export function money(minor: number | null | undefined, currency = 'NGN'): string {
  if (minor === null || minor === undefined) return '—'
  return nf(currency.trim()).format(minor / 100)
}

export function integer(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : new Intl.NumberFormat('en-NG').format(n)
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(d)
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Lagos' }).format(d)
}

/** "in 3 hours" / "2 days ago" */
export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - now
  if (Number.isNaN(diff)) return '—'
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]]
  for (const [u, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), u)
  return rtf.format(Math.round(diff / 1000), 'second')
}

export function humanize(s: string | null | undefined): string {
  if (!s) return '—'
  const t = s.replace(/[._]/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function fullName(c: { first_name: string | null; last_name: string | null; email?: string | null }): string {
  const n = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return n || c.email || 'Unnamed'
}

export function lagosToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())
}

/** Any value from a free-form result/detail blob, readable: big numbers get separators, objects are compacted. */
export function formatValue(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(v) : String(v)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** "850 ms", "4.2 s", "3 min 5 s", "2 h 10 min", "1 d 4 h" */
export function duration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min} min ${Math.round((ms % 60_000) / 1000)} s`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}
