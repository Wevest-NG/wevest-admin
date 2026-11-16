import { describe, expect, it, afterEach, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import Approvals from './Approvals'
import Payments from './Payments'
import Roles from './Roles'
import Staff from './Staff'
import Overview from './Overview'
import { parseEntries } from './aml/AmlScreening'
import { a11yViolations, renderWithProviders, signedIn, staffWith } from '../test/utils'
import type { ApprovalItem } from '../api/types'

afterEach(() => vi.unstubAllGlobals())

const approval = (over: Partial<ApprovalItem> = {}): ApprovalItem => ({
  id: 'a1', action: 'user.freeze', label: 'Freeze a customer account', summary: 'Freeze Ada Lovelace (ada@x.io). Reason: Suspicious activity', status: 'pending',
  requested_by: { id: 'other', name: 'Grace Hopper' }, requested_at: new Date(Date.now() - 3_600_000).toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  decided_by: null, decided_at: null, decision_note: null, executed_at: null, error: null, can_decide: true, can_cancel: false, approve_permission: 'users.freeze.approve',
  payload: { user_id: 'u1', reason: 'Suspicious activity' }, result: null, ...over,
})

describe('approvals', () => {
  const routes = (item: ApprovalItem) => ({
    'GET /v1/admin/approvals': () => ({ body: { data: [item], next_cursor: null } }),
    'GET /v1/admin/approvals/a1': () => ({ body: item }),
  })
  const page = () => <Routes><Route path="/approvals" element={<Approvals />} /><Route path="/approvals/:id" element={<Approvals />} /></Routes>

  it('lists what is waiting for you and shows exactly what will run before you decide', async () => {
    signedIn(staffWith(['users.freeze.approve']), routes(approval()))
    renderWithProviders(page(), { route: '/approvals/a1' })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/Exactly what will run/)).toBeInTheDocument()
    expect(within(dialog).getByText(/"reason": "Suspicious activity"/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Approve and run/ })).toBeInTheDocument()
  })

  it('approving sends the decision to the server', async () => {
    const m = signedIn(staffWith(['users.freeze.approve']), { ...routes(approval()), 'POST /v1/admin/approvals/a1/approve': () => ({ body: approval({ status: 'executed', can_decide: false }) }) })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/approvals/a1' })
    await user.click(await screen.findByRole('button', { name: /Approve and run/ }))
    await screen.findByText('Approved and done.')
    expect(m.calls.some((c) => c.method === 'POST' && c.url === '/v1/admin/approvals/a1/approve')).toBe(true)
  })

  it('will not reject without a reason', async () => {
    signedIn(staffWith(['users.freeze.approve']), routes(approval()))
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/approvals/a1' })
    await user.click(await screen.findByRole('button', { name: /Reject/ }))
    expect(screen.getByRole('button', { name: 'Confirm rejection' })).toBeDisabled()
    await user.type(screen.getByLabelText(/Why are you rejecting/), 'Not enough evidence')
    expect(screen.getByRole('button', { name: 'Confirm rejection' })).toBeEnabled()
  })

  it('offers no decision on your own request, only a way to withdraw it', async () => {
    signedIn(staffWith(['users.freeze']), routes(approval({ can_decide: false, can_cancel: true, requested_by: { id: 's1', name: 'Test Person' } })))
    renderWithProviders(page(), { route: '/approvals/a1' })
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('button', { name: /Withdraw request/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Approve and run/ })).not.toBeInTheDocument()
  })

  it('has no automatically detectable accessibility problems', async () => {
    signedIn(staffWith(['users.freeze.approve']), routes(approval()))
    const { container } = renderWithProviders(page(), { route: '/approvals' })
    await screen.findByText('Freeze a customer account')
    expect(await a11yViolations(container)).toEqual([])
  })
})

