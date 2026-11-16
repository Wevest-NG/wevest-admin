import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Copy, Download, ShieldCheck } from 'lucide-react'
import { api, ApiError, type SessionResponse } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Banner, Button } from '../ui/components'
import { PasswordField, TextField } from '../ui/forms'

type Step =
  | { name: 'credentials' }
  | { name: 'mfa'; token: string }
  | { name: 'setup'; token: string; mustChangePassword: boolean; current: string }
  | { name: 'totp'; token: string }
  | { name: 'recovery'; codes: string[]; session: SessionResponse }

interface LoginResult { status: 'mfa_required' | 'setup_required'; mfa_token?: string; setup_token?: string; must_change_password?: boolean; totp_required?: boolean }

function message(e: unknown): string {
  if (e instanceof ApiError) return e.message
  return 'Something went wrong. Please try again.'
}

export function Login() {
  const { status, startSession, notice, clearNotice } = useAuth()
  const [step, setStep] = useState<Step>({ name: 'credentials' })
  // each step replaces the form, so put the cursor in its first field
  useEffect(() => {
    document.querySelector<HTMLElement>('#main input:not([type=checkbox]), #main button')?.focus()
  }, [step.name])
  // The session only starts at the very end of setup (after the recovery codes are saved), so being signed in always means: done.
  if (status === 'authed') return <Navigate to="/" replace />

  return (
    <div className="auth">
      <div className="auth-art" aria-hidden>
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark" style={{ background: '#fff', color: 'var(--primary-700)' }}>W</span>Wevest</div>
        <div>
          <h1>Run Wevest safely.</h1>
          <p>Every sensitive change needs a second person. Every action is on the record.</p>
        </div>
        <small>Authorised staff only. Activity is monitored and audited.</small>
      </div>
      <main className="auth-card" id="main">
        {notice && step.name === 'credentials' && <Banner tone="warning">{notice}</Banner>}
        {step.name === 'credentials' && <Credentials onNext={(s) => { clearNotice(); setStep(s) }} />}
        {step.name === 'mfa' && <Mfa token={step.token} onDone={startSession} onBack={() => setStep({ name: 'credentials' })} />}
        {step.name === 'setup' && <ChangePassword step={step} onNext={(s) => setStep(s)} />}
        {step.name === 'totp' && <EnrolTotp token={step.token} onNext={(codes, session) => setStep({ name: 'recovery', codes, session })} />}
        {step.name === 'recovery' && <Recovery codes={step.codes} onDone={() => startSession(step.session)} />}
      </main>
    </div>
  )
}

function Credentials({ onNext }: { onNext: (s: Step) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const r = await api.post<LoginResult>('/v1/staff/auth/login', { email, password }, { noRefresh: true })
      if (r.status === 'mfa_required') onNext({ name: 'mfa', token: r.mfa_token! })
      else if (r.must_change_password) onNext({ name: 'setup', token: r.setup_token!, mustChangePassword: true, current: password })
      else onNext({ name: 'totp', token: r.setup_token! })
    } catch (x) { setErr(message(x)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <div><h1>Sign in</h1><p className="muted" style={{ marginTop: 6 }}>Use your Wevest staff account.</p></div>
      {err && <Banner tone="danger">{err}</Banner>}
      <TextField label="Work email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <PasswordField label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <Button type="submit" loading={busy} disabled={!email || !password}>Continue</Button>
    </form>
  )
}

function Mfa({ token, onDone, onBack }: { token: string; onDone: (s: SessionResponse) => void; onBack: () => void }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try { onDone(await api.post<SessionResponse>('/v1/staff/auth/mfa', { code: code.trim() }, { token })) }
    catch (x) { setErr(message(x)); setCode('') } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div><h1>Two-step verification</h1><p className="muted" style={{ marginTop: 6 }}>Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p></div>
      {err && <Banner tone="danger">{err}</Banner>}
      <TextField label="Code" inputMode="text" autoComplete="one-time-code" className="input otp-input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} required />
      <Button type="submit" loading={busy} disabled={code.trim().length < 6}>Verify and sign in</Button>
      <Button variant="ghost" onClick={onBack}>Back</Button>
    </form>
  )
}

