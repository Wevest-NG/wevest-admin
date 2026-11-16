import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X, Undo2 } from 'lucide-react'
import { api } from '../api/client'
import type { ApprovalItem, Paged } from '../api/types'
import { dateTime, relative } from '../lib/format'
import { errorMessage } from '../lib/gated'
import { Banner, Button, Card, DataTable, EmptyState, ErrorState, JsonBlock, KeyValue, LoadingRows, PageHeader, Status, Tabs } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { TextAreaField } from '../ui/forms'
import { useToast } from '../ui/Toasts'

type Tab = 'waiting' | 'mine' | 'pending' | 'history'

export default function Approvals() {
  const { id } = useParams()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('waiting')

  const list = useInfiniteQuery({
    queryKey: ['approvals', 'list', tab],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<Paged<ApprovalItem>>('/v1/admin/approvals', { status: tab === 'waiting' || tab === 'pending' ? 'pending' : undefined, mine: tab === 'mine' ? true : undefined, limit: 25, cursor: pageParam }),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  })
  let rows = list.data?.pages.flatMap((p) => p.data)
  if (rows && tab === 'waiting') rows = rows.filter((r) => r.can_decide)
  if (rows && tab === 'history') rows = rows.filter((r) => r.status !== 'pending')

  return (
    <>
      <PageHeader title="Approvals" subtitle="Sensitive actions need a second person. Nobody can approve their own request, and nothing runs until someone does." />
      <Tabs<Tab> label="Approval lists" value={tab} onChange={setTab} items={[{ value: 'waiting', label: 'Waiting for me' }, { value: 'mine', label: 'My requests' }, { value: 'pending', label: 'All pending' }, { value: 'history', label: 'History' }]} />
      <Card flush>
        <DataTable<ApprovalItem>
          caption={`Approvals: ${tab}`} rows={rows} rowKey={(r) => r.id} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()}
          empty={<EmptyState title={tab === 'waiting' ? 'Nothing is waiting for you' : 'No requests here'}>{tab === 'waiting' ? 'When someone asks for a change you can approve, it shows up here.' : undefined}</EmptyState>}
          columns={[
            { key: 'what', header: 'Request', cell: (r) => <><Link className="row-link" to={`/approvals/${r.id}`}>{r.label}</Link><div className="cell-sub">{r.summary}</div></> },
            { key: 'by', header: 'Requested by', cell: (r) => <><span>{r.requested_by.name}</span><div className="cell-sub">{relative(r.requested_at)}</div></> },
            { key: 'status', header: 'Status', cell: (r) => <Status value={r.status} /> },
            { key: 'exp', header: 'Lapses', cell: (r) => (r.status === 'pending' ? relative(r.expires_at) : '—') },
          ]}
        />
        {list.hasNextPage && <div className="pager"><span /><Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more</Button></div>}
      </Card>
      <Detail id={id} onClose={() => nav('/approvals')} />
    </>
  )
}

function Detail({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['approvals', 'one', id], queryFn: () => api.get<ApprovalItem>(`/v1/admin/approvals/${id}`), enabled: !!id })
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const decide = useMutation({
    mutationFn: ({ kind }: { kind: 'approve' | 'reject' | 'cancel' }) => api.post<ApprovalItem>(`/v1/admin/approvals/${id}/${kind}`, kind === 'cancel' ? {} : { note: note.trim() || undefined }),
    onSuccess: (r, v) => {
      toast(v.kind === 'approve' ? (r.status === 'executed' ? 'Approved and done.' : `Approved, but it could not be carried out: ${r.error ?? 'see details'}`) : v.kind === 'reject' ? 'Rejected.' : 'Request withdrawn.', r.status === 'failed' ? 'danger' : 'success')
      void qc.invalidateQueries()
      setRejecting(false); setNote('')
      if (v.kind !== 'approve') onClose()
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const a = q.data

  return (
    <Dialog open={!!id} wide title={a?.label ?? 'Approval request'} description={a?.summary} onClose={() => { setRejecting(false); setNote(''); onClose() }}
      footer={a && (a.can_decide || a.can_cancel) && (
        <>
          {a.can_cancel && <Button variant="secondary" loading={decide.isPending} onClick={() => decide.mutate({ kind: 'cancel' })}><Undo2 size={16} aria-hidden /> Withdraw request</Button>}
          {a.can_decide && !rejecting && <Button variant="secondary" onClick={() => setRejecting(true)}><X size={16} aria-hidden /> Reject…</Button>}
          {a.can_decide && rejecting && <Button variant="danger" loading={decide.isPending} disabled={note.trim().length < 3} onClick={() => decide.mutate({ kind: 'reject' })}>Confirm rejection</Button>}
          {a.can_decide && !rejecting && <Button loading={decide.isPending} onClick={() => decide.mutate({ kind: 'approve' })}><Check size={16} aria-hidden /> Approve and run</Button>}
        </>
      )}>
      {q.isLoading && <LoadingRows rows={4} />}
      {q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {a && (
        <>
          {a.status === 'failed' && <Banner tone="danger" title="Approved, but could not be carried out">{a.error}</Banner>}
          {a.status === 'pending' && !a.can_decide && !a.can_cancel && <Banner tone="info">You can see this request but cannot decide on it{a.approve_permission ? ` (it needs ${a.approve_permission}, and not from the person who asked)` : ''}.</Banner>}
          <KeyValue items={[
            ['Status', <Status key="s" value={a.status} />], ['Requested by', `${a.requested_by.name} · ${dateTime(a.requested_at)}`],
            ['Lapses', a.status === 'pending' ? `${dateTime(a.expires_at)} (${relative(a.expires_at)})` : '—'],
            ['Decided by', a.decided_by ? `${a.decided_by.name} · ${dateTime(a.decided_at)}` : '—'], ['Note', a.decision_note ?? '—'], ['Carried out', a.executed_at ? dateTime(a.executed_at) : '—'],
          ]} />
          <div><h3 style={{ marginBottom: 8 }}>Exactly what will run</h3><JsonBlock label="Request details" value={a.payload} /></div>
          {a.result && <div><h3 style={{ marginBottom: 8 }}>Result</h3><JsonBlock label="Result" value={a.result} /></div>}
          {rejecting && <TextAreaField label="Why are you rejecting this?" value={note} onChange={(e) => setNote(e.target.value)} hint="The person who asked will see this." />}
          {a.can_decide && !rejecting && <TextAreaField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
        </>
      )}
    </Dialog>
  )
}
