import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { AmlAlert, Paged } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { dateTime, humanize } from '../../lib/format'
import { errorMessage } from '../../lib/gated'
import { Button, Card, DataTable, EmptyState, PageHeader, Status } from '../../ui/components'
import { Dialog } from '../../ui/Dialog'
import { SelectField, TextAreaField, TextField } from '../../ui/forms'
import { useToast } from '../../ui/Toasts'
import { AmlNav } from './AmlNav'

type St = 'open' | 'in_case' | 'resolved' | 'escalated'

function detailText(a: AmlAlert): string {
  const d = a.details as Record<string, unknown>
  if (a.rule.endsWith('_match')) return `${d.matched_name ?? ''} on “${d.list ?? ''}” (match ${Math.round(Number(d.score ?? 0) * 100)}%${d.dob_match === true ? ', birth date matches' : ''})`
  return Object.entries(d).slice(0, 3).map(([k, v]) => `${humanize(k)}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')
}

export default function AmlAlerts() {
  const { can } = useAuth(); const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient()
  const [status, setStatus] = useState<St>('open'); const [rule, setRule] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [dlg, setDlg] = useState<'case' | AmlAlert | null>(null)
  const [title, setTitle] = useState(''); const [priority, setPriority] = useState('medium'); const [note, setNote] = useState(''); const [resolution, setResolution] = useState<'resolved' | 'escalated'>('resolved')

  const q = useInfiniteQuery({
    queryKey: ['aml', 'alerts', status, rule], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<Paged<AmlAlert>>('/v1/admin/aml/alerts', { status, rule, limit: 50, cursor: pageParam }),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  })
  const rows = q.data?.pages.flatMap((p) => p.data)
  const chosen = rows?.filter((r) => picked.has(r.id)) ?? []
  const sameCustomer = new Set(chosen.map((c) => c.user_id)).size <= 1

  const open = useMutation({
    mutationFn: () => api.post<{ id: string }>('/v1/admin/aml/cases', { title: title.trim(), priority, alert_ids: chosen.map((c) => c.id) }),
    onSuccess: (r) => { toast('Case opened.', 'success'); setPicked(new Set()); void qc.invalidateQueries({ queryKey: ['aml'] }); nav(`/aml/cases/${r.id}`) },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/v1/admin/aml/alerts/${id}/resolve`, { status: resolution, note: note.trim() }),
    onSuccess: () => { toast('Alert closed.', 'success'); setDlg(null); setNote(''); void qc.invalidateQueries({ queryKey: ['aml'] }) },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })

  return (
    <>
      <PageHeader title="Alerts" subtitle="From transaction monitoring and sanctions / PEP screening. Group the alerts of one customer into a case to investigate, or close a clear false positive." actions={can('aml.work') && <Button disabled={chosen.length === 0 || !sameCustomer} onClick={() => { setTitle(''); setDlg('case') }}>Open case from {chosen.length || ''} selected</Button>} />
      <AmlNav />
      <div className="filters">
        <SelectField label="Status" value={status} onChange={(e) => { setPicked(new Set()); setStatus(e.target.value as St) }}><option value="open">Open</option><option value="in_case">In a case</option><option value="resolved">Resolved</option><option value="escalated">Escalated</option></SelectField>
        <SelectField label="Rule" value={rule} onChange={(e) => setRule(e.target.value)}><option value="">All</option><option value="sanctions_match">Sanctions match</option><option value="pep_match">PEP match</option><option value="adverse_media_match">Adverse media</option><option value="large_inflow">Large inflow</option><option value="rapid_in_out">Rapid in and out</option><option value="structuring">Structuring</option></SelectField>
      </div>
      {!sameCustomer && <p role="alert" className="negative">A case is about one customer. Select alerts of the same customer.</p>}
      <Card flush>
        <DataTable<AmlAlert> caption="Alerts" rows={rows} rowKey={(r) => r.id} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={<EmptyState title="No alerts here" />}
          columns={[
            { key: 'sel', header: <span className="sr-only">Select</span>, cell: (r) => r.status === 'open' && can('aml.work') ? <input type="checkbox" aria-label={`Select alert ${humanize(r.rule)}`} checked={picked.has(r.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} /> : null },
            { key: 'rule', header: 'Alert', cell: (r) => <><span className="cell-main">{humanize(r.rule)}</span><div className="cell-sub">{detailText(r)}</div></> },
            { key: 'who', header: 'Customer', cell: (r) => r.user_id ? <Link to={`/customers/${r.user_id}`}>{r.email ?? 'Open customer'}</Link> : '—' },
            { key: 'when', header: 'Raised', cell: (r) => dateTime(r.created_at) },
            { key: 'st', header: 'Status', cell: (r) => <><Status value={r.status} />{r.case_id && <div className="cell-sub"><Link to={`/aml/cases/${r.case_id}`}>{r.case_no}</Link></div>}</> },
            { key: 'act', header: '', align: 'right', cell: (r) => r.status === 'open' && can('aml.work') ? <Button size="sm" variant="secondary" onClick={() => { setNote(''); setResolution('resolved'); setDlg(r) }}>Close…</Button> : null },
          ]} />
        {q.hasNextPage && <div className="pager"><span /><Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
      </Card>
      <Dialog open={dlg === 'case'} title="Open a case" description={`${chosen.length} alert(s) of the same customer go into one case. The customer is not told.`} onClose={() => setDlg(null)}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={open.isPending} disabled={title.trim().length < 3} onClick={() => open.mutate()}>Open case</Button></>}>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low (14 days)</option><option value="medium">Medium (7 days)</option><option value="high">High (72 hours)</option><option value="critical">Critical (24 hours)</option></SelectField>
      </Dialog>
      <Dialog open={dlg !== null && dlg !== 'case'} title="Close this alert" description="Without a case, you must say why. This stays on the record." onClose={() => setDlg(null)}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={resolve.isPending} disabled={note.trim().length < 3} onClick={() => dlg && dlg !== 'case' && resolve.mutate(dlg.id)}>Close alert</Button></>}>
        <SelectField label="Outcome" value={resolution} onChange={(e) => setResolution(e.target.value as 'resolved' | 'escalated')}><option value="resolved">False positive / explained</option><option value="escalated">Escalate</option></SelectField>
        <TextAreaField label="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </>
  )
}