function ChangePassword({ step, onNext }: { step: Extract<Step, { name: 'setup' }>; onNext: (s: Step) => void }) {
  const [pw, setPw] = useState(''); const [again, setAgain] = useState('')
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const mismatch = again.length > 0 && pw !== again
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (pw !== again) return
    setBusy(true); setErr(null)
    try {
      await api.post('/v1/staff/auth/setup/password', { current_password: step.current, new_password: pw }, { token: step.token })
      onNext({ name: 'totp', token: step.token })
    } catch (x) { setErr(message(x)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div><h1>Choose your password</h1><p className="muted" style={{ marginTop: 6 }}>Your temporary password works once. Pick a new one: at least 12 characters with letters and numbers.</p></div>
      {err && <Banner tone="danger">{err}</Banner>}
      <PasswordField label="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={12} required />
      <PasswordField label="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={mismatch ? 'The passwords do not match' : null} required />
      <Button type="submit" loading={busy} disabled={pw.length < 12 || pw !== again}>Save password</Button>
    </form>
  )
}

function EnrolTotp({ token, onNext }: { token: string; onNext: (codes: string[], s: SessionResponse) => void }) {
  const [secret, setSecret] = useState<string | null>(null); const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    api.post<{ secret: string; otpauth_url: string }>('/v1/staff/auth/setup/totp', {}, { token })
      .then(async (r) => { if (!alive) return; setSecret(r.secret); setQr(await QRCode.toDataURL(r.otpauth_url, { margin: 1, width: 192 })) })
      .catch((x) => alive && setErr(message(x)))
    return () => { alive = false }
  }, [token])
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const r = await api.post<SessionResponse & { recovery_codes: string[] }>('/v1/staff/auth/setup/totp/confirm', { code }, { token })
      onNext(r.recovery_codes, r)
    } catch (x) { setErr(message(x)); setCode('') } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div><h1>Set up your authenticator</h1><p className="muted" style={{ marginTop: 6 }}>Scan this with Google Authenticator, 1Password, Authy or similar, then enter the 6-digit code it shows.</p></div>
      {err && <Banner tone="danger">{err}</Banner>}
      {qr && <img className="qr" src={qr} width={192} height={192} alt="QR code to add Wevest Admin to your authenticator app" />}
      {secret && <p className="muted">Cannot scan? Enter this key by hand: <code>{secret}</code></p>}
      <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" className="input otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
      <Button type="submit" loading={busy} disabled={code.length !== 6 || !secret}>Turn on two-step verification</Button>
    </form>
  )
}

function Recovery({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  const text = codes.join('\n')
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Wevest Admin recovery codes\nEach works once.\n\n${text}\n`], { type: 'text/plain' }))
    const a = document.createElement('a'); a.href = url; a.download = 'wevest-recovery-codes.txt'; a.click(); URL.revokeObjectURL(url)
  }
  return (
    <div className="stack">
      <div><h1><ShieldCheck size={22} aria-hidden style={{ verticalAlign: '-3px' }} /> Save your recovery codes</h1><p className="muted" style={{ marginTop: 6 }}>If you lose your phone, each of these codes lets you sign in once. They are shown only now: store them somewhere safe, like a password manager.</p></div>
      <ul className="recovery" aria-label="Recovery codes" style={{ listStyle: 'none', margin: 0 }}>{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="row">
        <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard?.writeText(text)}><Copy size={14} aria-hidden /> Copy</Button>
        <Button variant="secondary" size="sm" onClick={download}><Download size={14} aria-hidden /> Download</Button>
      </div>
      <label className="checkbox"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> <span>I have saved these codes</span></label>
      <Button disabled={!saved} onClick={onDone}>Open the dashboard</Button>
    </div>
  )
}
