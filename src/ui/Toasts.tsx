import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { Dialog } from './Dialog'
import { Button } from './components'

export type AlertTone = 'success' | 'danger' | 'info' | 'warning'
export interface AlertOptions {
  /** Bold first line. Defaults to a short phrase for the tone. */
  title?: string
  /** An optional button inside the alert, e.g. "View". */
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it goes away (paused while hovered or focused). Errors stay longer. */
  duration?: number
}
interface Item extends AlertOptions {
  id: number
  message: string
  tone: AlertTone
  duration: number
}
type Notify = (message: string, tone?: AlertTone, options?: AlertOptions) => void

const MAX_VISIBLE = 4
const DEFAULT_TITLE: Record<AlertTone, string> = { success: 'Done', danger: 'That did not work', info: 'Note', warning: 'Heads up' }
const ICON = { success: CheckCircle2, danger: AlertTriangle, info: Info, warning: TriangleAlert }

const NotifyCtx = createContext<Notify>(() => {})
/** Shows a custom alert. `toast(message, tone?, { title, action, duration })`. */
export const useToast = () => useContext(NotifyCtx)

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** danger = destructive or hard to undo (red button). */
  tone?: 'primary' | 'danger'
}
type Confirm = (o: ConfirmOptions) => Promise<boolean>
const ConfirmCtx = createContext<Confirm>(async () => false)
/** Asks for confirmation in the app's own dialog instead of the browser's: `if (await confirm({ title: 'Delete it?' })) …` */
export const useConfirm = () => useContext(ConfirmCtx)

function AlertCard({ a, onDismiss }: { a: Item; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false)
  const left = useRef(a.duration)
  const since = useRef(0)
  useEffect(() => {
    if (paused) return
    since.current = Date.now()
    const t = setTimeout(onDismiss, Math.max(left.current, 400))
    return () => {
      clearTimeout(t)
      left.current -= Date.now() - since.current
    }
  }, [paused, onDismiss])
  const Icon = ICON[a.tone]
  const urgent = a.tone === 'danger' || a.tone === 'warning'
  return (
    <div
      className="alert"
      data-tone={a.tone}
      role={urgent ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="alert-icon" aria-hidden><Icon size={18} /></span>
      <div className="alert-body">
        <strong>{a.title ?? DEFAULT_TITLE[a.tone]}</strong>
        <p>{a.message}</p>
        {a.action && (
          <button type="button" className="alert-action" onClick={() => { a.action!.onClick(); onDismiss() }}>
            {a.action.label}
          </button>
        )}
      </div>
      <button type="button" className="alert-close" onClick={onDismiss} aria-label="Dismiss notification"><X size={16} aria-hidden /></button>
      <span className="alert-progress" aria-hidden style={{ animationDuration: `${a.duration}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const seq = useRef(0)
  const push = useCallback<Notify>((message, tone = 'info', options = {}) => {
    const id = ++seq.current
    const duration = options.duration ?? (tone === 'danger' || tone === 'warning' ? 9000 : 5500)
    setItems((x) => [...x.slice(-(MAX_VISIBLE - 1)), { ...options, id, message, tone, duration }])
  }, [])
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), [])

  // confirmation dialog
  const [ask, setAsk] = useState<{ o: ConfirmOptions; done: (ok: boolean) => void } | null>(null)
  const confirm = useCallback<Confirm>((o) => new Promise<boolean>((resolve) => setAsk({ o, done: resolve })), [])
  const settle = (ok: boolean) => {
    ask?.done(ok)
    setAsk(null)
  }

  const value = useMemo(() => push, [push])
  return (
    <NotifyCtx.Provider value={value}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="alerts" role="region" aria-label="Notifications">
          {items.map((a) => (
            <AlertCard key={a.id} a={a} onDismiss={() => dismiss(a.id)} />
          ))}
        </div>
        <Dialog
          open={!!ask}
          title={ask?.o.title ?? ''}
          description={ask?.o.message}
          onClose={() => ask && settle(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => settle(false)}>{ask?.o.cancelLabel ?? 'Cancel'}</Button>
              <Button variant={ask?.o.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>{ask?.o.confirmLabel ?? 'Confirm'}</Button>
            </>
          }
        />
      </ConfirmCtx.Provider>
    </NotifyCtx.Provider>
  )
}
