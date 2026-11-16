import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, ShieldAlert, Snowflake, Sun } from 'lucide-react'
import { api } from '../api/client'
import type { AmlCaseRow, Customer360, CustomerTransaction, Paged } from '../api/types'
import { Can } from '../auth/Can'
import { useAuth } from '../auth/AuthContext'
import { dateOnly, dateTime, fullName, humanize, money } from '../lib/format'
import { errorMessage, useGated } from '../lib/gated'
import { Badge, Banner, Button, Card, DataTable, ErrorState, KeyValue, LoadingRows, PageHeader, Pager, Status } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { SelectField, TextAreaField, TextField } from '../ui/forms'
import { useToast } from '../ui/Toasts'

export default function CustomerDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<Customer360>(`/v1/admin/users/${id}`) })
  const cases = useQuery({ queryKey: ['aml', 'cases', 'user', id], queryFn: () => api.get<Paged<AmlCaseRow>>('/v1/admin/aml/cases', { user_id: id, limit: 10 }), enabled: can('aml.read') })
  const [dlg, setDlg] = useState<'freeze' | 'unfreeze' | 'case' | 'address' | null>(null)

  if (q.isLoading) return <LoadingRows />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const { user, kyc, wallets, counts, bank_accounts: banks, savings, holdings, logins, devices } = q.data
  const steps: [string, string | null | undefined][] = kyc ? [['BVN', kyc.bvn_verified_at], ['NIN', kyc.nin_verified_at], ['Selfie', kyc.selfie_verified_at], ['Proof of address', kyc.address_verified_at]] : []

  return (
    <>
      <PageHeader title={fullName(user)} subtitle={<>{user.email ?? user.phone} · <Link to="/customers">All customers</Link></>}
        actions={<>
          <Can perm="users.freeze">{user.status === 'frozen'
            ? <Button variant="secondary" onClick={() => setDlg('unfreeze')}><Sun size={16} aria-hidden /> Request unfreeze</Button>
            : user.status === 'active' || user.status === 'deactivated' ? <Button variant="secondary" onClick={() => setDlg('freeze')}><Snowflake size={16} aria-hidden /> Request freeze</Button> : null}</Can>
          <Can perm="aml.work"><Button variant="secondary" onClick={() => setDlg('case')}><ShieldAlert size={16} aria-hidden /> Open AML case</Button></Can>
        </>} />
      {user.status === 'frozen' && <Banner tone="danger" title="This account is frozen">The customer cannot sign in or move money.</Banner>}
      <div className="grid cols-2">
        <Card title="Profile"><KeyValue items={[['Customer ID', <span key="i" className="mono">{user.id}</span>], ['Status', <Status key="s" value={user.status} />], ['Tier', `Tier ${user.tier}`], ['Account type', humanize(user.account_type)], ['Email', user.email], ['Phone', user.phone], ['Date of birth', dateOnly(kyc?.dob)], ['Address', addressText(kyc?.address)], ['Joined', dateTime(user.created_at)], ...(user.deactivated_at ? [['Deactivated', dateTime(user.deactivated_at)] as [string, React.ReactNode]] : [])]} /></Card>
        <Card title="Wallets and account numbers">{wallets.length === 0 ? <p className="muted">No wallets.</p> : wallets.map((w) => (
          <div key={w.id} style={{ marginBottom: 16 }}>
            <KeyValue items={[
              [`${w.currency} balance`, <span key="b" className="num" style={{ fontWeight: 600 }}>{money(w.balance, w.currency)}</span>],
              ['Account number', w.account_number ? <span key="n" className="mono">{w.account_number}</span> : <span key="n" className="muted">Not issued yet</span>],
              ...(w.account_number ? [['Account name', w.account_name] as [string, React.ReactNode], ['Bank', w.bank_name] as [string, React.ReactNode]] : []),
              ['Wallet opened', dateOnly(w.created_at)],
            ]} />
          </div>
        ))}
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
          <KeyValue items={Object.entries(counts).map(([k, v]) => [humanize(k), v] as [string, React.ReactNode])} /></Card>
      </div>
      <Card title="Identity checks" actions={can('kyc.review') && kyc?.has_address_doc && !kyc.address_verified_at ? <Button size="sm" onClick={() => setDlg('address')}>Review proof of address</Button> : undefined}>
        {!kyc ? <p className="muted">No KYC record yet.</p> : (
          <div className="row" style={{ gap: 24 }}>
            {steps.map(([name, at]) => <div key={name}><div className="muted">{name}</div>{at ? <Badge tone="success" dot>Verified</Badge> : <Badge dot>Not verified</Badge>}</div>)}
            {kyc.bvn_last4 && <div><div className="muted">BVN</div><span className="mono">••••{kyc.bvn_last4}</span></div>}
          </div>
        )}
      </Card>
      <Transactions userId={id} />
      <div className="grid cols-2">
        <Card title="Linked bank accounts (payouts)" flush>
          <DataTable<Customer360['bank_accounts'][number]> caption="Linked bank accounts" rows={banks} rowKey={(r) => r.id}
            empty={<p className="muted" style={{ padding: 20 }}>No bank accounts linked.</p>}
            columns={[{ key: 'b', header: 'Bank', cell: (r) => <>{r.bank_name}{r.is_default && <> <Badge tone="primary">Default</Badge></>}</> }, { key: 'n', header: 'Account', cell: (r) => <><span className="mono">{r.account_number}</span><div className="cell-sub">{r.account_name}</div></> }, { key: 'a', header: 'Added', cell: (r) => dateOnly(r.created_at) }]} />
        </Card>
        <Card title="Savings plans" flush>
          <DataTable<Customer360['savings'][number]> caption="Savings plans" rows={savings} rowKey={(r) => r.id}
            empty={<p className="muted" style={{ padding: 20 }}>No savings plans.</p>}
            columns={[{ key: 'n', header: 'Plan', cell: (r) => <>{r.name}<div className="cell-sub">{humanize(r.product_code)} · {(r.rate_bps / 100).toFixed(2)}% p.a.{r.maturity_date ? ` · matures ${dateOnly(r.maturity_date)}` : ''}</div></> }, { key: 'b', header: 'Balance', align: 'right', cell: (r) => <span className="num">{money(r.balance, r.currency)}{r.target_amount ? <div className="cell-sub">of {money(r.target_amount, r.currency)}</div> : null}</span> }, { key: 's', header: 'Status', cell: (r) => <Status value={r.status} /> }]} />
        </Card>
      </div>
      <Card title="Investment holdings" flush>
        <DataTable<Customer360['holdings'][number]> caption="Investment holdings" rows={holdings} rowKey={(r) => r.symbol}
          empty={<p className="muted" style={{ padding: 20 }}>No investments.</p>}
          columns={[{ key: 's', header: 'Instrument', cell: (r) => <>{r.symbol}<div className="cell-sub">{r.name}</div></> }, { key: 't', header: 'Type', cell: (r) => humanize(r.type) }, { key: 'q', header: 'Units', align: 'right', cell: (r) => <span className="num">{Number(r.quantity).toLocaleString('en-NG', { maximumFractionDigits: 4 })}</span> }, { key: 'c', header: 'Cost', align: 'right', cell: (r) => <span className="num">{money(r.cost_basis, r.currency)}</span> }, { key: 'v', header: 'Value now', align: 'right', cell: (r) => <span className="num">{r.price == null ? '—' : money(Math.round(Number(r.quantity) * r.price), r.currency)}</span> }]} />
      </Card>
      <div className="grid cols-2">
        <Card title="Recent sign-ins" flush>
          <DataTable<Customer360['logins'][number]> caption="Recent sign-ins" rows={logins} rowKey={(r) => `${r.created_at}-${r.ip}-${r.method}`}
            empty={<p className="muted" style={{ padding: 20 }}>No sign-ins recorded.</p>}
            columns={[{ key: 'w', header: 'When', cell: (r) => dateTime(r.created_at) }, { key: 'r', header: 'Result', cell: (r) => <Status value={r.success ? 'succeeded' : 'failed'} /> }, { key: 'm', header: 'Method', cell: (r) => <>{humanize(r.method)}{r.reason && <div className="cell-sub">{humanize(r.reason)}</div>}</> }, { key: 'i', header: 'IP', cell: (r) => <span className="mono">{r.ip ?? '—'}</span> }]} />
        </Card>
        <Card title="Devices" flush>
          <DataTable<Customer360['devices'][number]> caption="Devices" rows={devices} rowKey={(r) => `${r.name}-${r.created_at}`}
            empty={<p className="muted" style={{ padding: 20 }}>No devices.</p>}
            columns={[{ key: 'n', header: 'Device', cell: (r) => <>{r.name ?? 'Unnamed device'}<div className="cell-sub">{humanize(r.platform)}{r.biometric_enabled ? ' · biometrics on' : ''}</div></> }, { key: 'l', header: 'Last seen', cell: (r) => dateTime(r.last_seen_at) }, { key: 's', header: 'Status', cell: (r) => <Status value={r.revoked_at ? 'disabled' : r.trusted ? 'active' : 'pending'} /> }]} />
        </Card>
      </div>
      {can('aml.read') && (
        <Card title="AML cases for this customer" flush>
          <DataTable<AmlCaseRow> caption="AML cases for this customer" rows={cases.data?.data} rowKey={(r) => r.id} loading={cases.isLoading} error={cases.error}
            empty={<p className="muted" style={{ padding: 20 }}>No AML cases.</p>}
            columns={[{ key: 'n', header: 'Case', cell: (r) => <Link className="row-link" to={`/aml/cases/${r.id}`}>{r.case_no}</Link> }, { key: 't', header: 'Title', cell: (r) => r.title }, { key: 's', header: 'Status', cell: (r) => <Status value={r.status} /> }, { key: 'p', header: 'Priority', cell: (r) => <Status value={r.priority} /> }]} />
        </Card>
      )}
      <FreezeDialog kind={dlg === 'freeze' || dlg === 'unfreeze' ? dlg : null} userId={id} onClose={() => setDlg(null)} />
      <CaseDialog open={dlg === 'case'} userId={id} onClose={() => setDlg(null)} onOpened={(caseId) => nav(`/aml/cases/${caseId}`)} />
      <AddressDialog open={dlg === 'address'} userId={id} onClose={() => setDlg(null)} />
    </>
  )
}

