import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { humanize } from '../lib/format'
import { errorMessage } from '../lib/gated'
import { Banner, Button, Card, DataTable, PageHeader, Tabs } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { SelectField, TextAreaField, TextField } from '../ui/forms'
import { useToast } from '../ui/Toasts'

type Row = Record<string, unknown>
interface Res { path: string; label: string; pk: string; perm: 'config.manage' | 'content.manage'; hint: string }
const RESOURCES: Res[] = [
  { path: 'limits', label: 'Transaction limits', pk: 'tier', perm: 'config.manage', hint: 'Per-tier single, daily and balance limits (kobo). These are regulatory: change with care.' },
  { path: 'savings/products', label: 'Savings products', pk: 'code', perm: 'config.manage', hint: 'Rates, tenors, minimums and penalties.' },
  { path: 'investments/instruments', label: 'Investment catalogue', pk: 'id', perm: 'config.manage', hint: 'Stocks, funds and fixed-income products customers can buy.' },
  { path: 'academy/lessons', label: 'Academy lessons', pk: 'id', perm: 'content.manage', hint: 'Learning content.' },
  { path: 'support/faqs', label: 'FAQs', pk: 'id', perm: 'content.manage', hint: 'Help-centre questions.' },
  { path: 'rewards/achievements', label: 'Achievements', pk: 'code', perm: 'content.manage', hint: 'Reward badges and their thresholds.' },
  { path: 'rewards/levels', label: 'Reward levels', pk: 'code', perm: 'content.manage', hint: 'Points needed for each level and its perks.' },
]
const short = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 48))

export default function Config() {
  const { can } = useAuth()
  const allowed = RESOURCES.filter((r) => can(r.perm))
  const [tab, setTab] = useState<'data' | 'legal'>(allowed.length ? 'data' : 'legal')
  return (
    <>
      <PageHeader title="Configuration" subtitle="Product settings, content and legal documents. Every change is recorded in the audit log." />
      <Tabs label="Configuration sections" value={tab} onChange={setTab} items={[...(allowed.length ? [{ value: 'data' as const, label: 'Settings & content' }] : []), ...(can('legal.publish') ? [{ value: 'legal' as const, label: 'Legal documents' }] : [])]} />
      {tab === 'data' && allowed.length > 0 && <Resource list={allowed} />}
      {tab === 'legal' && <Legal />}
    </>
  )
}

