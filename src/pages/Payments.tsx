import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '../api/client'
import { Can } from '../auth/Can'
import { dateTime, money } from '../lib/format'
import { errorMessage, useGated } from '../lib/gated'
import { Banner, Button, Card, DataTable, EmptyState, ErrorState, Kpi, LoadingRows, PageHeader, Tabs } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { SelectField, TextAreaField, TextField } from '../ui/forms'
import { useToast } from '../ui/Toasts'

interface Intent { id: string; user_id: string; kind: string; provider: string; reference: string; amount: number; failure_reason?: string; created_at: string }
interface Recon { stuck_intents: Intent[]; review_intents: Intent[]; stuck_withdrawals: Intent[]; failing_webhooks: { provider: string; event_id: string; type: string; error: string | null; received_at: string }[]; ledger_drift: { wallet_id: string; user_id: string; balance: number; ledger: number }[]; books_problems: { check: string; currency: string; expected: number; actual: number }[] }
interface Providers { enabled: string[]; routing: { capability: string; provider: string; fallback: string | null }[] }
type Tab = 'attention' | 'providers'

export default function Payments() {
  const [tab, setTab] = useState<Tab>('attention')
  return (
    <>
      <PageHeader title="Payments" subtitle="Everything that needs a human: payments held in review, stuck payouts, failing webhooks, and which payment provider handles new money." actions={<Can perm="payments.reconcile"><Reconcile /></Can>} />
      <Tabs<Tab> label="Payments sections" value={tab} onChange={setTab} items={[{ value: 'attention', label: 'Needs attention' }, { value: 'providers', label: 'Providers & routing' }]} />
      {tab === 'attention' ? <Attention /> : <ProvidersPanel />}
    </>
  )
}

function Reconcile() {
  const toast = useToast(); const qc = useQueryClient()
  const m = useMutation({ mutationFn: () => api.post<{ intents: number; withdrawals: number }>('/v1/admin/payments/reconcile'), onSuccess: (r) => { toast(`Checked with the provider: ${r.intents} payment(s) and ${r.withdrawals} payout(s) updated.`, 'success'); void qc.invalidateQueries({ queryKey: ['recon'] }) }, onError: (e) => toast(errorMessage(e), 'danger') })
  return <Button variant="secondary" loading={m.isPending} onClick={() => m.mutate()}><RefreshCw size={16} aria-hidden /> Run reconciler</Button>
}

function Attention() {
  const q = useQuery({ queryKey: ['recon'], queryFn: () => api.get<Recon>('/v1/admin/reconciliation') })
  const [resolving, setResolving] = useState<Intent | null>(null)
  if (q.isLoading) return <LoadingRows />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const r = q.data
  const total = r.stuck_intents.length + r.review_intents.length + r.stuck_withdrawals.length + r.failing_webhooks.length + r.ledger_drift.length + r.books_problems.length
  const cols = (extra?: (i: Intent) => React.ReactNode) => [
    { key: 'ref', header: 'Reference', cell: (i: Intent) => <><span className="mono">{i.reference}</span><div className="cell-sub"><Link to={`/customers/${i.user_id}`}>Customer</Link> · {i.provider}</div></> },
    { key: 'amt', header: 'Amount', align: 'right' as const, cell: (i: Intent) => <span className="num">{money(i.amount)}</span> },
    { key: 'when', header: 'Created', cell: (i: Intent) => dateTime(i.created_at) },
    ...(extra ? [{ key: 'x', header: '', align: 'right' as const, cell: extra }] : []),
  ]
  return (
    <>
      {total === 0 && <Banner tone="success" title="Nothing needs attention">No stuck payments, no failing webhooks, and the books balance.</Banner>}
      <div className="grid cols-4">
        <Kpi label="In review" value={r.review_intents.length} tone={r.review_intents.length ? 'warning' : 'success'} hint="Short or odd payments" />
        <Kpi label="Stuck payments" value={r.stuck_intents.length} tone={r.stuck_intents.length ? 'warning' : 'success'} hint="Pending over an hour" />
        <Kpi label="Stuck payouts" value={r.stuck_withdrawals.length} tone={r.stuck_withdrawals.length ? 'warning' : 'success'} hint="Processing over an hour" />
        <Kpi label="Failing webhooks" value={r.failing_webhooks.length} tone={r.failing_webhooks.length ? 'danger' : 'success'} />
      </div>
      {r.books_problems.length > 0 && <Banner tone="danger" title="Book integrity checks failed">{r.books_problems.map((b) => `${b.check} (${b.currency}): expected ${b.expected}, got ${b.actual}`).join('; ')}. See Books.</Banner>}
      <Card title={`Payments held in review (${r.review_intents.length})`} flush>
        <DataTable<Intent> caption="Payments in review" rows={r.review_intents} rowKey={(i) => i.id} empty={<EmptyState title="No payments in review" />}
          columns={[...cols((i) => <Can perm="payments.resolve"><Button size="sm" onClick={() => setResolving(i)}>Resolve…</Button></Can>), { key: 'why', header: 'Why', cell: (i) => <span className="muted">{i.failure_reason}</span> }]} />
      </Card>
      <Card title={`Stuck payments (${r.stuck_intents.length})`} flush><DataTable<Intent> caption="Stuck payments" rows={r.stuck_intents} rowKey={(i) => i.id} empty={<EmptyState title="None" />} columns={cols()} /></Card>
      <Card title={`Stuck payouts (${r.stuck_withdrawals.length})`} flush><DataTable<Intent> caption="Stuck payouts" rows={r.stuck_withdrawals} rowKey={(i) => i.id} empty={<EmptyState title="None" />} columns={cols()} /></Card>
      <Card title={`Webhooks not processed (${r.failing_webhooks.length})`} flush>
        <DataTable caption="Failing webhooks" rows={r.failing_webhooks} rowKey={(w) => `${w.provider}${w.event_id}`} empty={<EmptyState title="None" />}
          columns={[{ key: 'p', header: 'Provider', cell: (w) => w.provider }, { key: 't', header: 'Type', cell: (w) => w.type }, { key: 'e', header: 'Error', cell: (w) => w.error ?? '—' }, { key: 'r', header: 'Received', cell: (w) => dateTime(w.received_at) }]} />
      </Card>
      {r.ledger_drift.length > 0 && <Card title={`Wallets whose balance differs from their ledger (${r.ledger_drift.length})`} flush>
        <DataTable caption="Ledger drift" rows={r.ledger_drift} rowKey={(d) => d.wallet_id} columns={[{ key: 'w', header: 'Wallet', cell: (d) => <Link to={`/customers/${d.user_id}`}>{d.wallet_id.slice(0, 8)}</Link> }, { key: 'b', header: 'Balance', align: 'right', cell: (d) => money(d.balance) }, { key: 'l', header: 'Ledger', align: 'right', cell: (d) => money(d.ledger) }]} /></Card>}
      <Resolve intent={resolving} onClose={() => setResolving(null)} />
    </>
  )
}

