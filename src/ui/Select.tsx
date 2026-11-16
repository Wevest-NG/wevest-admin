import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: ReactNode
  /** Plain text used for type-ahead and for the closed button when it differs from the label. */
  text?: string
  disabled?: boolean
}

interface Props {
  id?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-label'?: string
  required?: boolean
}

const MAX_LIST = 288
const GAP = 6

const textOf = (o: SelectOption) => (o.text ?? (typeof o.label === 'string' ? o.label : o.value)).toLowerCase()

/**
 * A custom dropdown following the ARIA "select-only combobox" pattern: focus stays on the trigger, the highlighted option is announced
 * through aria-activedescendant, and everything a native <select> does with a keyboard still works (arrows, Home/End, type-ahead, Enter/Space, Esc).
 * The list is positioned against the viewport and rendered inside the surrounding <dialog> (if any), so it is never clipped and always on top.
 */
export function Select({ id, value, options, onChange, disabled, placeholder = 'Select…', required, ...aria }: Props) {
  const auto = useId()
  const listId = `${auto}-list`
  const optId = (i: number) => `${auto}-opt-${i}`
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [host, setHost] = useState<Element>(() => document.body)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null)
  const typed = useRef({ text: '', at: 0 })

  const selected = options.findIndex((o) => o.value === value)
  const enabled = useMemo(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options])

  const place = useCallback(() => {
    const el = trigger.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - GAP - 8
    const above = r.top - GAP - 8
    const flip = below < Math.min(MAX_LIST, 44 * options.length + 12) && above > below
    setPos(flip ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + GAP, max: Math.min(MAX_LIST, above) } : { left: r.left, width: r.width, top: r.bottom + GAP, max: Math.min(MAX_LIST, below) })
  }, [options.length])

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

  // click / tap outside closes
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!trigger.current?.contains(t) && !list.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [open])

  // keep the highlighted option visible
  useEffect(() => {
    if (open && active >= 0) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optId is derived from `auto`, which never changes
  }, [open, active])

  const show = (at?: 'first' | 'last') => {
    if (disabled) return
    // Inside a modal dialog the list must live in it, or it would sit underneath. Elsewhere it goes inside <main> so its text stays within a page landmark.
    setHost(trigger.current?.closest('dialog') ?? trigger.current?.closest('main') ?? document.body)
    setActive(at === 'first' ? (enabled[0] ?? -1) : at === 'last' ? (enabled[enabled.length - 1] ?? -1) : selected >= 0 && !options[selected]?.disabled ? selected : (enabled[0] ?? -1))
    setOpen(true)
  }
  const close = () => setOpen(false)
  const choose = (i: number) => {
    const o = options[i]
    if (!o || o.disabled) return
    if (o.value !== value) onChange(o.value)
    close()
    trigger.current?.focus()
  }
  const move = (delta: number) => {
    if (enabled.length === 0) return
    const pos = enabled.indexOf(active)
    setActive(enabled[Math.min(enabled.length - 1, Math.max(0, (pos < 0 ? (delta > 0 ? -1 : enabled.length) : pos) + delta))]!)
  }
  const typeAhead = (ch: string) => {
    const now = Date.now()
    typed.current = { text: now - typed.current.at > 600 ? ch : typed.current.text + ch, at: now }
    const q = typed.current.text.toLowerCase()
    const from = q.length === 1 ? enabled.indexOf(active) + 1 : Math.max(0, enabled.indexOf(active))
    const order = [...enabled.slice(from), ...enabled.slice(0, from)]
    const hit = order.find((i) => textOf(options[i]!).startsWith(q))
    if (hit !== undefined) {
      setActive(hit)
      if (!open) setOpen(true)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show() }
      else if (e.key === 'Home') { e.preventDefault(); show('first') }
      else if (e.key === 'End') { e.preventDefault(); show('last') }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key)
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break
      case 'ArrowUp': e.preventDefault(); move(-1); break
      case 'PageDown': e.preventDefault(); move(8); break
      case 'PageUp': e.preventDefault(); move(-8); break
      case 'Home': e.preventDefault(); setActive(enabled[0] ?? -1); break
      case 'End': e.preventDefault(); setActive(enabled[enabled.length - 1] ?? -1); break
      case 'Enter': case ' ': e.preventDefault(); if (active >= 0) choose(active); break
      // Escape closes only the list, not a dialog around it
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break
      case 'Tab': close(); break
      default: if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeAhead(e.key) }
    }
  }

  const current = selected >= 0 ? options[selected] : undefined
  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        role="combobox"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        {...aria}
      >
        <span className={current ? undefined : 'placeholder'}>{current ? current.label : placeholder}</span>
        <ChevronDown size={16} aria-hidden className="chevron" />
      </button>
      {open && pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            className="select-list"
            aria-label={aria['aria-label']}
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.max }}
            onMouseDown={(e) => e.preventDefault() /* keep focus on the trigger */}
          >
            {options.map((o, i) => (
              // Keyboard use goes through the combobox (aria-activedescendant), as in the ARIA authoring practices; this is the pointer path.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={o.value}
                id={optId(i)}
                role="option"
                aria-selected={i === selected}
                aria-disabled={o.disabled || undefined}
                data-active={i === active || undefined}
                className="select-option"
                onMouseMove={() => !o.disabled && setActive(i)}
                onClick={() => choose(i)}
              >
                <span>{o.label}</span>
                {i === selected && <Check size={16} aria-hidden />}
              </li>
            ))}
          </ul>,
          host,
        )}
    </>
  )
}
