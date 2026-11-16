import { Children, isValidElement, useId, useState, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Select, type SelectOption } from './Select'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
  className?: string
}

/** Wires a visible label, hint and error message to a control with the right ids and aria attributes. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId()
  const describe = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describe, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

type Base = { label: string; hint?: ReactNode; error?: string | null; fieldClassName?: string }

export function TextField({ label, hint, error, fieldClassName, ...rest }: Base & InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label} hint={hint} error={error} className={fieldClassName}>{(p) => <input className="input" {...p} {...rest} />}</Field>
}

/** A password input with a button to reveal what has been typed. */
export function PasswordField({ label, hint, error, fieldClassName, ...rest }: Base & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(p) => (
        <div className="password-wrap">
          <input className="input" {...p} {...rest} type={shown ? 'text' : 'password'} />
          <button type="button" className="password-toggle" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
            {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </div>
      )}
    </Field>
  )
}

/** What an <option> contributes: its value, and its text. Only plain <option> children are supported (that is all this app uses). */
function optionsOf(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = []
  Children.forEach(children, (c) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(c) || c.type !== 'option') return
    const label = Children.toArray(c.props.children).join('')
    out.push({ value: String(c.props.value ?? label), label, disabled: c.props.disabled })
  })
  return out
}

interface SelectFieldProps extends Base {
  value: string
  /** Called like a native onChange, so call sites can keep reading e.target.value. */
  onChange?: (e: { target: { value: string } }) => void
  children: ReactNode
  disabled?: boolean
  required?: boolean
  placeholder?: string
}

/** A labelled custom dropdown. Pass <option> children as you would to a <select>. */
export function SelectField({ label, hint, error, fieldClassName, children, value, onChange, disabled, required, placeholder }: SelectFieldProps) {
  const options = optionsOf(children)
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(p) => <Select {...p} value={value} options={options} onChange={(v) => onChange?.({ target: { value: v } })} disabled={disabled} required={required} placeholder={placeholder} />}
    </Field>
  )
}

export function TextAreaField({ label, hint, error, fieldClassName, ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Field label={label} hint={hint} error={error} className={fieldClassName}>{(p) => <textarea className="textarea" {...p} {...rest} />}</Field>
}

export function CheckboxField({ label, hint, ...rest }: { label: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className="checkbox">
      <input id={id} type="checkbox" aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      <label htmlFor={id}>
        {label}
        {hint && (
          <span id={`${id}-hint`} className="hint" style={{ display: 'block', fontWeight: 400 }}>
            {hint}
          </span>
        )}
      </label>
    </div>
  )
}
