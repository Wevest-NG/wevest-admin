import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, MessageSquarePlus, UserPlus } from 'lucide-react'
import { api } from '../../api/client'
import { Can } from '../../auth/Can'
import { dateTime, humanize, money, relative } from '../../lib/format'
import { errorMessage } from '../../lib/gated'
import { Badge, Banner, Button, Card, DataTable, ErrorState, KeyValue, LoadingRows, PageHeader, Status } from '../../ui/components'
import { Dialog } from '../../ui/Dialog'
import { SelectField, TextAreaField } from '../../ui/forms'
import { DateTimeField } from '../../ui/DatePicker'
import { useToast } from '../../ui/Toasts'
import { AmlNav } from './AmlNav'

interface Tx { id: number; ref_type: string; direction: string; amount: number; currency: string; created_at: string }
interface CaseFile {
  case: { id: string; case_no: string; title: string; summary: string; priority: string; status: string; user_id: string | null; assigned_to: string | null; assignee_name: string | null; opener_name: string | null; opened_at: string; review_due_at: string; overdue: boolean; outcome: string | null; outcome_note: string | null; closed_at: string | null }
  subject: { user: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; tier: number; status: string; bvn_last4: string | null; bvn_verified: boolean }; wallets: { currency: string; balance: number }[]; last_30_days: { in_30d: number; out_30d: number; entries_30d: number }; recent_transactions: Tx[] } | null
  alerts: { id: string; rule: string; status: string; created_at: string }[]
  reports: { id: string; kind: string; status: string; due_at: string; filed_at: string | null; regulator_ref: string | null }[]
  events: { id: number; kind: string; body: string; created_at: string; author_name: string | null }[]
}
type Dlg = 'assign' | 'note' | 'report' | 'close' | 'status' | null
const OUTCOMES = [['false_positive', 'False positive'], ['no_action', 'No action needed'], ['monitor', 'Keep monitoring'], ['str_filed', 'Suspicious transaction report filed'], ['account_restricted', 'Account restricted'], ['relationship_exited', 'Relationship exited']] as const

