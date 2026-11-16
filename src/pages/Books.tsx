import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '../api/client'
import type { AccountRow, BookCheck } from '../api/types'
import { Can } from '../auth/Can'
import { humanize, lagosToday, money, dateTime } from '../lib/format'
import { errorMessage } from '../lib/gated'
import { Banner, Button, Card, DataTable, EmptyState, ErrorState, LoadingRows, PageHeader, Status, Tabs } from '../ui/components'
import { SelectField } from '../ui/forms'
import { DateField } from '../ui/DatePicker'
import { useToast } from '../ui/Toasts'

type Tab = 'health' | 'trial' | 'statement' | 'export'
interface Books { ok: boolean; checks: BookCheck[]; accounts: AccountRow[] }
interface Trial { as_of: string; balanced: boolean; totals: { currency: string; debits: number; credits: number; balanced: boolean }[]; accounts: AccountRow[] }
interface Statement { account: string; currency: string; kind: string; opening_balance: number; closing_balance: number; truncated: boolean; lines: { line_id: number; journal_id: number; posted_at: string; ref_type: string; ref_id: string; debit: number; credit: number; balance: number }[] }

const acctCols = (cur?: string) => [
  { key: 'a', header: 'Account', cell: (r: AccountRow) => <><span className="cell-main">{humanize(r.account.replace('psp_cash:', 'PSP cash · '))}</span><div className="cell-sub">{r.kind}</div></> },
  { key: 'c', header: 'Currency', cell: (r: AccountRow) => r.currency },
  { key: 'd', header: 'Debits', align: 'right' as const, cell: (r: AccountRow) => <span className="num">{money(r.debits, cur ?? r.currency)}</span> },
  { key: 'k', header: 'Credits', align: 'right' as const, cell: (r: AccountRow) => <span className="num">{money(r.credits, cur ?? r.currency)}</span> },
  { key: 'b', header: 'Balance', align: 'right' as const, cell: (r: AccountRow) => <strong className="num">{money(r.balance, r.currency)}</strong> },
]

export default function BooksPage() {
  const [tab, setTab] = useState<Tab>('health')
  return (
    <>
      <PageHeader title="Books" subtitle="The company's double-entry ledger. Every movement of customer money is a balanced journal; these checks prove the books agree with wallets, savings and in-flight payouts." />
      <Tabs<Tab> label="Books sections" value={tab} onChange={setTab} items={[{ value: 'health', label: 'Health' }, { value: 'trial', label: 'Trial balance' }, { value: 'statement', label: 'Account statement' }, { value: 'export', label: 'Export' }]} />
      {tab === 'health' && <Health />}
      {tab === 'trial' && <TrialBalance />}
      {tab === 'statement' && <StatementView />}
      {tab === 'export' && <Can perm="books.export" fallback={<Banner tone="info">Your role cannot export the books.</Banner>}><Export /></Can>}
    </>
  )
}

function Health() {
  const q = useQuery({ queryKey: ['books'], queryFn: () => api.get<Books>('/v1/admin/books') })
  if (q.isLoading) return <LoadingRows />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  return (
    <>
      {q.data.ok ? <Banner tone="success" title="All checks pass">Wallets, savings pool and in-flight payouts agree with the ledger.</Banner> : <Banner tone="danger" title="Some checks fail">Do not release funds until Finance has found out why.</Banner>}
      <Card title="Integrity checks" flush>
        <DataTable<BookCheck> caption="Integrity checks" rows={q.data.checks} rowKey={(c) => `${c.check}${c.currency}`}
          columns={[{ key: 'n', header: 'Check', cell: (c) => humanize(c.check) }, { key: 'c', header: 'Currency', cell: (c) => c.currency }, { key: 'e', header: 'Should be', align: 'right', cell: (c) => <span className="num">{c.expected}</span> },
            { key: 'a', header: 'Is', align: 'right', cell: (c) => <span className="num">{c.actual}</span> }, { key: 's', header: 'Result', cell: (c) => <Status value={c.ok ? 'ok' : 'failed'} /> }]} />
      </Card>
      <Card title="Accounts" flush><DataTable<AccountRow> caption="Accounts" rows={q.data.accounts} rowKey={(r) => r.account + r.currency} columns={acctCols()} empty={<EmptyState title="No activity yet" />} /></Card>
      <p className="muted">PSP cash can only be checked against each provider's own balance or settlement report. Compare it there.</p>
    </>
  )
}