function Resource({ list }: { list: Res[] }) {
  const toast = useToast(); const qc = useQueryClient()
  const [path, setPath] = useState(list[0]!.path); const res = list.find((r) => r.path === path) ?? list[0]!
  const q = useQuery({ queryKey: ['config', path], queryFn: () => api.get<{ data: Row[] }>(`/v1/admin/${path}`) })
  const [editing, setEditing] = useState<Row | 'new' | null>(null); const [fields, setFields] = useState<Record<string, string>>({}); const [raw, setRaw] = useState('{\n  \n}')
  const rows = q.data?.data ?? []
  const cols = rows[0] ? Object.keys(rows[0]).filter((k) => !['created_at', 'updated_at'].includes(k)).slice(0, 7) : []

  const open = (r: Row | 'new') => { setEditing(r); if (r !== 'new') setFields(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '')]))); else setRaw('{\n  \n}') }
  const save = useMutation({
    mutationFn: async () => {
      if (editing === 'new') return api.post(`/v1/admin/${path}`, JSON.parse(raw))
      const original = editing as Row; const patch: Row = {}
      for (const [k, v] of Object.entries(fields)) {
        if (k === res.pk || ['created_at', 'updated_at'].includes(k)) continue
        const o = original[k]; const before = typeof o === 'object' && o !== null ? JSON.stringify(o, null, 2) : String(o ?? '')
        if (v === before) continue
        patch[k] = typeof o === 'number' ? Number(v) : typeof o === 'boolean' ? v === 'true' : typeof o === 'object' && o !== null ? JSON.parse(v) : v === '' && o === null ? null : v
      }
      if (Object.keys(patch).length === 0) throw new Error('Nothing changed')
      return api.patch(`/v1/admin/${path}/${String(original[res.pk])}`, patch)
    },
    onSuccess: () => { toast('Saved. The change is in the audit log.', 'success'); setEditing(null); void qc.invalidateQueries({ queryKey: ['config', path] }) },
    onError: (e) => toast(e instanceof SyntaxError ? 'That is not valid JSON.' : e instanceof Error && !('status' in e) ? e.message : errorMessage(e), 'danger'),
  })

  return (
    <>
      <div className="row between">
        <SelectField label="What do you want to change?" value={path} onChange={(e) => setPath(e.target.value)}>{list.map((r) => <option key={r.path} value={r.path}>{r.label}</option>)}</SelectField>
        <Button onClick={() => open('new')}><Plus size={16} aria-hidden /> Add</Button>
      </div>
      <Banner tone="info">{res.hint}</Banner>
      <Card flush>
        <DataTable<Row> caption={res.label} rows={rows} rowKey={(r) => String(r[res.pk])} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}
          columns={[...cols.map((k) => ({ key: k, header: humanize(k), cell: (r: Row) => short(r[k]) })), { key: '_', header: '', align: 'right' as const, cell: (r: Row) => <Button size="sm" variant="secondary" onClick={() => open(r)}><Pencil size={14} aria-hidden /> Edit</Button> }]} />
      </Card>
      <Dialog open={editing !== null} wide title={editing === 'new' ? `Add to ${res.label}` : `Edit ${res.label}`} onClose={() => setEditing(null)}
        description={editing === 'new' ? 'Enter the new entry as JSON, using the same fields as the rows above.' : `Only the fields you change are saved. The ${res.pk} cannot be changed.`}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        {editing === 'new' ? <TextAreaField label="Entry (JSON)" value={raw} onChange={(e) => setRaw(e.target.value)} style={{ minHeight: 220, fontFamily: 'var(--mono)' }} />
          : <div className="form-grid">{Object.entries(fields).filter(([k]) => !['created_at', 'updated_at'].includes(k)).map(([k, v]) => {
            const o = (editing as Row)[k]; const long = typeof o === 'object' && o !== null
            return typeof o === 'boolean'
              ? <SelectField key={k} label={humanize(k)} value={v} onChange={(e) => setFields({ ...fields, [k]: e.target.value })}><option value="true">Yes</option><option value="false">No</option></SelectField>
              : long || v.length > 60 ? <TextAreaField key={k} fieldClassName="full" label={humanize(k)} value={v} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} style={{ fontFamily: long ? 'var(--mono)' : undefined }} />
              : <TextField key={k} label={humanize(k)} value={v} disabled={k === res.pk} type={typeof o === 'number' ? 'number' : 'text'} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} />
          })}</div>}
      </Dialog>
    </>
  )
}

function Legal() {
  const toast = useToast()
  const [slug, setSlug] = useState('terms'); const [version, setVersion] = useState(''); const [title, setTitle] = useState(''); const [body, setBody] = useState('')
  const m = useMutation({ mutationFn: () => api.post('/v1/admin/legal', { slug, version: version.trim(), title: title.trim(), body }), onSuccess: () => { toast('Published. Customers are asked to accept the new version.', 'success'); setVersion(''); setTitle(''); setBody('') }, onError: (e) => toast(errorMessage(e), 'danger') })
  return (
    <Card title="Publish a new version of a legal document">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <Banner tone="warning" title="Publishing is immediate and cannot be undone">Have legal review the text first. A published version stays on record.</Banner>
        <div className="form-grid">
          <SelectField label="Document" value={slug} onChange={(e) => setSlug(e.target.value)}><option value="terms">Terms of service</option><option value="privacy">Privacy policy</option><option value="fees">Fees</option><option value="risk-disclosure">Risk disclosure</option><option value="data-consent">Data consent</option></SelectField>
          <TextField label="Version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026-11" required />
          <TextField fieldClassName="full" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextAreaField fieldClassName="full" label="Text" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 240 }} required />
        </div>
        <div><Button type="submit" loading={m.isPending} disabled={!version.trim() || !title.trim() || body.trim().length < 10}>Publish</Button></div>
      </form>
    </Card>
  )
}
