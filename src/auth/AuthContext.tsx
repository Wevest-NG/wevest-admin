import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { lastRefreshStatus, logoutRequest, onSessionEnded, refreshSession, setAccessToken, type SessionResponse, type StaffProfile } from '../api/client'

type Status = 'loading' | 'anon' | 'authed' | 'unavailable'

interface AuthValue {
  status: Status
  staff: StaffProfile | null
  /** True when the signed-in role holds the permission (or everything). */
  can: (permission: string) => boolean
  canAny: (...permissions: string[]) => boolean
  startSession: (s: SessionResponse) => void
  signOut: () => Promise<void>
  /** Try the sign-in check again (after the service was unavailable). */
  retry: () => void
  /** Why the last session ended, shown once on the login page. */
  notice: string | null
  clearNotice: () => void
}

const Ctx = createContext<AuthValue | null>(null)

export function hasPermission(held: readonly string[], needed: string): boolean {
  return held.includes('*') || held.includes(needed)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [staff, setStaff] = useState<StaffProfile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const startSession = useCallback((s: SessionResponse) => {
    setAccessToken(s.access_token)
    setStaff(s.staff)
    setStatus('authed')
    setNotice(null)
  }, [])

  // On load, the HttpOnly refresh cookie (if any) tells us whether someone is already signed in.
  // Only a 401/403 means "not signed in"; a busy or unreachable server must not look like a sign-out.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    void refreshSession().then((s) => {
      if (!alive) return
      if (s) startSession(s)
      else setStatus(lastRefreshStatus === 401 || lastRefreshStatus === 403 ? 'anon' : 'unavailable')
    })
    return () => {
      alive = false
    }
  }, [startSession, attempt])

  useEffect(
    () =>
      onSessionEnded(() => {
        setStaff(null)
        setStatus('anon')
        setNotice('Your session ended. Please sign in again.')
        qc.clear()
      }),
    [qc],
  )

  const signOut = useCallback(async () => {
    await logoutRequest()
    setStaff(null)
    setStatus('anon')
    qc.clear()
  }, [qc])

  const value = useMemo<AuthValue>(() => {
    const held = staff?.permissions ?? []
    return {
      status,
      staff,
      can: (p) => hasPermission(held, p),
      canAny: (...ps) => ps.some((p) => hasPermission(held, p)),
      startSession,
      signOut,
      retry: () => {
        setStatus('loading')
        setAttempt((n) => n + 1)
      },
      notice,
      clearNotice: () => setNotice(null),
    }
  }, [status, staff, startSession, signOut, notice])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
