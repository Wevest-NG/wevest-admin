import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox, Info, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { ApiError } from '../api/client'
import { humanize } from '../lib/format'

/* ---------- buttons ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  loading?: boolean
  icon?: boolean
}
export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: BtnProps) {
  const cls = ['btn', variant === 'primary' ? '' : variant, size === 'sm' ? 'sm' : '', icon ? 'icon' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  )
}

export function LinkButton({ to, variant = 'secondary', size = 'md', children }: { to: string; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'md' | 'sm'; children: ReactNode }) {
  return (
    <Link to={to} className={`btn ${variant === 'primary' ? '' : variant} ${size === 'sm' ? 'sm' : ''}`}>
      {children}
    </Link>
  )
}

/* ---------- surfaces ---------- */
export function Card({ title, actions, children, flush, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section className="card" aria-labelledby={title && id ? id : undefined}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2 id={id}>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={flush ? undefined : 'card-body'}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'neutral'

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className="badge" data-tone={tone === 'neutral' ? undefined : tone}>
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  )
}

const TONES: Record<string, Tone> = {
  active: 'success', executed: 'success', filed: 'success', verified: 'success', succeeded: 'success', ok: 'success', approved: 'primary', closed: 'neutral', resolved: 'neutral',
  pending: 'warning', review: 'warning', processing: 'warning', draft: 'warning', under_review: 'info', open: 'warning', in_case: 'info', medium: 'info', low: 'neutral',
  failed: 'danger', rejected: 'danger', frozen: 'danger', disabled: 'danger', critical: 'danger', escalated: 'danger', expired: 'neutral', cancelled: 'neutral', discarded: 'neutral', high: 'danger',
}
export const toneFor = (s: string): Tone => TONES[s] ?? 'neutral'

/** A status as a coloured pill. The text always says the status, so colour is never the only signal. */
export function Status({ value }: { value: string }) {
  return (
    <Badge tone={toneFor(value)} dot>
      {humanize(value)}
    </Badge>
  )
}

export function Banner({ tone = 'info', title, children }: { tone?: 'info' | 'danger' | 'warning' | 'success'; title?: string; children?: ReactNode }) {
  const Icon = tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div className="banner" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden />
      <div>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}

export function Kpi({ label, value, hint, tone, to, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' | 'success'; to?: string; icon?: ReactNode }) {
  const body = (
    <>
      <span className="label">
        {icon}
        {label}
      </span>
      <span className="value num">{value}</span>
      {hint && <span className="hint">{hint}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="card kpi" data-tone={tone}>
      {body}
    </Link>
  ) : (
    <div className="card kpi" data-tone={tone}>
      {body}
    </div>
  )
}

/* ---------- states ---------- */
export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden />
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack" style={{ padding: 20 }} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={20} />
      ))}
    </div>
  )
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={36} aria-hidden />}
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null
  const forbidden = e?.status === 403
  return (
    <div className="empty" role="alert">
      <AlertTriangle size={36} aria-hidden style={{ color: 'var(--danger-text)' }} />
      <strong>{forbidden ? 'Your role does not allow this' : 'Something went wrong'}</strong>
      <span>{e?.message ?? 'Unexpected error'}</span>
      {onRetry && !forbidden && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden /> Try again
        </Button>
      )}
    </div>
  )
}

/* ---------- data ---------- */
export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'right'
}

export function DataTable<T>({ columns, rows, rowKey, caption, loading, error, onRetry, empty }: {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (r: T) => string
  caption: string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: ReactNode
}) {
  if (loading) return <LoadingRows />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (!rows || rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here" />}</>
  return (
    // A scrollable region must be reachable by keyboard so it can be scrolled without a mouse (WCAG 2.1.1).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'right' ? 'right' : undefined}>
                {c.header === '' ? <span className="sr-only">Actions</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'right' : undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((i) => (
        <button key={i.value} role="tab" type="button" aria-selected={value === i.value} tabIndex={value === i.value ? 0 : -1} onClick={() => onChange(i.value)}
          onKeyDown={(e) => {
            const idx = items.findIndex((x) => x.value === value)
            const next = e.key === 'ArrowRight' ? items[(idx + 1) % items.length] : e.key === 'ArrowLeft' ? items[(idx - 1 + items.length) % items.length] : null
            if (next) { e.preventDefault(); onChange(next.value) }
          }}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Pager({ page, pageSize, hasMore, onPage, shown }: { page: number; pageSize: number; hasMore: boolean; onPage: (p: number) => void; shown: number }) {
  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        {shown === 0 ? 'No results' : `Showing ${page * pageSize + 1}–${page * pageSize + shown}`}
      </span>
      <span className="row">
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={!hasMore} onClick={() => onPage(page + 1)}>Next</Button>
      </span>
    </nav>
  )
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const id = useId()
  return (
    <>
      <span id={id} className="sr-only">{label}</span>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable, so it must be keyboard-focusable (WCAG 2.1.1) */}
      <pre className="json" tabIndex={0} aria-labelledby={id}>{JSON.stringify(value, null, 2)}</pre>
    </>
  )
}

export function Money({ minor, currency = 'NGN', signed }: { minor: number; currency?: string; signed?: boolean }) {
  const text = new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency.trim(), currencyDisplay: 'narrowSymbol', signDisplay: signed ? 'exceptZero' : 'auto' }).format(minor / 100)
  return <span className={`num${signed ? (minor > 0 ? ' positive' : minor < 0 ? ' negative' : '') : ''}`}>{text}</span>
}

/** Long free text (an error message, a note) cut to a readable length, with a toggle to see all of it. */
export function Clamp({ text, max = 240 }: { text: string | null | undefined; max?: number }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  if (text.length <= max) return <>{text}</>
  return (
    <>
      {open ? text : text.slice(0, max).trimEnd() + '…'}{' '}
      <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Show all'}</button>
    </>
  )
}
