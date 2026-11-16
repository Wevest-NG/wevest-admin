import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { AmlReportRow } from '../../api/types'
import { dateTime, money, relative } from '../../lib/format'
import { Badge, Card, DataTable, EmptyState, PageHeader, Status } from '../../ui/components'
import { CheckboxField, SelectField } from '../../ui/forms'
import { AmlNav } from './AmlNav'

export default function AmlReports() {
  const [status, setStatus] = useState(''); const [kind, setKind] = useState(''); const [overdue, setOverdue] = useState(false)
  const q = useQuery({ queryKey: ['aml', 'reports', status, kind, overdue], queryFn: () => api.get<{ data: AmlReportRow[] }>('/v1/admin/aml/reports', { status, kind, overdue: overdue || undefined, limit: 100 }) })
  return (
    <>
      <PageHeader title="Reports" subtitle="Suspicious and currency transaction reports, by filing deadline. A report is drafted by one person and filed by another." />
      <AmlNav />
      <div className="filters">
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="draft">Draft</option><option value="filed">Filed</option><option value="discarded">Discarded</option></SelectField>
        <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Any</option><option value="str">Suspicious (STR)</option><option value="ctr">Currency (CTR)</option></SelectField>
        <CheckboxField label="Overdue only" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
      </div>
      <Card flush>
        <DataTable<AmlReportRow> caption="AML reports" rows={q.data?.data} rowKey={(r) => r.id} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={<EmptyState title="No reports" />}
          columns={[
            { key: 'k', header: 'Report', cell: (r) => <><Link className="row-link" to={`/aml/reports/${r.id}`}>{r.kind.toUpperCase()} · {r.case_no}</Link><div className="cell-sub">Prepared by {r.prepared_by_name ?? '—'}</div></> },
            { key: 's', header: 'Status', cell: (r) => <Status value={r.status} /> },
            { key: 'a', header: 'Amount', align: 'right', cell: (r) => r.amount_total ? <span className="num">{money(r.amount_total, r.currency ?? 'NGN')}</span> : '—' },
            { key: 'd', header: 'Deadline', cell: (r) => r.status === 'draft' ? <>{dateTime(r.due_at)} {r.overdue ? <Badge tone="danger">Overdue {relative(r.due_at)}</Badge> : <span className="cell-sub">{relative(r.due_at)}</span>}</> : dateTime(r.due_at) },
            { key: 'f', header: 'Filed', cell: (r) => r.filed_at ? <>{dateTime(r.filed_at)} {r.filed_late && <Badge tone="warning">Late</Badge>}<div className="cell-sub">{r.regulator_ref} · {r.filed_by_name}</div></> : '—' },
          ]} />
      </Card>
    </>
  )
}
