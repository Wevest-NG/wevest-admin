import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Send } from 'lucide-react'
import { api } from '../../api/client'
import { Can } from '../../auth/Can'
import { useAuth } from '../../auth/AuthContext'
import { dateTime, humanize, money, relative } from '../../lib/format'
import { errorMessage } from '../../lib/gated'
import { Banner, Button, Card, DataTable, ErrorState, KeyValue, LoadingRows, PageHeader, Status } from '../../ui/components'
import { Dialog } from '../../ui/Dialog'
import { TextAreaField, TextField } from '../../ui/forms'
import { useToast } from '../../ui/Toasts'
import { AmlNav } from './AmlNav'

interface Report {
  id: string; case_id: string; case_no: string; kind: 'str' | 'ctr'; status: 'draft' | 'filed' | 'discarded'; narrative: string; suspected_at: string; due_at: string; amount_total: number; currency: string | null
  transactions: { id: number; type: string; direction: string; amount: number; currency: string; at: string }[]; prepared_by: string; prepared_by_name: string | null; prepared_at: string; filed_by_name: string | null; filed_at: string | null; regulator_ref: string | null; filed_late: boolean | null
  subject_name: string | null; subject_email: string | null; bvn_last4: string | null; overdue: boolean
}

export default function AmlReportDetail() {
  const { id = '' } = useParams()
  const { staff } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const q = useQuery({ queryKey: ['aml', 'report', id], queryFn: () => api.get<Report>(`/v1/admin/aml/reports/${id}`) })
  const [dlg, setDlg] = useState<'edit' | 'discard' | 'file' | null>(null)
  const [text, setText] = useState(''); const [ref, setRef] = useState('')
  const refresh = () => { setDlg(null); void qc.invalidateQueries({ queryKey: ['aml'] }) }
  const edit = useMutation({ mutationFn: () => api.patch(`/v1/admin/aml/reports/${id}`, { narrative: text.trim() }), onSuccess: () => { toast('Draft updated.', 'success'); refresh() }, onError: (e) => toast(errorMessage(e), 'danger') })
  const discard = useMutation({ mutationFn: () => api.post(`/v1/admin/aml/reports/${id}/discard`, { reason: text.trim() }), onSuccess: () => { toast('Draft discarded.', 'success'); refresh() }, onError: (e) => toast(errorMessage(e), 'danger') })
  const file = useMutation({ mutationFn: () => api.post(`/v1/admin/aml/reports/${id}/file`, { regulator_ref: ref.trim() }), onSuccess: () => { toast('Recorded as filed. It can no longer be changed.', 'success'); refresh() }, onError: (e) => toast(errorMessage(e), 'danger') })
  const exp = useMutation({
    mutationFn: () => api.get<unknown>(`/v1/admin/aml/reports/${id}/export`),
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a'); a.href = url; a.download = `aml-report-${id.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(url)
      toast('Exported. Exporting is recorded in the audit log.', 'success')
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })

  if (q.isLoading) return <LoadingRows />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const r = q.data
  const mine = r.prepared_by === staff?.id

  return (
    <>
      <PageHeader title={`${r.kind === 'str' ? 'Suspicious transaction report' : 'Currency transaction report'}`} subtitle={<><Link to={`/aml/cases/${r.case_id}`}>{r.case_no}</Link> · <Link to="/aml/reports">All reports</Link></>}
        actions={<>
          <Button variant="secondary" loading={exp.isPending} onClick={() => exp.mutate()}><Download size={16} aria-hidden /> Export JSON</Button>
          {r.status === 'draft' && <>
            <Can perm="aml.report"><Button variant="secondary" onClick={() => { setText(r.narrative); setDlg('edit') }}>Edit narrative</Button><Button variant="secondary" onClick={() => { setText(''); setDlg('discard') }}>Discard</Button></Can>
            <Can perm="aml.file"><Button disabled={mine} onClick={() => { setRef(''); setDlg('file') }} title={mine ? 'A different person has to file a report you prepared' : undefined}><Send size={16} aria-hidden /> Record filing…</Button></Can>
          </>}
        </>} />
      <AmlNav />
      {r.status === 'draft' && r.overdue && <Banner tone="danger" title="Past the filing deadline">It was due {relative(r.due_at)}. File it now; it will be marked late.</Banner>}
      {r.status === 'draft' && mine && <Banner tone="info">You prepared this report, so someone else has to record the filing.</Banner>}
      {r.status === 'filed' && <Banner tone={r.filed_late ? 'warning' : 'success'} title={`Filed ${dateTime(r.filed_at)}${r.filed_late ? ' (late)' : ''}`}>Regulator reference <strong>{r.regulator_ref}</strong>. This record can no longer be changed.</Banner>}
      <div className="grid cols-2">
        <Card title="Report"><KeyValue items={[['Status', <Status key="s" value={r.status} />], ['Suspicion formed', dateTime(r.suspected_at)], ['File by', `${dateTime(r.due_at)} (${relative(r.due_at)})`], ['Prepared by', `${r.prepared_by_name ?? '—'} · ${dateTime(r.prepared_at)}`], ['Filed by', r.filed_by_name ?? '—'], ['Total amount', r.amount_total ? money(r.amount_total, r.currency ?? 'NGN') : '—']]} /></Card>
        <Card title="Subject"><KeyValue items={[['Name', r.subject_name || '—'], ['Email', r.subject_email], ['BVN', r.bvn_last4 ? `••••${r.bvn_last4}` : '—']]} /></Card>
      </div>
      <Card title="Narrative"><p style={{ whiteSpace: 'pre-wrap' }}>{r.narrative}</p></Card>
      <Card title={`Transactions (${r.transactions.length})`} flush>
        <DataTable caption="Transactions in this report" rows={r.transactions} rowKey={(t) => String(t.id)} empty={<p className="muted" style={{ padding: 20 }}>No transactions attached.</p>}
          columns={[{ key: 'w', header: 'When', cell: (t) => dateTime(t.at) }, { key: 't', header: 'Type', cell: (t) => humanize(t.type) }, { key: 'a', header: 'Amount', align: 'right', cell: (t) => <span className={`num ${t.direction === 'credit' ? 'positive' : 'negative'}`}>{t.direction === 'credit' ? '+' : '−'}{money(t.amount, t.currency)}</span> }]} />
      </Card>

      <Dialog open={dlg === 'edit'} wide title="Edit narrative" onClose={() => setDlg(null)} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={edit.isPending} disabled={text.trim().length < 50} onClick={() => edit.mutate()}>Save draft</Button></>}>
        <TextAreaField label="Narrative" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 200 }} hint="At least 50 characters." />
      </Dialog>
      <Dialog open={dlg === 'discard'} title="Discard this draft" description="Kept for the record, but it can never be filed." onClose={() => setDlg(null)} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button variant="danger" loading={discard.isPending} disabled={text.trim().length < 3} onClick={() => discard.mutate()}>Discard draft</Button></>}>
        <TextAreaField label="Why?" value={text} onChange={(e) => setText(e.target.value)} />
      </Dialog>
      <Dialog open={dlg === 'file'} title="Record that this was filed" description="Submit the report in the regulator's portal first, then enter the acknowledgement reference it gave you. After this, the report is frozen." onClose={() => setDlg(null)}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={file.isPending} disabled={ref.trim().length < 3} onClick={() => file.mutate()}>Mark as filed</Button></>}>
        <TextField label="Regulator reference" value={ref} onChange={(e) => setRef(e.target.value)} />
      </Dialog>
    </>
  )
}
