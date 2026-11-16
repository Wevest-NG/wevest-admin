import { describe, expect, it, afterEach, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import Jobs from './Jobs'
import JobDetail from './JobDetail'
import Audit from './Audit'
import { renderWithProviders, signedIn, staffWith } from '../test/utils'

afterEach(() => vi.unstubAllGlobals())

const failed = { id: 'r1', job: 'orders', trigger: 'schedule', status: 'failed', started_at: new Date(Date.now() - 600_000).toISOString(), finished_at: null, duration_ms: 1800, failed_step: 'sync_orders', error: '2 of 9 orders could not be synced.' }
const detail = {
  run: { ...failed, result: null, started_by_name: null },
  steps: [
    { seq: 1, name: 'find_orders', label: 'Find orders still pending after a minute', status: 'succeeded', started_at: failed.started_at, duration_ms: 12, detail: { orders: 9 }, error: null },
    { seq: 2, name: 'sync_orders', label: 'Ask the broker for each order\'s status', status: 'failed', started_at: failed.started_at, duration_ms: 1700, detail: null, error: '2 of 9 orders could not be synced. First: broker timeout' },
  ],
}
const plan = { job: 'orders', summary: 'Asks the broker about pending orders.', effect: 'May settle or fail pending orders.', idempotent: true,
  steps: [{ name: 'find_orders', label: 'Find orders still pending after a minute' }, { name: 'sync_orders', label: 'Ask the broker for each order\'s status' }], last_run: null }
const page = () => <Routes><Route path="/jobs" element={<Jobs />} /><Route path="/jobs/:name" element={<JobDetail />} /></Routes>

describe('jobs list', () => {
  it('flags a failing job and names the step it failed at', async () => {
    signedIn(staffWith(['jobs.run']), { 'GET /v1/admin/jobs': () => ({ body: { data: ['orders', 'cleanup'], last_runs: { orders: failed } } }) })
    renderWithProviders(page(), { route: '/jobs' })
    expect(await screen.findByText('1 job failed on the latest run')).toBeInTheDocument()
    expect(screen.getAllByText(/sync orders/).length).toBeGreaterThan(0)
    expect(screen.getByText('No runs recorded yet')).toBeInTheDocument()
  })

  it('opens a job from its card, and does not run anything from the list', async () => {
    const m = signedIn(staffWith(['jobs.run']), {
      'GET /v1/admin/jobs': () => ({ body: { data: ['orders'], last_runs: { orders: failed } } }),
      'GET /v1/admin/jobs/orders/plan': () => ({ body: plan }),
      'GET /v1/admin/jobs/runs': () => ({ body: { data: [failed], has_more: false } }),
      'GET /v1/admin/jobs/runs/r1': () => ({ body: detail }),
    })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/jobs' })
    await user.click(await screen.findByRole('button', { name: /Open orders/ }))
    expect(await screen.findByRole('heading', { name: 'orders' })).toBeInTheDocument()
    expect(m.calls.some((c) => c.method === 'POST' && c.url.includes('/run'))).toBe(false)
  })
})

describe('job screen', () => {
  const routes = {
    'GET /v1/admin/jobs/orders/plan': () => ({ body: plan }),
    'GET /v1/admin/jobs/runs': () => ({ body: { data: [failed, { ...failed, id: 'r0', status: 'succeeded', failed_step: null, error: null }], has_more: false } }),
    'GET /v1/admin/jobs/runs/r1': () => ({ body: detail }),
  }

  it('shows the steps of the latest run, which one failed and why, and the past runs', async () => {
    signedIn(staffWith(['jobs.run']), routes)
    renderWithProviders(page(), { route: '/jobs/orders' })
    const steps = await screen.findByRole('list', { name: 'Steps in this run' })
    expect(within(steps).getByText(/1\. Find orders still pending/)).toBeInTheDocument()
    expect(within(steps).getByText('2 of 9 orders could not be synced. First: broker timeout')).toBeInTheDocument()
    expect(screen.getByText('Failed at “sync orders”')).toBeInTheDocument()
    const runs = screen.getByRole('region', { name: 'Runs of orders' })
    expect(within(runs).getAllByRole('row')).toHaveLength(3) // header + 2 runs
  })

  it('lists steps a failed run never reached as not run', async () => {
    const early = { ...detail, steps: [{ ...detail.steps[0], status: 'failed', error: 'db down' }] }
    signedIn(staffWith(['jobs.run']), { ...routes, 'GET /v1/admin/jobs/runs/r1': () => ({ body: early }) })
    renderWithProviders(page(), { route: '/jobs/orders' })
    expect(await screen.findByText('Did not run')).toBeInTheDocument()
  })

  it('runs the job from this screen', async () => {
    const m = signedIn(staffWith(['jobs.run']), { ...routes, 'POST /v1/admin/jobs/orders/run': () => ({ body: { job: 'orders', run_id: 'r1', status: 'failed', result: null, error: 'x', failed_step: 'sync_orders' } }) })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/jobs/orders' })
    await user.click(await screen.findByRole('button', { name: /Run now/ }))
    await screen.findByText('orders failed at "sync orders".')
    expect(m.calls.some((c) => c.method === 'POST' && c.url === '/v1/admin/jobs/orders/run')).toBe(true)
  })
})

describe('audit log', () => {
  it('reads as sentences with names, and keeps the technical code underneath', async () => {
    signedIn(staffWith(['audit.read']), {
      'GET /v1/admin/audit-log/verify': () => ({ body: { ok: true, entries: 3, head_seq: 3, head_hash: 'abc', first_bad_seq: null, broken_anchors: [] } }),
      'GET /v1/admin/audit-log': () => ({ body: { next_cursor: null, data: [{
        id: 3, actor_id: 'a', actor_role: 'staff', actor: { kind: 'staff', name: 'Grace Hopper' }, action: 'user.frozen', summary: 'Grace Hopper froze Ada Obi\'s account (approved by Alan Turing). Reason: Suspicious activity',
        target_label: 'Ada Obi', target_type: 'user', target_id: 'u', details: [{ label: 'Reason', value: 'Suspicious activity' }], meta: {}, ip: '10.0.0.1', created_at: new Date().toISOString(),
      }] } }),
    })
    renderWithProviders(<Audit />)
    expect(await screen.findByText(/Grace Hopper froze Ada Obi's account/)).toBeInTheDocument()
    expect(screen.getByText('user.frozen')).toBeInTheDocument()
    expect(screen.getByText('Staff')).toBeInTheDocument()
  })
})

describe('large values', () => {
  it('formats big numbers and long durations readably', async () => {
    const { duration, formatValue } = await import('../lib/format')
    expect(formatValue(20000)).toBe('20,000')
    expect(formatValue(1234567890.5)).toBe('1,234,567,890.5')
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
    expect(duration(850)).toBe('850 ms')
    expect(duration(185_000)).toBe('3 min 5 s')
    expect(duration(7_800_000)).toBe('2 h 10 min')
    expect(duration(100_800_000)).toBe('1 d 4 h')
  })

  it('cuts a very long error to a readable length and lets you open all of it', async () => {
    const long = 'provider said: ' + 'no '.repeat(400)
    signedIn(staffWith(['jobs.run']), {
      'GET /v1/admin/jobs/orders/plan': () => ({ body: plan }),
      'GET /v1/admin/jobs/runs': () => ({ body: { data: [failed], has_more: false } }),
      'GET /v1/admin/jobs/runs/r1': () => ({ body: { ...detail, steps: [{ ...detail.steps[0], status: 'failed', error: long, detail: { orders: 1234567 } }] } }),
    })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/jobs/orders' })
    const steps = await screen.findByRole('list', { name: 'Steps in this run' })
    expect(within(steps).getByText('Orders: 1,234,567')).toBeInTheDocument()
    expect(within(steps).queryByText(long.trim(), { exact: false })).not.toBeInTheDocument()
    await user.click(within(steps).getByRole('button', { name: 'Show all' }))
    expect(within(steps).getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('lets you find one job among many, with failing ones first', async () => {
    const names = Array.from({ length: 40 }, (_, i) => `job${String(i).padStart(2, '0')}`)
    signedIn(staffWith(['jobs.run']), { 'GET /v1/admin/jobs': () => ({ body: { data: names, last_runs: { job39: { ...failed, job: 'job39', failed_step: null } } } }) })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/jobs' })
    await screen.findByLabelText('Find a job')
    expect(screen.getAllByRole('button', { name: /^Open job/ })[0]).toHaveAccessibleName('Open job39: steps and past runs')
    await user.type(screen.getByLabelText('Find a job'), 'job07')
    expect(screen.getAllByRole('button', { name: /^Open job/ })).toHaveLength(1)
  })
})
