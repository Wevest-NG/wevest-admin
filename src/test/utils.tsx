import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { ToastProvider } from '../ui/Toasts'
import type { StaffProfile } from '../api/client'

export const staffWith = (permissions: string[], role = 'Tester'): StaffProfile => ({ id: 's1', email: 'tester@wevest.app', name: 'Test Person', role: { id: 'r1', name: role }, permissions, last_login_at: null })

type Handler = (req: { url: string; method: string; body: unknown; headers: Headers }) => { status?: number; body?: unknown; headers?: Record<string, string> }
export interface Call { url: string; method: string; body: unknown }

/** Stubs fetch with route handlers keyed `METHOD /path` (query string ignored). Anything unhandled is a 404 so a test fails loudly. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = []
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url: url.pathname + url.search, method, body })
    const h = routes[`${method} ${url.pathname}`]
    if (!h) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `no mock for ${method} ${url.pathname}` } }), { status: 404 })
    const r = h({ url: url.pathname + url.search, method, body, headers: new Headers(init?.headers) })
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json', ...r.headers } })
  })
  vi.stubGlobal('fetch', f)
  return { calls, fetch: f }
}

/** A signed-in dashboard: the refresh cookie "exists", so the session starts as this staff member. */
export function signedIn(staff: StaffProfile, extra: Record<string, Handler> = {}) {
  return mockApi({
    'POST /v1/staff/auth/refresh': () => ({ body: { access_token: 'tok', expires_in: 900, staff } }),
    'GET /v1/admin/approvals/summary': () => ({ body: { waiting_for_you: 0, your_open_requests: 0 } }),
    ...extra,
  })
}

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AuthProvider>{ui}</AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Runs axe-core over a rendered subtree. Colour contrast needs real layout, so it is checked in the browser, not jsdom. */
export async function a11yViolations(node: Element): Promise<string[]> {
  const r = await axe.run(node, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
  return r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}
