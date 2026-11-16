import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import * as D from '../lib/dates'
import { lagosToday } from '../lib/format'
import { Select } from './Select'
import { Field } from './forms'

interface PickerProps {
  id?: string
  /** "YYYY-MM-DD" or "". */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

type View = 'days' | 'months' | 'years'
const POPUP_H = 360
const GAP = 6

/**
 * A custom calendar. The trigger is a button (like the dropdown); the calendar is a dialog with a day grid you can drive entirely from the keyboard:
 * arrows move by day / week, Home / End jump to the start / end of the week, PageUp / PageDown change month (Shift: year), Enter / Space choose, Esc closes.
 * Days outside min / max stay focusable but cannot be chosen (so keyboard users are not forced to hunt past them).
 */
export function DatePicker({ id, value, onChange, min, max, disabled, required, placeholder = 'Select a date', ...aria }: PickerProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('days')
  const [cursor, setCursor] = useState('')
  const [host, setHost] = useState<Element>(() => document.body)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const today = lagosToday()
  const valid = D.isDate(value) ? value : ''
  const here = cursor || today // before the first open there is no cursor yet
  const cur = D.parse(here)!

  const place = useCallback(() => {
    const el = trigger.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - GAP
    const flip = below < POPUP_H && r.top - GAP > below
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 320 - 8))
    setPos(flip ? { left, bottom: window.innerHeight - r.top + GAP } : { left, top: r.bottom + GAP })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    const on = () => place()
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('scroll', on, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!trigger.current?.contains(t) && !popup.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [open])

  // keep keyboard focus on the day the cursor is on (and on the right control in the month / year views)
  useEffect(() => {
    if (!open || !pos) return
    const sel = view === 'days' ? `[data-date="${cursor}"]` : view === 'months' ? `[data-month="${cur.m}"]` : `[data-year="${cur.y}"]`
    popup.current?.querySelector<HTMLElement>(sel)?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cur is derived from cursor
  }, [open, pos, view, cursor])

  const show = () => {
    if (disabled) return
    setHost(trigger.current?.closest('dialog') ?? trigger.current?.closest('main') ?? document.body)
    setCursor(D.clamp(valid || today, min, max))
    setView('days')
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  const pick = (d: string) => {
    if (!D.inRange(d, min, max)) return
    onChange(d)
    close()
  }
  const go = (d: string) => setCursor(d) // may leave the visible month: the calendar follows the cursor

  const onGridKey = (e: KeyboardEvent<HTMLElement>) => {
    const step: Record<string, string> = {
      ArrowLeft: D.addDays(cursor, -1), ArrowRight: D.addDays(cursor, 1), ArrowUp: D.addDays(cursor, -7), ArrowDown: D.addDays(cursor, 7),
      Home: D.startOfWeek(cursor), End: D.endOfWeek(cursor),
      PageUp: e.shiftKey ? D.addYears(cursor, -1) : D.addMonths(cursor, -1), PageDown: e.shiftKey ? D.addYears(cursor, 1) : D.addMonths(cursor, 1),
    }
    const next = step[e.key]
    if (next) { e.preventDefault(); go(next) }
  }

  const onPopupKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key === 'Tab') {
      // keep Tab inside the calendar while it is open (it is a dialog)
      const f = [...(popup.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])') ?? [])]
      if (f.length === 0) return
      const first = f[0]!; const last = f[f.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); show() }
  }

