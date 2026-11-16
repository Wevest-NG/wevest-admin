import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Plus, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import { Can } from '../../auth/Can'
import { dateTime, humanize } from '../../lib/format'
import { errorMessage } from '../../lib/gated'
import { Banner, Button, Card, DataTable, EmptyState, PageHeader } from '../../ui/components'
import { Dialog } from '../../ui/Dialog'
import { SelectField, TextAreaField, TextField } from '../../ui/forms'
import { useConfirm, useToast } from '../../ui/Toasts'
import { AmlNav } from './AmlNav'

interface ListRow { id: string; name: string; kind: string; source: string; entries: number; updated_at: string }
interface Entry { name: string; aliases?: string[]; country?: string; dob?: string; reference?: string }

/** One entry per line: Name | alias; alias | country | YYYY-MM-DD | reference  (everything after the name is optional). */
export function parseEntries(text: string): { entries: Entry[]; errors: string[] } {
  const entries: Entry[] = []; const errors: string[] = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim(); if (!line) return
    const [name = '', aliases = '', country = '', dob = '', reference = ''] = line.split('|').map((s) => s.trim())
    if (name.length < 2) { errors.push(`Line ${i + 1}: the name is too short`); return }
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) { errors.push(`Line ${i + 1}: the date of birth must look like 1970-05-01`); return }
    entries.push({ name, aliases: aliases ? aliases.split(';').map((a) => a.trim()).filter(Boolean) : undefined, country: country || undefined, dob: dob || undefined, reference: reference || undefined })
  })
  return { entries, errors }
}

export default function AmlScreening() {
  const toast = useToast(); const confirm = useConfirm(); const qc = useQueryClient()
  const q = useQuery({ queryKey: ['aml', 'lists'], queryFn: () => api.get<{ data: ListRow[] }>('/v1/admin/aml/screening/lists') })
  const [dlg, setDlg] = useState<'create' | ListRow | null>(null)
  const [name, setName] = useState(''); const [kind, setKind] = useState('sanctions'); const [source, setSource] = useState(''); const [text, setText] = useState('')
  const parsed = parseEntries(text)
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['aml'] })
  const askDelete = async (l: ListRow) => {
    if (await confirm({ title: `Delete ${l.name}?`, message: 'Its entries are removed. Alerts already raised from it stay.', confirmLabel: 'Delete list', tone: 'danger' })) remove.mutate(l)
  }

  const create = useMutation({ mutationFn: () => api.post('/v1/admin/aml/screening/lists', { name: name.trim(), kind, source: source.trim() }), onSuccess: () => { toast('List created. Add entries next.', 'success'); setDlg(null); setName(''); setSource(''); invalidate() }, onError: (e) => toast(errorMessage(e), 'danger') })
  const add = useMutation({
    mutationFn: async (list: ListRow) => { let n = 0; for (let i = 0; i < parsed.entries.length; i += 300) n += (await api.post<{ added: number }>(`/v1/admin/aml/screening/lists/${list.id}/entries`, { entries: parsed.entries.slice(i, i + 300) })).added; return n },
    onSuccess: (n) => { toast(`${n} entries added. Customers will be re-screened.`, 'success'); setDlg(null); setText(''); invalidate() }, onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const remove = useMutation({ mutationFn: (l: ListRow) => api.del(`/v1/admin/aml/screening/lists/${l.id}`), onSuccess: () => { toast('List deleted.', 'success'); invalidate() }, onError: (e) => toast(errorMessage(e), 'danger') })
  const run = useMutation({ mutationFn: () => api.post<{ screened: number; alerts: number }>('/v1/admin/aml/screening/run', {}), onSuccess: (r) => { toast(`Screened ${r.screened} customer(s); ${r.alerts} new alert(s).`, r.alerts ? 'info' : 'success'); invalidate() }, onError: (e) => toast(errorMessage(e), 'danger') })

  return (
    <>
      <PageHeader title="Screening" subtitle="Customers are matched against the sanctions, PEP and adverse-media lists you import. A match raises one alert per customer and entry."
        actions={<Can perm="aml.screening"><Button variant="secondary" loading={run.isPending} onClick={() => run.mutate()}><Play size={16} aria-hidden /> Screen now</Button><Button onClick={() => setDlg('create')}><Plus size={16} aria-hidden /> New list</Button></Can>} />
      <AmlNav />
      <Banner tone="info">Names are compared ignoring order, accents and small typos. A birth date, when both sides have one, confirms a match or rules out a namesake. Matches appear under <Link to="/aml/alerts">Alerts</Link>. Nothing is blocked automatically.</Banner>
      <Card flush>
        <DataTable<ListRow> caption="Screening lists" rows={q.data?.data} rowKey={(r) => r.id} loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={<EmptyState title="No lists yet">Create a list, then paste in its entries. Without lists, no customer is screened.</EmptyState>}
          columns={[
            { key: 'n', header: 'List', cell: (r) => <><span className="cell-main">{r.name}</span><div className="cell-sub">{r.source}</div></> },
            { key: 'k', header: 'Kind', cell: (r) => humanize(r.kind) },
            { key: 'e', header: 'Entries', align: 'right', cell: (r) => <span className="num">{r.entries.toLocaleString()}</span> },
            { key: 'u', header: 'Updated', cell: (r) => dateTime(r.updated_at) },
            { key: 'a', header: '', align: 'right', cell: (r) => <Can perm="aml.screening"><div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" variant="secondary" onClick={() => { setText(''); setDlg(r) }}>Add entries</Button><Button size="sm" variant="ghost" icon aria-label={`Delete ${r.name}`} onClick={() => void askDelete(r)}><Trash2 size={16} aria-hidden /></Button></div></Can> },
          ]} />
      </Card>

      <Dialog open={dlg === 'create'} title="New screening list" onClose={() => setDlg(null)} footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}>Create list</Button></>}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="UN consolidated list" />
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="sanctions">Sanctions</option><option value="pep">Politically exposed persons</option><option value="adverse_media">Adverse media</option></SelectField>
        <TextField label="Source (optional)" value={source} onChange={(e) => setSource(e.target.value)} hint="Where this list came from, for your records." />
      </Dialog>
      <Dialog open={dlg !== null && dlg !== 'create'} wide title={`Add entries to ${dlg && dlg !== 'create' ? dlg.name : ''}`} description="One person per line: Name | alias; alias | country | birth date (YYYY-MM-DD) | reference. Only the name is required." onClose={() => setDlg(null)}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={add.isPending} disabled={parsed.entries.length === 0 || parsed.errors.length > 0} onClick={() => dlg && dlg !== 'create' && add.mutate(dlg)}>Add {parsed.entries.length} entries</Button></>}>
        <TextAreaField label="Entries" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 200, fontFamily: 'var(--mono)' }} placeholder={'Musa Ibrahim Abdullahi | Abu Musa | NG | 1970-05-01 | UN-1234'} />
        {parsed.errors.length > 0 && <Banner tone="danger" title="Fix these lines first">{parsed.errors.slice(0, 5).join(' · ')}</Banner>}
      </Dialog>
    </>
  )
}
