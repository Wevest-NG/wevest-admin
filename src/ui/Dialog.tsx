import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** A modal built on the native <dialog>: focus is trapped, Escape closes it, and focus returns to the opener. */
export function Dialog({ open, title, description, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // A click on the backdrop lands on the <dialog> itself (its content fills the rest). Escape is handled natively.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onClick = (e: MouseEvent) => {
      if (e.target === d) onClose()
    }
    d.addEventListener('click', onClick)
    return () => d.removeEventListener('click', onClick)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
    >
      {open && (
        <>
          <div className="dialog-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && (
                <p id={descId} className="muted" style={{ marginTop: 6 }}>
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="btn ghost icon sm" onClick={onClose} aria-label="Close dialog">
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  )
}
