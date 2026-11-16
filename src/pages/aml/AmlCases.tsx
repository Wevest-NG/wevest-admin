import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { AmlCaseRow, Paged } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { dateOnly, relative } from '../../lib/format'
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, Status } from '../../ui/components'
import { CheckboxField, SelectField } from '../../ui/forms'
import { AmlNav } from './AmlNav'

export default function AmlCases() {
  const { staff } = useAuth()
  const [status, setStatus] = useState(''); const [priority, setPriority] = useState(''); const [overdue, setOverdue] = useState(false); const [mine, setMine] = useState(false)
  const q = useInfiniteQuery({
    queryKey: ['aml', 'cases', status, priority, overdue, mine], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<Paged<AmlCaseRow>>('/v1/admin/aml/cases', { status, priority, overdue: overdue || undefined, assigned_to: mine ? staff?.id : undefined, limit: 25, cursor: pageParam }),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  })
  const rows = q.data?.pages.flatMap((p) => p.data)
  return (
    <>
      <PageHeader title="Cases" subtitle="Investigations, newest first. Open one from the Alerts page or from a customer." />
      <AmlNav />
      <div className="filters">
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="open">Open</option><option value="under_review">Under review</option><option value="escalated">Escalated</option><option value="closed">Closed</option></SelectField>
        <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Any</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></SelectField>
        <CheckboxField label="Overdue only" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
        <CheckboxField label="Assigned to me" checked={mine} onChange={(e) => setMine(e.target.checked)} />
      </div>
      <Card flush>
        <DataTable<AmlCaseRow> caption="AML cases" rows={rows} rowKey={(r) => r.id} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={<EmptyState title="No cases match" />}
          columns={[
            { key: 'c', header: 'Case', cell: (r) => <><Link className="row-link" to={`/aml/cases/${r.id}`}>{r.case_no}</Link><div className="cell-sub">{r.title}</div></> },
            { key: 'who', header: 'Customer', cell: (r) => <>{r.subject_name || r.subject_email || '—'}</> },
            { key: 'p', header: 'Priority', cell: (r) => <Status value={r.priority} /> },
            { key: 's', header: 'Status', cell: (r) => <Status value={r.status} /> },
            { key: 'a', header: 'Assigned to', cell: (r) => r.assignee_name ?? <span className="muted">Unassigned</span> },
            { key: 'd', header: 'Review by', cell: (r) => r.status === 'closed' ? dateOnly(r.closed_at) : <>{dateOnly(r.review_due_at)} {r.overdue ? <Badge tone="danger">Overdue {relative(r.review_due_at)}</Badge> : null}</> },
            { key: 'n', header: 'Alerts / drafts', cell: (r) => `${r.alerts} / ${r.draft_reports}` },
          ]} />
        {q.hasNextPage && <div className="pager"><span /><Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
      </Card>
    </>
  )
}