describe('payments', () => {
  const recon = { stuck_intents: [], review_intents: [{ id: 'i1', user_id: 'u1', kind: 'bank_transfer', provider: 'mock', reference: 'wv_123', amount: 1_000_000, failure_reason: 'underpaid', created_at: new Date().toISOString() }], stuck_withdrawals: [], failing_webhooks: [], ledger_drift: [], books_problems: [] }

  it('lets a role that can request resolution do so, and says it needs a second person', async () => {
    const m = signedIn(staffWith(['payments.read', 'payments.resolve']), { 'GET /v1/admin/reconciliation': () => ({ body: recon }), 'POST /v1/admin/payments/intents/i1/resolve': () => ({ status: 202, body: { approval: { id: 'x', status: 'pending', summary: 'Credit ₦10,000.00', expires_at: new Date().toISOString(), approvers_needed_with: 'payments.resolve.approve' } } }) })
    const user = userEvent.setup()
    renderWithProviders(<Payments />)
    await user.click(await screen.findByRole('button', { name: 'Resolve…' }))
    expect(screen.getByText(/second person has to approve/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Reason'), 'Customer topped up the difference')
    await user.click(screen.getByRole('button', { name: 'Send for approval' }))
    expect(await screen.findByText(/Sent for approval/)).toBeInTheDocument()
    expect(m.calls.find((c) => c.url === '/v1/admin/payments/intents/i1/resolve')?.body).toMatchObject({ action: 'credit', note: 'Customer topped up the difference' })
  })

  it('hides the resolve button from a read-only role', async () => {
    signedIn(staffWith(['payments.read'], 'Auditor'), { 'GET /v1/admin/reconciliation': () => ({ body: recon }) })
    renderWithProviders(<Payments />)
    expect(await screen.findByText('wv_123')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resolve…' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Run reconciler/ })).not.toBeInTheDocument()
  })
})

describe('roles and staff', () => {
  const catalogue = { data: [
    { key: 'users.read', group: 'Customers', label: 'View customers', description: 'Search customers.' },
    { key: 'books.export', group: 'Finance', label: 'Export the books', description: 'Download the journal.' },
  ] }
  const roles = { data: [
    { id: 'r0', name: 'Super Admin', description: 'Everything', permissions: ['*'], is_system: true, members: 1, updated_at: new Date().toISOString() },
    { id: 'r1', name: 'Reader', description: 'Reads', permissions: ['users.read'], is_system: false, members: 0, updated_at: new Date().toISOString() },
  ] }

  it('will not let you grant a permission you do not hold', async () => {
    signedIn(staffWith(['staff.read', 'roles.manage', 'users.read'], 'Manager'), { 'GET /v1/admin/roles': () => ({ body: roles }), 'GET /v1/admin/permissions': () => ({ body: catalogue }) })
    const user = userEvent.setup()
    renderWithProviders(<Roles />)
    await user.click(await screen.findByRole('button', { name: 'New role' }))
    const own = await screen.findByLabelText(/View customers/); const other = screen.getByLabelText(/Export the books/)
    expect(own).toBeEnabled(); expect(other).toBeDisabled()
    expect(screen.getByText(/you do not hold this/)).toBeInTheDocument()
  })

  it('explains that editing a role is sent for approval, and protects the Super Admin role', async () => {
    signedIn(staffWith(['*'], 'Super Admin'), { 'GET /v1/admin/roles': () => ({ body: roles }), 'GET /v1/admin/permissions': () => ({ body: catalogue }) })
    const user = userEvent.setup()
    renderWithProviders(<Roles />)
    const rows = await screen.findAllByRole('row')
    await user.click(within(rows.find((r) => r.textContent?.includes('Reader'))!).getByRole('button', { name: /Edit/ }))
    expect(await screen.findByText(/Nothing changes until a second person approves/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(within(rows.find((r) => r.textContent?.includes('Super Admin'))!).getByRole('button', { name: /View/ }))
    expect(await screen.findByText(/cannot be changed/)).toBeInTheDocument()
  })

  it('never offers actions on your own staff account', async () => {
    const staff = { data: [
      { id: 's1', email: 'tester@wevest.app', name: 'Test Person', status: 'active', two_factor: true, must_change_password: false, role: { id: 'r0', name: 'Super Admin' }, last_login_at: null, created_at: new Date().toISOString() },
      { id: 's2', email: 'other@wevest.app', name: 'Other Person', status: 'active', two_factor: false, must_change_password: true, role: { id: 'r1', name: 'Support' }, last_login_at: null, created_at: new Date().toISOString() },
    ] }
    signedIn(staffWith(['*'], 'Super Admin'), { 'GET /v1/admin/staff': () => ({ body: staff }), 'GET /v1/admin/roles': () => ({ body: roles }) })
    renderWithProviders(<Staff />)
    expect(await screen.findByText('Other Person')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Disable Test Person/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Disable Other Person/ })).toBeInTheDocument()
    expect(screen.getByText('Not set up')).toBeInTheDocument()
  })
})

describe('overview', () => {
  it('only asks for what the role may see, and flags a broken audit chain', async () => {
    const m = signedIn(staffWith(['audit.read', 'users.read']), { 'GET /v1/admin/audit-log/verify': () => ({ body: { ok: false, entries: 10, head_seq: 10, head_hash: 'abc', first_bad_seq: 4, broken_anchors: [] } }) })
    renderWithProviders(<Overview />)
    expect(await screen.findByText('The audit log failed verification')).toBeInTheDocument()
    expect(m.calls.some((c) => c.url.startsWith('/v1/admin/books'))).toBe(false)
    expect(m.calls.some((c) => c.url.startsWith('/v1/admin/aml'))).toBe(false)
  })
})

describe('screening import', () => {
  it('reads one person per line with optional fields', () => {
    const r = parseEntries('Musa Ibrahim Abdullahi | Abu Musa; M. Ibrahim | NG | 1970-05-01 | UN-1\n\nAda Lovelace')
    expect(r.errors).toEqual([])
    expect(r.entries).toEqual([{ name: 'Musa Ibrahim Abdullahi', aliases: ['Abu Musa', 'M. Ibrahim'], country: 'NG', dob: '1970-05-01', reference: 'UN-1' }, { name: 'Ada Lovelace', aliases: undefined, country: undefined, dob: undefined, reference: undefined }])
  })
  it('points at the bad line', () => {
    const r = parseEntries('Good Name\nX\nAnother Name | | | 01/02/1970')
    expect(r.entries).toHaveLength(1)
    expect(r.errors).toEqual(['Line 2: the name is too short', 'Line 3: the date of birth must look like 1970-05-01'])
  })
})