function TrialBalance() {
  const [asOf, setAsOf] = useState(lagosToday())
  const q = useQuery({ queryKey: ['trial', asOf], queryFn: () => api.get<Trial>('/v1/admin/books/trial-balance', { as_of: asOf }) })
  return (
    <>
      <div className="filters"><DateField label="As at the end of" value={asOf} max={lagosToday()} onChange={(e) => setAsOf(e.target.value)} hint="Lagos calendar day" /></div>
      {q.isLoading ? <LoadingRows /> : q.error || !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <>
          {q.data.balanced ? <Banner tone="success">Debits equal credits in every currency.</Banner> : <Banner tone="danger" title="Debits do not equal credits">Escalate to Finance now.</Banner>}
          <Card title={`Trial balance at ${q.data.as_of}`} flush>
            <DataTable<AccountRow> caption="Trial balance" rows={q.data.accounts} rowKey={(r) => r.account + r.currency} columns={acctCols()} empty={<EmptyState title="Nothing was booked by this date" />} />
          </Card>
          <div className="row">{q.data.totals.map((t) => <span key={t.currency} className="badge" data-tone={t.balanced ? 'success' : 'danger'}>{t.currency}: debits {money(t.debits, t.currency)} · credits {money(t.credits, t.currency)}</span>)}</div>
        </>
      )}
    </>
  )
}

function StatementView() {
  const accounts = useQuery({ queryKey: ['books'], queryFn: () => api.get<Books>('/v1/admin/books') })
  const [sel, setSel] = useState(''); const [from, setFrom] = useState(lagosToday()); const [to, setTo] = useState(lagosToday()); const [go, setGo] = useState<{ code: string; cur: string; from: string; to: string } | null>(null)
  const opts = accounts.data?.accounts ?? []
  const st = useQuery({ queryKey: ['statement', go], enabled: !!go, queryFn: () => api.get<Statement>(`/v1/admin/books/accounts/${encodeURIComponent(go!.code)}/statement`, { currency: go!.cur, from: go!.from, to: go!.to, limit: 1000 }) })
  const submit = (e: FormEvent) => { e.preventDefault(); const [code, cur] = sel.split('|'); if (code && cur) setGo({ code, cur, from, to }) }
  return (
    <>
      <form className="filters" onSubmit={submit}>
        <SelectField label="Account" value={sel} onChange={(e) => setSel(e.target.value)} required fieldClassName="grow"><option value="">Choose an account…</option>{opts.map((a) => <option key={a.account + a.currency} value={`${a.account}|${a.currency}`}>{a.account} ({a.currency})</option>)}</SelectField>
        <DateField label="From" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
        <DateField label="To" value={to} onChange={(e) => setTo(e.target.value)} min={from} />
        <Button type="submit" disabled={!sel}>Show statement</Button>
      </form>
      {st.isLoading && <LoadingRows />}
      {st.error && <ErrorState error={st.error} />}
      {st.data && (
        <Card title={`${st.data.account} · ${st.data.currency}`} flush>
          <div className="row between" style={{ padding: '12px 20px' }}><span>Opening balance <strong className="num">{money(st.data.opening_balance, st.data.currency)}</strong></span><span>Closing balance <strong className="num">{money(st.data.closing_balance, st.data.currency)}</strong></span></div>
          {st.data.truncated && <Banner tone="warning">Only the first 1,000 lines are shown. Narrow the dates, or export the journal.</Banner>}
          <DataTable caption="Statement lines" rows={st.data.lines} rowKey={(l) => String(l.line_id)} empty={<EmptyState title="No movements in this period" />}
            columns={[{ key: 'w', header: 'Posted', cell: (l) => dateTime(l.posted_at) }, { key: 't', header: 'Type', cell: (l) => <><span>{humanize(l.ref_type)}</span><div className="cell-sub mono">{l.ref_id.slice(0, 8)}</div></> },
              { key: 'd', header: 'Debit', align: 'right', cell: (l) => (l.debit ? <span className="num">{money(l.debit, st.data!.currency)}</span> : '') }, { key: 'c', header: 'Credit', align: 'right', cell: (l) => (l.credit ? <span className="num">{money(l.credit, st.data!.currency)}</span> : '') },
              { key: 'b', header: 'Balance', align: 'right', cell: (l) => <strong className="num">{money(l.balance, st.data!.currency)}</strong> }]} />
        </Card>
      )}
    </>
  )
}

function Export() {
  const toast = useToast(); const [from, setFrom] = useState(lagosToday()); const [to, setTo] = useState(lagosToday())
  const m = useMutation({ mutationFn: () => api.post<{ download_url: string }>('/v1/admin/books/export', { from, to }), onSuccess: (r) => { toast('Export ready. It is recorded in the audit log.', 'success'); window.open(r.download_url, '_blank', 'noopener') }, onError: (e) => toast(errorMessage(e), 'danger') })
  return (
    <Card title="General journal (CSV)">
      <div className="stack">
        <p className="muted">One row per journal line, with amounts in decimal units, ready for your accountants or auditors. Up to one year at a time. Exporting is itself recorded.</p>
        <div className="filters"><DateField label="From" value={from} onChange={(e) => setFrom(e.target.value)} max={to} /><DateField label="To" value={to} onChange={(e) => setTo(e.target.value)} min={from} /><Button loading={m.isPending} onClick={() => m.mutate()}><Download size={16} aria-hidden /> Export CSV</Button></div>
      </div>
    </Card>
  )
}
