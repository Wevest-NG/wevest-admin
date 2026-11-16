import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, onSessionEnded, setAccessToken } from './client'
import { mockApi } from '../test/utils'

const session = { access_token: 'fresh', expires_in: 900, staff: { id: 's', email: 'e', name: 'n', role: { id: 'r', name: 'x' }, permissions: [], last_login_at: null } }

describe('api client', () => {
  beforeEach(() => setAccessToken('old'))
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

  it('sends the bearer token and builds the query string, skipping empty values', async () => {
    const m = mockApi({ 'GET /v1/x': () => ({ body: { ok: true } }) })
    await api.get('/v1/x', { a: 1, b: '', c: undefined, d: 'z y' })
    expect(m.calls[0]?.url).toBe('/v1/x?a=1&d=z+y')
    expect((m.fetch.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer old')
  })

  it('turns the error envelope into an ApiError', async () => {
    mockApi({ 'POST /v1/x': () => ({ status: 422, body: { error: { code: 'NOPE', message: 'Not allowed', details: { a: 1 } } } }) })
    await expect(api.post('/v1/x', {})).rejects.toMatchObject({ name: 'ApiError', status: 422, code: 'NOPE', message: 'Not allowed', details: { a: 1 } })
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    let first = true
    const m = mockApi({
      'GET /v1/x': ({ headers }) => (first && ((first = false), true) ? { status: 401, body: { error: { code: 'SESSION_ENDED', message: 'x' } } } : { body: { token: headers.get('authorization') } }),
      'POST /v1/staff/auth/refresh': () => ({ body: session }),
    })
    const r = await api.get<{ token: string }>('/v1/x')
    expect(r.token).toBe('Bearer fresh')
    expect(m.calls.filter((c) => c.url === '/v1/staff/auth/refresh')).toHaveLength(1)
  })

  it('shares one refresh between simultaneous requests', async () => {
    let expired = 2
    const m = mockApi({
      'GET /v1/a': () => (expired-- > 0 ? { status: 401, body: {} } : { body: { ok: 'a' } }),
      'GET /v1/b': () => (expired-- > 0 ? { status: 401, body: {} } : { body: { ok: 'b' } }),
      'POST /v1/staff/auth/refresh': () => ({ body: session }),
    })
    const [a, b] = await Promise.all([api.get<{ ok: string }>('/v1/a'), api.get<{ ok: string }>('/v1/b')])
    expect([a.ok, b.ok]).toEqual(['a', 'b'])
    expect(m.calls.filter((c) => c.url === '/v1/staff/auth/refresh')).toHaveLength(1)
  })

  it('tells the app the session ended when refreshing fails', async () => {
    mockApi({ 'GET /v1/x': () => ({ status: 401, body: {} }), 'POST /v1/staff/auth/refresh': () => ({ status: 401, body: {} }) })
    const ended = vi.fn(); const off = onSessionEnded(ended)
    await expect(api.get('/v1/x')).rejects.toBeInstanceOf(ApiError)
    expect(ended).toHaveBeenCalledOnce(); off()
  })

  it('does not treat a rate-limited or unreachable refresh as being signed out', async () => {
    mockApi({ 'GET /v1/x': () => ({ status: 401, body: {} }), 'POST /v1/staff/auth/refresh': () => ({ status: 429, body: {} }) })
    const ended = vi.fn(); const off = onSessionEnded(ended)
    await expect(api.get('/v1/x')).rejects.toMatchObject({ code: 'UNAVAILABLE' })
    expect(ended).not.toHaveBeenCalled(); off()
  })

  it('does not try to refresh limited-purpose tokens (setup / second factor)', async () => {
    const m = mockApi({ 'POST /v1/staff/auth/mfa': () => ({ status: 401, body: { error: { code: 'MFA_INVALID', message: 'That code is not valid' } } }) })
    await expect(api.post('/v1/staff/auth/mfa', { code: '1' }, { token: 'mfa-token' })).rejects.toMatchObject({ code: 'MFA_INVALID' })
    expect(m.calls).toHaveLength(1)
  })

  it('reports an unreachable server in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(api.get('/v1/x')).rejects.toMatchObject({ code: 'NETWORK', message: expect.stringContaining('Cannot reach the server') })
  })

  it('handles 204 with no body', async () => {
    mockApi({ 'DELETE /v1/x': () => ({ status: 204 }) })
    await expect(api.del('/v1/x')).resolves.toBeUndefined()
  })
})
