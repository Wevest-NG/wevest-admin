import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, ShieldAlert, CreditCard, Landmark, ScrollText } from 'lucide-react'
import { api } from '../api/client'
import type { AccountRow, AmlSummary, BookCheck } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Banner, Kpi, PageHeader } from '../ui/components'
import { integer, money } from '../lib/format'

interface Recon { stuck_intents: unknown[]; review_intents: unknown[]; stuck_withdrawals: unknown[]; failing_webhooks: unknown[]; ledger_drift: unknown[]; books_problems: unknown[] }
interface Books { ok: boolean; checks: BookCheck[]; accounts: AccountRow[] }
interface Verify { ok: boolean; entries: number; first_bad_seq: number | null; broken_anchors: number[] }

export default function Overview() {
  const { staff, can } = useAuth()
  const approvals = useQuery({ queryKey: ['approvals', 'summary'], queryFn: () => api.get<{ waiting_for_you: number; your_open_requests: number }>('/v1/admin/approvals/summary') })
  const aml = useQuery({ queryKey: ['aml', 'summary'], queryFn: () => api.get<AmlSummary>('/v1/admin/aml/summary'), enabled: can('aml.read') })
  const recon = useQuery({ queryKey: ['recon'], queryFn: () => api.get<Recon>('/v1/admin/reconciliation'), enabled: can('payments.read') })
  const books = useQuery({ queryKey: ['books'], queryFn: () => api.get<Books>('/v1/admin/books'), enabled: can('books.read') })
  const chain = useQuery({ queryKey: ['audit', 'verify'], queryFn: () => api.get<Verify>('/v1/admin/audit-log/verify'), enabled: can('audit.read') })

  const held = (cur: string) => books.data?.accounts.find((a) => a.account === 'customer_wallets' && a.currency === cur)?.balance ?? 0
  const reconTotal = recon.data ? recon.data.stuck_intents.length + recon.data.review_intents.length + recon.data.stuck_withdrawals.length + recon.data.failing_webhooks.length + recon.data.ledger_drift.length : 0
  const alerts: { tone: 'danger' | 'warning'; title: string; text: string }[] = []
  if (books.data && !books.data.ok) alerts.push({ tone: 'danger', title: 'The books do not balance', text: `${books.data.checks.filter((c) => !c.ok).length} integrity check(s) failed. Open Books.` })
  if (chain.data && !chain.data.ok) alerts.push({ tone: 'danger', title: 'The audit log failed verification', text: 'A record may have been altered or removed. Escalate immediately.' })
  if (aml.data && aml.data.overdue_reports > 0) alerts.push({ tone: 'danger', title: `${aml.data.overdue_reports} AML report(s) are past their filing deadline`, text: 'Open AML reports.' })

  return (
    <>
      <PageHeader title={`Welcome, ${staff?.name.split(' ')[0] ?? ''}`} subtitle={`Signed in as ${staff?.role.name}. Here is what needs attention.`} />
      {alerts.map((a) => <Banner key={a.title} tone={a.tone} title={a.title}>{a.text}</Banner>)}

      {can('books.read') && (
        <section className="hero" aria-label="Customer money held">
          <p className="muted">Customer money held</p>
          {books.isLoading ? <p style={{ fontSize: 40 }}>…</p> : (
            <p className="num" style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>{money(held('NGN'))}</p>
          )}
          <p className="muted num">{money(held('USD'), 'USD')} in USD wallets · {books.data?.ok === false ? 'integrity checks failing' : 'integrity checks passing'}</p>
        </section>
      )}

      <div className="grid cols-4">
        <Kpi label="Waiting for your approval" icon={<ClipboardCheck size={16} aria-hidden />} value={approvals.data ? integer(approvals.data.waiting_for_you) : '…'} hint={`${approvals.data?.your_open_requests ?? 0} of your own requests are open`} tone={approvals.data && approvals.data.waiting_for_you > 0 ? 'warning' : undefined} to="/approvals" />
        {aml.data && <>
          <Kpi label="Open AML alerts" icon={<ShieldAlert size={16} aria-hidden />} value={integer(aml.data.open_alerts)} hint={aml.data.open_alerts ? `oldest ${aml.data.oldest_open_alert_hours} h` : 'none open'} tone={aml.data.open_alerts ? 'warning' : 'success'} to="/aml/alerts" />
          <Kpi label="Overdue AML cases" icon={<ShieldAlert size={16} aria-hidden />} value={integer(aml.data.overdue_cases)} hint={`${aml.data.open_cases} open · ${aml.data.unassigned_cases} unassigned`} tone={aml.data.overdue_cases ? 'danger' : 'success'} to="/aml/cases" />
          <Kpi label="Draft reports" icon={<ShieldAlert size={16} aria-hidden />} value={integer(aml.data.draft_reports)} hint={`${aml.data.overdue_reports} overdue`} tone={aml.data.overdue_reports ? 'danger' : undefined} to="/aml/reports" />
        </>}
        {recon.data && <Kpi label="Payments needing a human" icon={<CreditCard size={16} aria-hidden />} value={integer(reconTotal)} hint={`${recon.data.review_intents.length} in review · ${recon.data.stuck_withdrawals.length} stuck payouts`} tone={reconTotal ? 'warning' : 'success'} to="/payments" />}
        {books.data && <Kpi label="Books" icon={<Landmark size={16} aria-hidden />} value={books.data.ok ? 'Balanced' : 'Out of balance'} hint={`${books.data.checks.length} checks run`} tone={books.data.ok ? 'success' : 'danger'} to="/books" />}
        {chain.data && <Kpi label="Audit log" icon={<ScrollText size={16} aria-hidden />} value={chain.data.ok ? 'Intact' : 'Broken'} hint={`${integer(chain.data.entries)} entries verified`} tone={chain.data.ok ? 'success' : 'danger'} to="/audit" />}
      </div>
    </>
  )
}