export default function AmlCaseDetail() {
  const { id = '' } = useParams()
  const toast = useToast(); const qc = useQueryClient()
  const q = useQuery({ queryKey: ['aml', 'case', id], queryFn: () => api.get<CaseFile>(`/v1/admin/aml/cases/${id}`) })
  const assignees = useQuery({ queryKey: ['aml', 'assignees'], queryFn: () => api.get<{ data: { id: string; name: string }[] }>('/v1/admin/aml/assignees'), retry: false })
  const [dlg, setDlg] = useState<Dlg>(null)
  const [staffId, setStaffId] = useState(''); const [text, setText] = useState(''); const [status, setStatus] = useState('under_review'); const [outcome, setOutcome] = useState('false_positive')
  const [kind, setKind] = useState('str'); const [narrative, setNarrative] = useState(''); const [suspected, setSuspected] = useState(''); const [txs, setTxs] = useState<Set<number>>(new Set())

  const done = (msg: string) => { toast(msg, 'success'); setDlg(null); setText(''); setNarrative(''); setTxs(new Set()); void qc.invalidateQueries({ queryKey: ['aml'] }) }
  const run = useMutation({
    mutationFn: async (what: Exclude<Dlg, null>) => {
      if (what === 'assign') return api.post(`/v1/admin/aml/cases/${id}/assign`, { staff_id: staffId || null })
      if (what === 'note') return api.post(`/v1/admin/aml/cases/${id}/notes`, { body: text.trim() })
      if (what === 'status') return api.post(`/v1/admin/aml/cases/${id}/status`, { status })
      if (what === 'close') return api.post(`/v1/admin/aml/cases/${id}/close`, { outcome, note: text.trim() })
      return api.post(`/v1/admin/aml/cases/${id}/reports`, { kind, narrative: narrative.trim(), suspected_at: suspected ? new Date(suspected).toISOString() : undefined, transaction_ids: txs.size ? [...txs] : undefined })
    },
    onSuccess: (_, what) => done({ assign: 'Assignment saved.', note: 'Note added.', status: 'Status updated.', close: 'Case closed.', report: 'Draft report created.' }[what]),
    onError: (e) => toast(errorMessage(e), 'danger'),
  })

  if (q.isLoading) return <LoadingRows />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const { case: c, subject, alerts, reports, events } = q.data
  const closed = c.status === 'closed'
  const label = (s: string) => ({ opened: 'Opened', note: 'Note', assigned: 'Assignment', status: 'Status', alert_linked: 'Alert linked', report_drafted: 'Report drafted', report_filed: 'Report filed', report_discarded: 'Report discarded', closed: 'Closed', screening: 'Screening' }[s] ?? humanize(s))

  return (
    <>
      <PageHeader title={`${c.case_no} · ${c.title}`} subtitle={<><Link to="/aml/cases">All cases</Link>{subject && <> · <Link to={`/customers/${subject.user.id}`}>Open customer</Link></>}</>}
        actions={!closed && <>
          <Can perm="aml.work"><Button variant="secondary" onClick={() => { setStaffId(c.assigned_to ?? ''); setDlg('assign') }}><UserPlus size={16} aria-hidden /> Assign</Button>
            <Button variant="secondary" onClick={() => setDlg('note')}><MessageSquarePlus size={16} aria-hidden /> Add note</Button>
            <Button variant="secondary" onClick={() => setDlg('status')}>Change status</Button></Can>
          <Can perm="aml.report"><Button variant="secondary" onClick={() => setDlg('report')}><FilePlus2 size={16} aria-hidden /> Draft report</Button></Can>
          <Can perm="aml.work"><Button onClick={() => setDlg('close')}>Close case</Button></Can>
        </>} />
      <AmlNav />
      {c.overdue && !closed && <Banner tone="danger" title="This case is overdue">It was due for review {relative(c.review_due_at)}.</Banner>}
      {closed && <Banner tone="info" title={`Closed: ${humanize(c.outcome)}`}>{c.outcome_note}</Banner>}
      <div className="grid cols-2">
        <Card title="Case"><KeyValue items={[['Status', <Status key="s" value={c.status} />], ['Priority', <Status key="p" value={c.priority} />], ['Assigned to', c.assignee_name ?? 'Nobody yet'], ['Opened', `${dateTime(c.opened_at)} by ${c.opener_name ?? '—'}`], ['Review by', dateTime(c.review_due_at)], ['Summary', c.summary || '—']]} /></Card>
        <Card title="Customer">{!subject ? <p className="muted">This case is not about a specific customer.</p> : <KeyValue items={[
          ['Name', `${subject.user.first_name ?? ''} ${subject.user.last_name ?? ''}`.trim() || '—'], ['Email', subject.user.email], ['Tier', `Tier ${subject.user.tier}`], ['Account', <Status key="a" value={subject.user.status} />],
          ['BVN', subject.user.bvn_last4 ? `••••${subject.user.bvn_last4} ${subject.user.bvn_verified ? '(verified)' : ''}` : '—'],
          ['Balances', subject.wallets.map((w) => money(w.balance, w.currency)).join(' · ') || '—'],
          ['Last 30 days', `${money(subject.last_30_days.in_30d)} in · ${money(subject.last_30_days.out_30d)} out · ${subject.last_30_days.entries_30d} entries`]]} />}</Card>
      </div>
      <Card title={`Alerts (${alerts.length})`} flush><DataTable caption="Linked alerts" rows={alerts} rowKey={(a) => a.id} columns={[{ key: 'r', header: 'Rule', cell: (a) => humanize(a.rule) }, { key: 'w', header: 'Raised', cell: (a) => dateTime(a.created_at) }, { key: 's', header: 'Status', cell: (a) => <Status value={a.status} /> }]} empty={<p className="muted" style={{ padding: 20 }}>Opened without alerts.</p>} /></Card>
      <Card title={`Reports (${reports.length})`} flush><DataTable caption="Reports on this case" rows={reports} rowKey={(r) => r.id} empty={<p className="muted" style={{ padding: 20 }}>No reports drafted.</p>}
        columns={[{ key: 'k', header: 'Report', cell: (r) => <Link className="row-link" to={`/aml/reports/${r.id}`}>{r.kind.toUpperCase()}</Link> }, { key: 's', header: 'Status', cell: (r) => <Status value={r.status} /> }, { key: 'd', header: 'Due', cell: (r) => dateTime(r.due_at) }, { key: 'f', header: 'Regulator reference', cell: (r) => r.regulator_ref ?? '—' }]} /></Card>
      <Card title="Case file">
        <ol className="timeline">{events.map((e) => (
          <li key={e.id}><div><Badge tone="primary">{label(e.kind)}</Badge> <span className="meta">{e.author_name ?? 'System'} · {dateTime(e.created_at)}</span></div><p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{e.body}</p></li>
        ))}</ol>
      </Card>

      <Dialog open={dlg === 'assign'} title="Assign case" onClose={() => setDlg(null)} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={run.isPending} onClick={() => run.mutate('assign')}>Save</Button></>}>
        <SelectField label="Assign to" value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">Nobody</option>{assignees.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
      </Dialog>
      <Dialog open={dlg === 'note'} title="Add a note" description="Notes are part of the permanent case file. They cannot be edited or removed." onClose={() => setDlg(null)} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={run.isPending} disabled={text.trim().length < 2} onClick={() => run.mutate('note')}>Add note</Button></>}>
        <TextAreaField label="Note" value={text} onChange={(e) => setText(e.target.value)} />
      </Dialog>
      <Dialog open={dlg === 'status'} title="Change status" onClose={() => setDlg(null)} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={run.isPending} onClick={() => run.mutate('status')}>Save</Button></>}>
        <SelectField label="Move the case to" value={status} onChange={(e) => setStatus(e.target.value)}><option value="under_review">Under review</option><option value="escalated">Escalated</option></SelectField>
      </Dialog>
      <Dialog open={dlg === 'close'} title="Close the case" description="Draft reports must be filed or discarded first. Linked alerts close with the case." onClose={() => setDlg(null)} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={run.isPending} disabled={text.trim().length < 3} onClick={() => run.mutate('close')}>Close case</Button></>}>
        <SelectField label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
        <TextAreaField label="Conclusion" value={text} onChange={(e) => setText(e.target.value)} />
      </Dialog>
      <Dialog open={dlg === 'report'} wide title="Draft a report for the regulator" description={`The filing clock starts when suspicion formed. A different person files it.`} onClose={() => setDlg(null)}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={run.isPending} disabled={narrative.trim().length < 50} onClick={() => run.mutate('report')}>Create draft</Button></>}>
        <div className="form-grid">
          <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="str">Suspicious transaction report</option><option value="ctr">Currency transaction report</option></SelectField>
          <DateTimeField label="When did suspicion form?" value={suspected} onChange={(e) => setSuspected(e.target.value)} hint="Leave empty for now. The deadline counts from here." />
        </div>
        <TextAreaField label="Narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} hint={`${narrative.trim().length}/50 characters minimum. Who, what, when, why it is suspicious.`} style={{ minHeight: 160 }} />
        {subject && subject.recent_transactions.length > 0 && (
          <fieldset className="perm-group"><legend>Transactions the report refers to</legend>
            {subject.recent_transactions.map((t) => (
              <label key={t.id} className="perm-item"><input type="checkbox" checked={txs.has(t.id)} onChange={(e) => setTxs((s) => { const n = new Set(s); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n })} />
                <span>{humanize(t.ref_type)} · <span className={t.direction === 'credit' ? 'positive' : 'negative'}>{t.direction === 'credit' ? '+' : '−'}{money(t.amount, t.currency)}</span><span className="desc"> {dateTime(t.created_at)}</span></span></label>
            ))}
          </fieldset>
        )}
      </Dialog>
    </>
  )
}
