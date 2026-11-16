import { useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ShieldCheck } from 'lucide-react'
import { api } from '../api/client'
import type { AuditEntry, Paged } from '../api/types'
import { dateTime, relative } from '../lib/format'
import { Badge, Banner, Clamp, Button, Card, DataTable, KeyValue, PageHeader } from '../ui/components'
import { SelectField, TextField } from '../ui/forms'
import { useToast } from '../ui/Toasts'

const AREAS: [string, string][] = [
  ['', 'Everything'], ['auth.', 'Customer sign-ins and security'], ['staff.', 'Staff accounts and sign-ins'], ['kyc.', 'Identity verification'], ['aml.', 'AML cases and reports'],
  ['approval.', 'Approvals'], ['admin.', 'Staff viewing customer data'], ['job.', 'Jobs run by hand'], ['payment.', 'Payment decisions'], ['user.', 'Account freezes'], ['role.', 'Roles'],
]

interface Verify { ok: boolean; entries: number; head_seq: number; head_hash: string | null; first_bad_seq: number | null; broken_anchors: number[] }

export default function Audit() {
  const toast = useToast(); const qc = useQueryClient()
  const [f, setF] = useState({ action: '', target_type: '', target_id: '', actor_id: '' }); const [applied, setApplied] = useState(f)
  const verify = useQuery({ queryKey: ['audit', 'verify'], queryFn: () => api.get<Verify>('/v1/admin/audit-log/verify') })
  const reverify = useMutation({ mutationFn: () => api.get<Verify>('/v1/admin/audit-log/verify'), onSuccess: (r) => { qc.setQueryData(['audit', 'verify'], r); toast(r.ok ? 'The audit log is intact.' : 'The audit log failed verification.', r.ok ? 'success' : 'danger') } })
  const list = useInfiniteQuery({
    queryKey: ['audit', applied], initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => api.get<Paged<AuditEntry> & { next_cursor: number | null }>('/v1/admin/audit-log', { ...applied, limit: 50, cursor: pageParam }),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.data)
  const v = verify.data
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every sensitive action, who did it, from where. Entries are chained with hashes and cannot be edited or deleted." />
      {v && (v.ok
        ? <Banner tone="success" title={`Chain verified: ${v.entries.toLocaleString()} entries`}>Record the latest fingerprint outside this system (for example in your log archive) so even a database owner cannot quietly rewrite history. <code style={{ wordBreak: 'break-all' }}>#{v.head_seq} {v.head_hash}</code></Banner>
        : <Banner tone="danger" title="The audit log failed verification">{v.first_bad_seq ? `An entry at sequence ${v.first_bad_seq} was changed or removed. ` : ''}{v.broken_anchors.length ? `${v.broken_anchors.length} anchored fingerprint(s) no longer match.` : ''} Escalate now.</Banner>)}
      <div className="row">
        <Button variant="secondary" size="sm" loading={reverify.isPending} onClick={() => reverify.mutate()}><ShieldCheck size={14} aria-hidden /> Verify again</Button>
        {v?.head_hash && <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(`#${v.head_seq} ${v.head_hash}`); toast('Fingerprint copied.', 'success') }}><Copy size={14} aria-hidden /> Copy fingerprint</Button>}
      </div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setApplied(f) }}>
        <SelectField label="Area" value={f.action} onChange={(e) => { const next = { ...f, action: e.target.value }; setF(next); setApplied(next) }}>
          {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        <TextField label="Target type" placeholder="user, aml_case…" value={f.target_type} onChange={(e) => setF({ ...f, target_type: e.target.value })} />
        <TextField label="Target id" value={f.target_id} onChange={(e) => setF({ ...f, target_id: e.target.value })} />
        <TextField label="Actor id" value={f.actor_id} onChange={(e) => setF({ ...f, actor_id: e.target.value })} />
        <Button type="submit">Filter</Button>
      </form>
      <Card flush>
        <DataTable<AuditEntry> caption="Audit entries" rows={rows} rowKey={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()}
          columns={[
            { key: 'w', header: 'When', cell: (r) => <><span className="cell-main">{dateTime(r.created_at)}</span><div className="cell-sub">{relative(r.created_at)}</div></> },
            { key: 'a', header: 'What happened', cell: (r) => <><span className="cell-main"><Clamp text={r.summary ?? r.action} max={300} /></span><div className="cell-sub mono">{r.action}</div></> },
            { key: 'u', header: 'By', cell: (r) => {
              // an API that has not been restarted yet sends rows without actor / details
              const kind = r.actor?.kind ?? (r.actor_role === 'system' || !r.actor_id ? 'system' : r.actor_role === 'user' ? 'customer' : 'staff')
              return <><span>{r.actor?.name ?? r.actor_role ?? 'system'}</span><div className="cell-sub">{kind === 'staff' ? 'Staff' : kind === 'customer' ? 'Customer' : <Badge>Automatic</Badge>}</div></>
            } },
            { key: 'i', header: 'From', cell: (r) => <span className="mono">{r.ip ?? '—'}</span> },
            { key: 'm', header: 'Details', cell: (r) => (r.details ?? []).length === 0 ? '—' : <details><summary>Show</summary><KeyValue items={r.details.map((d) => [d.label, d.value])} /></details> },
          ]} />
        {list.hasNextPage && <div className="pager"><span /><Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load older</Button></div>}
      </Card>
    </>
  )
}
