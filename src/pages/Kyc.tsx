import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { dateTime } from '../lib/format'
import { errorMessage } from '../lib/gated'
import { Button, Card, DataTable, PageHeader, Status, Tabs } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { SelectField, TextAreaField, TextField } from '../ui/forms'
import { useToast } from '../ui/Toasts'

interface Business { id: string; name: string; type: string; status: string; submitted_at: string | null; email: string | null; phone: string | null; documents: { id: string; kind: string; status: string; filename: string }[] | null }
type St = 'submitted' | 'needs_info' | 'verified' | 'rejected'
const ITEMS = [['cac', 'CAC certificate'], ['tin', 'Tax ID (TIN)'], ['scuml', 'SCUML certificate'], ['logo', 'Logo']] as const

export default function Kyc() {
  const [status, setStatus] = useState<St>('submitted')
  const [open, setOpen] = useState<Business | null>(null)
  const q = useQuery({ queryKey: ['business', status], queryFn: () => api.get<{ data: Business[] }>('/v1/admin/business', { status }) })
  return (
    <>
      <PageHeader title="KYC reviews" subtitle="Business verification submitted by customers. Individual proof-of-address reviews are done from the customer's page." />
      <Tabs<St> label="Business status" value={status} onChange={setStatus} items={[{ value: 'submitted', label: 'Awaiting review' }, { value: 'needs_info', label: 'Needs information' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }]} />
      <Card flush>
        <DataTable<Business> caption="Businesses" rows={q.data?.data} rowKey={(r) => r.id} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}
          columns={[
            { key: 'n', header: 'Business', cell: (r) => <><div className="cell-main">{r.name}</div><div className="cell-sub">{r.email ?? r.phone}</div></> },
            { key: 't', header: 'Type', cell: (r) => <span style={{ textTransform: 'capitalize' }}>{r.type.replace(/_/g, ' ')}</span> },
            { key: 'd', header: 'Documents', cell: (r) => `${r.documents?.length ?? 0} uploaded` },
            { key: 's', header: 'Status', cell: (r) => <Status value={r.status} /> },
            { key: 'w', header: 'Submitted', cell: (r) => dateTime(r.submitted_at) },
            { key: 'a', header: '', align: 'right', cell: (r) => r.status === 'submitted' ? <Button size="sm" onClick={() => setOpen(r)}>Review</Button> : null },
          ]} />
      </Card>
      <Review business={open} onClose={() => setOpen(null)} />
    </>
  )
}

function Review({ business, onClose }: { business: Business | null; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient()
  const [action, setAction] = useState<'approve' | 'request_info' | 'reject'>('approve')
  const [note, setNote] = useState(''); const [item, setItem] = useState<string>('cac'); const [msg, setMsg] = useState('')
  const m = useMutation({
    mutationFn: () => api.post(`/v1/admin/business/${business!.id}/review`, { action, note: note.trim() || undefined, issues: action === 'request_info' ? [{ item, title: ITEMS.find((i) => i[0] === item)![1], message: msg.trim() }] : undefined }),
    onSuccess: () => { toast('Review saved. The customer has been notified.', 'success'); void qc.invalidateQueries({ queryKey: ['business'] }); onClose() },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  return (
    <Dialog open={!!business} wide title={`Review ${business?.name ?? ''}`} description="Check each document, then decide. The customer is notified of the outcome." onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={action === 'reject' ? 'danger' : 'primary'} loading={m.isPending} disabled={action === 'request_info' && msg.trim().length < 3} onClick={() => m.mutate()}>{action === 'approve' ? 'Approve business' : action === 'reject' ? 'Reject business' : 'Request more information'}</Button></>}>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{(business?.documents ?? []).map((d) => <li key={d.id} className="row between"><span>{d.kind.toUpperCase()} · {d.filename}</span><Status value={d.status} /></li>)}</ul>
      <SelectField label="Decision" value={action} onChange={(e) => setAction(e.target.value as typeof action)}><option value="approve">Approve</option><option value="request_info">Ask for more information</option><option value="reject">Reject</option></SelectField>
      {action === 'request_info' && <>
        <SelectField label="Which document?" value={item} onChange={(e) => setItem(e.target.value)}>{ITEMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectField>
        <TextField label="What should they fix?" value={msg} onChange={(e) => setMsg(e.target.value)} />
      </>}
      <TextAreaField label="Note to the customer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  )
}