  const yearPage = cur.y - 5 // the current year sits mid-page; Previous / Next move a page
  const prev = () => (view === 'days' ? go(D.addMonths(here, -1)) : view === 'months' ? go(D.addYears(here, -1)) : go(D.addYears(here, -12)))
  const next = () => (view === 'days' ? go(D.addMonths(here, 1)) : view === 'months' ? go(D.addYears(here, 1)) : go(D.addYears(here, 12)))
  const title = view === 'days' ? D.monthYearLabel(here) : view === 'months' ? String(cur.y) : `${yearPage} – ${yearPage + 11}`
  const nav = view === 'days' ? ['Previous month', 'Next month'] : view === 'months' ? ['Previous year', 'Next year'] : ['Previous 12 years', 'Next 12 years']

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        className="select-trigger date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKey}
        {...aria}
      >
        <span className={valid ? undefined : 'placeholder'}>{valid ? D.shortLabel(valid) : placeholder}</span>
        <CalendarDays size={16} aria-hidden className="chevron" />
      </button>
      {open && pos &&
        createPortal(
          // Key presses bubble up from the focused day / month / year buttons: one handler here keeps Esc and the Tab loop in one place.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <div ref={popup} role="dialog" aria-label="Choose a date" className="datepicker" style={pos} onKeyDown={onPopupKey}>
            <div className="dp-head">
              <button type="button" className="dp-nav" aria-label={nav[0]} onClick={prev}><ChevronLeft size={18} aria-hidden /></button>
              <button
                type="button"
                className="dp-title"
                aria-live="polite"
                disabled={view === 'years'}
                onClick={() => setView(view === 'days' ? 'months' : 'years')}
                aria-label={view === 'days' ? `${title}, choose month and year` : view === 'months' ? `${title}, choose year` : title}
              >
                {title}
              </button>
              <button type="button" className="dp-nav" aria-label={nav[1]} onClick={next}><ChevronRight size={18} aria-hidden /></button>
            </div>

            {view === 'days' && (
              <table className="dp-grid" role="grid" aria-label={D.monthYearLabel(here)} onKeyDown={onGridKey}>
                <thead>
                  <tr>{D.WEEKDAYS.map((w, i) => <th key={w} scope="col" abbr={D.WEEKDAYS_LONG[i]}>{w}</th>)}</tr>
                </thead>
                <tbody>
                  {D.monthGrid(cur.y, cur.m).map((week) => (
                    <tr key={week[0]}>
                      {week.map((day) => {
                        const out = D.parse(day)!.m !== cur.m
                        const off = !D.inRange(day, min, max)
                        return (
                          <td key={day} role="gridcell" aria-selected={day === valid}>
                            <button
                              type="button"
                              className="dp-day"
                              data-date={day}
                              data-out={out || undefined}
                              data-today={day === today || undefined}
                              data-selected={day === valid || undefined}
                              tabIndex={day === cursor ? 0 : -1}
                              aria-label={D.longLabel(day)}
                              aria-current={day === today ? 'date' : undefined}
                              aria-disabled={off || undefined}
                              onClick={() => pick(day)}
                            >
                              {D.parse(day)!.d}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {view === 'months' && (
              <div className="dp-pick" role="group" aria-label={`Months of ${cur.y}`}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <button key={m} type="button" data-month={m} data-selected={(valid && D.parse(valid)!.y === cur.y && D.parse(valid)!.m === m) || undefined} aria-pressed={cur.m === m}
                    onClick={() => { go(D.toStr(cur.y, m, Math.min(cur.d, D.daysInMonth(cur.y, m)))); setView('days') }}>
                    {D.monthShort(m)}
                  </button>
                ))}
              </div>
            )}

            {view === 'years' && (
              <div className="dp-pick" role="group" aria-label={`Years ${yearPage} to ${yearPage + 11}`}>
                {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => (
                  <button key={y} type="button" data-year={y} data-selected={(valid && D.parse(valid)!.y === y) || undefined} aria-pressed={cur.y === y}
                    onClick={() => { go(D.addYears(here, y - cur.y)); setView('months') }}>
                    {y}
                  </button>
                ))}
              </div>
            )}

            <div className="dp-foot">
              <button type="button" className="btn ghost sm" disabled={!D.inRange(today, min, max)} onClick={() => pick(today)}>Today</button>
              {!required && valid && <button type="button" className="btn ghost sm" onClick={() => { onChange(''); close() }}>Clear</button>}
            </div>
          </div>,
          host,
        )}
    </>
  )
}

interface FieldProps {
  label: string
  hint?: React.ReactNode
  error?: string | null
  value: string
  onChange: (e: { target: { value: string } }) => void
  min?: string
  max?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
  fieldClassName?: string
}

/** A labelled date field. Drop-in for `<TextField type="date">`: same value format, same onChange shape. */
export function DateField({ label, hint, error, value, onChange, fieldClassName, ...rest }: FieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(p) => <DatePicker {...p} {...rest} value={value} onChange={(v) => onChange({ target: { value: v } })} />}
    </Field>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i).padStart(2, '0') }))
const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i).padStart(2, '0') }))

/** A date and a time. Value is "YYYY-MM-DDTHH:mm" (what `datetime-local` gave), or "" when no date is chosen. */
export function DateTimeField({ label, hint, error, value, onChange, fieldClassName, min, max, disabled, required }: FieldProps) {
  const [date = '', time = ''] = value.split('T')
  const [hh = '', mm = ''] = time.split(':')
  const set = (d: string, h: string, m: string) => onChange({ target: { value: d ? `${d}T${h || '00'}:${m || '00'}` : '' } })
  const now = () => { const n = new Date(); return [String(n.getHours()).padStart(2, '0'), String(n.getMinutes()).padStart(2, '0')] as const }
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(p) => (
        <div className="datetime">
          <DatePicker {...p} value={date} min={min?.slice(0, 10)} max={max?.slice(0, 10)} disabled={disabled} required={required}
            onChange={(d) => { const [h, m] = hh || mm ? [hh, mm] : now(); set(d, h, m) }} />
          <Select aria-label="Hour" value={hh} disabled={disabled || !date} options={HOURS} placeholder="HH" onChange={(h) => set(date, h, mm)} />
          <span aria-hidden>:</span>
          <Select aria-label="Minute" value={mm} disabled={disabled || !date} options={MINUTES} placeholder="MM" onChange={(m) => set(date, hh, m)} />
        </div>
      )}
    </Field>
  )
}