function addressText(a: unknown): string {
  if (!a) return '—'
  if (typeof a === 'string') return a
  if (typeof a === 'object') { const parts = Object.values(a as Record<string, unknown>).filter((v) => typeof v === 'string' && v.trim()) as string[]; return parts.length ? parts.join(', ') : '—' }
  return '—'
}

const PAGE = 20
const REF_LABELS: Record<string, string> = { funding: 'Deposit', withdrawal: 'Withdrawal', withdrawal_reversal: 'Withdrawal reversed', savings_deposit: 'Moved to savings', savings_withdrawal: 'Savings withdrawal', savings_payout: 'Savings payout', investment_buy: 'Investment purchase', investment_refund: 'Investment refund', investment_sell: 'Investment sale', investment_payout: 'Investment payout', dividend: 'Dividend', fx_out: 'Currency exchange (out)', fx_in: 'Currency exchange (in)', reward: 'Reward' }

function Transactions({ userId }: { userId: string }) {
  const [page, setPage] = useState(0); const [cur, setCur] = useState('')
  const res = useQuery({ queryKey: ['customer', userId, 'tx', cur, page], queryFn: () => api.get<{ data: CustomerTransaction[] }>(`/v1/admin/users/${userId}/transactions`, { currency: cur, limit: PAGE, offset: page * PAGE }), placeholderData: (p) => p })
  const rows = res.data?.data.slice(0, PAGE)
  return (
    <Card title="Transaction history" actions={<SelectField label="Currency" value={cur} onChange={(e) => { setPage(0); setCur(e.target.value) }}><option value="">All</option><option value="NGN">NGN</option><option value="USD">USD</option></SelectField>} flush>
      <DataTable<CustomerTransaction> caption="Transaction history" rows={rows} rowKey={(r) => String(r.id)} loading={res.isLoading} error={res.error} onRetry={() => void res.refetch()}
        empty={<p className="muted" style={{ padding: 20 }}>No transactions yet.</p>}
        columns={[
          { key: 'w', header: 'When', cell: (r) => dateTime(r.created_at) },
          { key: 't', header: 'Type', cell: (r) => <>{REF_LABELS[r.ref_type] ?? humanize(r.ref_type)}{r.reference && <div className="cell-sub mono">{r.reference}</div>}</> },
          { key: 'a', header: 'Amount', align: 'right', cell: (r) => <span className="num" style={{ fontWeight: 600, color: r.direction === 'credit' ? 'var(--success-text)' : undefined }}>{r.direction === 'credit' ? '+' : '−'}{money(r.amount, r.currency)}</span> },
          { key: 'b', header: 'Balance after', align: 'right', cell: (r) => <span className="num">{money(r.balance_after, r.currency)}</span> },
        ]} />
      <Pager page={page} pageSize={PAGE} hasMore={(res.data?.data.length ?? 0) > PAGE} onPage={setPage} shown={rows?.length ?? 0} />
    </Card>
  )
}

