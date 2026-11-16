import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '../api/client'
import type { Customer } from '../api/types'
import { dateOnly, fullName } from '../lib/format'
import { Badge, Card, DataTable, PageHeader, Pager, Status } from '../ui/components'
import { SelectField, Field } from '../ui/forms'

const PAGE = 25

export default function Customers() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [tier, setTier] = useState(''); const [page, setPage] = useState(0)
  const [term, setTerm] = useState('')
  const res = useQuery({
    queryKey: ['customers', term, status, tier, page],
    queryFn: () => api.get<{ data: Customer[] }>('/v1/admin/users', { q: term, status, tier, limit: PAGE + 1, offset: page * PAGE }),
    placeholderData: (p) => p,
  })
  const rows = res.data?.data.slice(0, PAGE)
  return (
    <>
      <PageHeader title="Customers" subtitle="Search by name, email or phone. Opening a customer is recorded in the audit log." />
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); setPage(0); setTerm(q.trim()) }}>
        <Field label="Search" className="grow">{(p) => <div className="search-wrap"><Search size={16} aria-hidden /><input className="input search" type="search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} {...p} /></div>}</Field>
        <SelectField label="Status" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value) }}>
          <option value="">Any</option><option value="active">Active</option><option value="pending">Pending</option><option value="frozen">Frozen</option><option value="deactivated">Deactivated</option>
        </SelectField>
        <SelectField label="Tier" value={tier} onChange={(e) => { setPage(0); setTier(e.target.value) }}>
          <option value="">Any</option><option value="0">Tier 0</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option>
        </SelectField>
        <button className="btn" type="submit">Search</button>
      </form>
      <Card flush>
        <DataTable<Customer> caption="Customers" rows={rows} rowKey={(r) => r.id} loading={res.isLoading} error={res.error} onRetry={() => void res.refetch()}
          columns={[
            { key: 'name', header: 'Customer', cell: (r) => <><Link className="row-link" to={`/customers/${r.id}`}>{fullName(r)}</Link><div className="cell-sub">{r.email ?? r.phone ?? '—'}</div></> },
            { key: 'tier', header: 'Tier', cell: (r) => <Badge tone={r.tier >= 2 ? 'primary' : 'neutral'}>Tier {r.tier}</Badge> },
            { key: 'type', header: 'Type', cell: (r) => <span style={{ textTransform: 'capitalize' }}>{r.account_type}</span> },
            { key: 'status', header: 'Status', cell: (r) => <Status value={r.status} /> },
            { key: 'since', header: 'Joined', cell: (r) => dateOnly(r.created_at) },
          ]} />
        <Pager page={page} pageSize={PAGE} hasMore={(res.data?.data.length ?? 0) > PAGE} onPage={setPage} shown={rows?.length ?? 0} />
      </Card>
    </>
  )
}