function Resolve({ intent, onClose }: { intent: Intent | null; onClose: () => void }) {
  const gate = useGated()
  const [action, setAction] = useState<'credit' | 'reject'>('credit'); const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    const body = { action, note: note.trim(), amount: action === 'credit' && amount ? Math.round(Number(amount) * 100) : undefined }
    const ok = await gate(() => api.post(`/v1/admin/payments/intents/${intent!.id}/resolve`, body))
    setBusy(false); if (ok) { setNote(''); setAmount(''); onClose() }
  }
  return (
    <Dialog open={!!intent} title="Resolve a held payment" description={intent ? `${intent.reference} · expected ${money(intent.amount)}. ${intent.failure_reason ?? ''}` : ''} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={note.trim().length < 3} onClick={() => void submit()}>Send for approval</Button></>}>
      <Banner tone="info">Crediting moves real money into the customer's wallet, so a second person has to approve it first.</Banner>
      <SelectField label="Decision" value={action} onChange={(e) => setAction(e.target.value as 'credit' | 'reject')}><option value="credit">Credit the customer</option><option value="reject">Reject (money stays in suspense until refunded)</option></SelectField>
      {action === 'credit' && <TextField label="Amount to credit (₦)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint="Leave empty to credit the full expected amount." />}
      <TextAreaField label="Reason" value={note} onChange={(e) => setNote(e.target.value)} hint="Shown to the approver and kept in the audit log." />
    </Dialog>
  )
}

function ProvidersPanel() {
  const q = useQuery({ queryKey: ['providers'], queryFn: () => api.get<Providers>('/v1/admin/payments/providers') })
  const gate = useGated()
  const [edit, setEdit] = useState<Providers['routing'][number] | null>(null)
  const [provider, setProvider] = useState(''); const [fallback, setFallback] = useState(''); const [busy, setBusy] = useState(false)
  if (q.isLoading) return <LoadingRows />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const open = (r: Providers['routing'][number]) => { setEdit(r); setProvider(r.provider); setFallback(r.fallback ?? '') }
  const submit = async () => {
    setBusy(true)
    const ok = await gate(() => api.put('/v1/admin/payments/routing', { capability: edit!.capability, provider, fallback: fallback || undefined }))
    setBusy(false); if (ok) setEdit(null)
  }
  return (
    <>
      <Banner tone="info">Switching a provider affects only new payments; ones already started stay with the provider that created them. A second person must approve every change.</Banner>
      <Card title="Enabled providers"><p>{q.data.enabled.length ? q.data.enabled.join(', ') : 'None'}</p></Card>
      <Card title="Routing" flush>
        <DataTable caption="Provider routing" rows={q.data.routing} rowKey={(r) => r.capability} empty={<EmptyState title="Using the default provider for everything" />}
          columns={[{ key: 'c', header: 'Capability', cell: (r) => <span className="cell-main">{r.capability}</span> }, { key: 'p', header: 'Provider', cell: (r) => r.provider }, { key: 'f', header: 'Fallback', cell: (r) => r.fallback ?? '—' }, { key: 'a', header: '', align: 'right', cell: (r) => <Can perm="payments.routing"><Button size="sm" variant="secondary" onClick={() => open(r)}>Change…</Button></Can> }]} />
      </Card>
      <Dialog open={!!edit} title={`Route “${edit?.capability}” payments`} onClose={() => setEdit(null)}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Send for approval</Button></>}>
        <SelectField label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>{q.data.enabled.map((p) => <option key={p}>{p}</option>)}</SelectField>
        <SelectField label="Fallback (new collections only)" value={fallback} onChange={(e) => setFallback(e.target.value)}><option value="">None</option>{q.data.enabled.map((p) => <option key={p}>{p}</option>)}</SelectField>
      </Dialog>
    </>
  )
}