function FreezeDialog({ kind, userId, onClose }: { kind: 'freeze' | 'unfreeze' | null; userId: string; onClose: () => void }) {
  const gate = useGated(); const [text, setText] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    const ok = await gate(() => api.post(`/v1/admin/users/${userId}/${kind}`, kind === 'freeze' ? { reason: text.trim() } : text.trim() ? { note: text.trim() } : {}))
    setBusy(false); if (ok) { setText(''); onClose() }
  }
  return (
    <Dialog open={kind !== null} title={kind === 'freeze' ? 'Request freezing this account' : 'Request unfreezing this account'} onClose={onClose}
      description="A second person has to approve this before anything changes."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={kind === 'freeze' ? 'danger' : 'primary'} loading={busy} disabled={kind === 'freeze' && text.trim().length < 3} onClick={() => void submit()}>Send for approval</Button></>}>
      <TextAreaField label={kind === 'freeze' ? 'Reason (shown to the approver and kept in the audit log)' : 'Note (optional)'} value={text} onChange={(e) => setText(e.target.value)} />
    </Dialog>
  )
}

function CaseDialog({ open, userId, onClose, onOpened }: { open: boolean; userId: string; onClose: () => void; onOpened: (id: string) => void }) {
  const toast = useToast(); const [title, setTitle] = useState(''); const [priority, setPriority] = useState('medium'); const [summary, setSummary] = useState('')
  const m = useMutation({ mutationFn: () => api.post<{ id: string }>('/v1/admin/aml/cases', { title: title.trim(), priority, summary: summary.trim() || undefined, user_id: userId }), onSuccess: (r) => { toast('Case opened.', 'success'); onOpened(r.id) }, onError: (e) => toast(errorMessage(e), 'danger') })
  return (
    <Dialog open={open} title="Open an AML case" description="The customer is not told. Everything you do on the case is recorded." onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={title.trim().length < 3} onClick={() => m.mutate()}>Open case</Button></>}>
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low (14 days)</option><option value="medium">Medium (7 days)</option><option value="high">High (72 hours)</option><option value="critical">Critical (24 hours)</option></SelectField>
      <TextAreaField label="What prompted this? (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} />
    </Dialog>
  )
}

function AddressDialog({ open, userId, onClose }: { open: boolean; userId: string; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient(); const [note, setNote] = useState('')
  const m = useMutation({
    mutationFn: (approve: boolean) => api.post(`/v1/admin/kyc/${userId}/address-review`, { approve, note: note.trim() || undefined }),
    onSuccess: (_, approve) => { toast(approve ? 'Proof of address approved.' : 'Proof of address rejected.', 'success'); void qc.invalidateQueries({ queryKey: ['customer', userId] }); onClose() },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  return (
    <Dialog open={open} title="Proof of address" description="Check the document the customer uploaded, then approve or reject it. Approving can raise the customer to Tier 3." onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={m.isPending} onClick={() => m.mutate(false)}><Ban size={16} aria-hidden /> Reject</Button><Button loading={m.isPending} onClick={() => m.mutate(true)}>Approve</Button></>}>
      <TextAreaField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} hint="Shown to the customer if you reject." />
    </Dialog>
  )
}
