/**
 * Thin fetch wrapper for the Wevest admin API.
 * - The access token lives in memory only (never localStorage); the refresh token is an HttpOnly cookie the browser sends by itself.
 * - A 401 triggers exactly one silent refresh (shared by concurrent requests) and a retry; if that fails the session has ended.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface StaffProfile {
  id: string
  email: string
  name: string
  role: { id: string; name: string }
  permissions: string[]
  last_login_at: string | null
}

export interface SessionResponse {
  access_token: string
  expires_in: number
  staff: StaffProfile
}

let accessToken: string | null = null
const endedListeners = new Set<() => void>()

export const setAccessToken = (t: string | null) => {
  accessToken = t
}
export const getAccessToken = () => accessToken
export const onSessionEnded = (fn: () => void) => {
  endedListeners.add(fn)
  return () => {
    endedListeners.delete(fn)
  }
}

interface Options {
  /** A limited-purpose token (setup / second factor) used instead of the session token. */
  token?: string
  query?: Record<string, unknown>
  body?: unknown
  signal?: AbortSignal
  /** Do not try to refresh the session on 401 (auth endpoints). */
  noRefresh?: boolean
}

export const CSRF_HEADER = { 'X-Requested-With': 'wevest-dashboard' }

function withQuery(path: string, query?: Record<string, unknown>): string {
  if (!query) return path
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `${path}?${s}` : path
}

let refreshing: Promise<SessionResponse | null> | null = null
/** HTTP status of the last refresh attempt (0 = could not reach the server). Only 401/403 mean the session is really over. */
export let lastRefreshStatus = 200

/** Exchange the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/v1/staff/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { ...CSRF_HEADER, Accept: 'application/json' } })
      lastRefreshStatus = res.status
      if (!res.ok) return null
      const s = (await res.json()) as SessionResponse
      accessToken = s.access_token
      return s
    } catch {
      lastRefreshStatus = 0
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

async function request<T>(method: string, path: string, o: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = o.token ?? accessToken
  if (token) headers.Authorization = `Bearer ${token}`
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(withQuery(path, o.query), { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), credentials: 'same-origin', signal: o.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 401 && !o.token && !o.noRefresh) {
    if (await refreshSession()) return request<T>(method, path, { ...o, noRefresh: true })
    // Rate-limited or the server is down: that is not the same as being signed out, so do not throw the person out of their work.
    if (lastRefreshStatus === 401 || lastRefreshStatus === 403) {
      accessToken = null
      endedListeners.forEach((f) => f())
    } else {
      throw new ApiError(lastRefreshStatus, 'UNAVAILABLE', 'The sign-in service is busy or unreachable. Wait a moment and try again.')
    }
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details)
  }
  return json as T
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>, o: Options = {}) => request<T>('GET', path, { ...o, query }),
  post: <T>(path: string, body: unknown = {}, o: Options = {}) => request<T>('POST', path, { ...o, body }),
  patch: <T>(path: string, body: unknown = {}, o: Options = {}) => request<T>('PATCH', path, { ...o, body }),
  put: <T>(path: string, body: unknown = {}, o: Options = {}) => request<T>('PUT', path, { ...o, body }),
  del: <T>(path: string, o: Options = {}) => request<T>('DELETE', path, o),
  /** For the logout call: needs the CSRF header like refresh does. */
  csrf: CSRF_HEADER,
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch('/v1/staff/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { ...CSRF_HEADER, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } })
  } catch {
    /* the cookie expires on its own */
  }
  accessToken = null
}
