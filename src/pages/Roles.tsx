import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { PermissionDef, Role } from '../api/types'
import { Can } from '../auth/Can'
import { useAuth } from '../auth/AuthContext'
import { dateOnly } from '../lib/format'
import { errorMessage, useGated } from '../lib/gated'
import { Badge, Banner, Button, Card, DataTable, PageHeader } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { TextAreaField, TextField } from '../ui/forms'
import { useConfirm, useToast } from '../ui/Toasts'

/** Permissions grouped by area. You can only switch ON what you hold yourself; the server enforces it too. */
export function PermissionPicker({ catalogue, value, onChange, held }: { catalogue: PermissionDef[]; value: Set<string>; onChange: (s: Set<string>) => void; held: (k: string) => boolean }) {
  const groups = [...new Set(catalogue.map((p) => p.group))]
  return (
    <div className="stack">
      {groups.map((g) => (
        <fieldset key={g} className="perm-group"><legend>{g}</legend>
          {catalogue.filter((p) => p.group === g).map((p) => {
            const on = value.has(p.key); const allowed = on || held(p.key)
            return (
              <label key={p.key} className="perm-item" style={allowed ? undefined : { opacity: 0.55 }}>
                <input type="checkbox" checked={on} disabled={!allowed} onChange={(e) => { const n = new Set(value); if (e.target.checked) n.add(p.key); else n.delete(p.key); onChange(n) }} />
                <span><strong>{p.label}</strong>{p.key.endsWith('.approve') || p.key === 'staff.access.approve' ? <> <Badge tone="primary">approves requests</Badge></> : null}<span className="desc" style={{ display: 'block' }}>{p.description}{!allowed ? ' (you do not hold this, so you cannot grant it)' : ''}</span></span>
              </label>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}

export default function Roles() {
  const { can } = useAuth(); const toast = useToast(); const confirm = useConfirm(); const qc = useQueryClient(); const gate = useGated()
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<{ data: Role[] }>('/v1/admin/roles') })
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<{ data: PermissionDef[] }>('/v1/admin/permissions') })
  const [edit, setEdit] = useState<Role | 'new' | null>(null)
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [sel, setSel] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false)

  const open = (r: Role | 'new') => { setEdit(r); setName(r === 'new' ? '' : r.name); setDesc(r === 'new' ? '' : r.description); setSel(new Set(r === 'new' ? [] : r.permissions)) }
  const save = async () => {
    setBusy(true)
    try {
      if (edit === 'new') { await api.post('/v1/admin/roles', { name: name.trim(), description: desc.trim(), permissions: [...sel] }); toast('Role created. It grants nothing until someone is assigned to it.', 'success'); void qc.invalidateQueries({ queryKey: ['roles'] }); setEdit(null) }
      else if (edit) { const ok = await gate(() => api.patch(`/v1/admin/roles/${edit.id}`, { name: name.trim(), description: desc.trim(), permissions: [...sel] })); if (ok) setEdit(null) }
    } catch (e) { toast(errorMessage(e), 'danger') } finally { setBusy(false) }
  }
  const remove = useMutation({ mutationFn: (r: Role) => api.del(`/v1/admin/roles/${r.id}`), onSuccess: () => { toast('Role deleted.', 'success'); void qc.invalidateQueries({ queryKey: ['roles'] }) }, onError: (e) => toast(errorMessage(e), 'danger') })
  const catalogue = perms.data?.data ?? []
  const askDelete = async (r: Role) => {
    if (await confirm({ title: `Delete “${r.name}”?`, message: 'The role is removed for good. Nobody holds it, so no one loses access.', confirmLabel: 'Delete role', tone: 'danger' })) remove.mutate(r)
  }

  return (
    <>
      <PageHeader title="Roles" subtitle="A role is a set of permissions. Changes to an existing role need a second person's approval, and apply to everyone in it on their next request." actions={<Can perm="roles.manage"><Button onClick={() => open('new')}><Plus size={16} aria-hidden /> New role</Button></Can>} />
      <Card flush>
        <DataTable<Role> caption="Roles" rows={roles.data?.data} rowKey={(r) => r.id} loading={roles.isLoading} error={roles.error} onRetry={() => void roles.refetch()}
          columns={[
            { key: 'n', header: 'Role', cell: (r) => <><span className="cell-main">{r.name}</span> {r.is_system && <Badge tone="primary">Built in</Badge>}<div className="cell-sub">{r.description}</div></> },
            { key: 'p', header: 'Permissions', cell: (r) => r.permissions.includes('*') ? <Badge tone="warning">Everything</Badge> : <span className="num">{r.permissions.length}</span> },
            { key: 'm', header: 'Members', cell: (r) => <span className="num">{r.members}</span> },
            { key: 'u', header: 'Changed', cell: (r) => dateOnly(r.updated_at) },
            { key: 'a', header: '', align: 'right', cell: (r) => (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button size="sm" variant="secondary" onClick={() => open(r)} disabled={r.is_system && !can('roles.manage')}><Pencil size={14} aria-hidden /> {can('roles.manage') && !r.is_system ? 'Edit' : 'View'}</Button>
                <Can perm="roles.manage">{!r.is_system && <Button size="sm" variant="ghost" icon aria-label={`Delete ${r.name}`} disabled={r.members > 0} title={r.members > 0 ? 'Move its members first' : undefined} onClick={() => void askDelete(r)}><Trash2 size={16} aria-hidden /></Button>}</Can>
              </div>) },
          ]} />
      </Card>

      <Dialog open={edit !== null} wide title={edit === 'new' ? 'New role' : edit ? edit.name : ''} onClose={() => setEdit(null)}
        description={edit && edit !== 'new' ? (edit.is_system ? 'The Super Admin role holds every permission and cannot be changed.' : can('roles.manage') ? 'Saving sends this change for approval. Nothing changes until a second person approves it.' : 'You can look, but your role cannot change roles.') : 'Pick what this role can do. It grants nothing until someone is assigned to it.'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{edit !== 'new' && (edit?.is_system || !can('roles.manage')) ? 'Close' : 'Cancel'}</Button>{can('roles.manage') && !(edit !== 'new' && edit?.is_system) && <Button loading={busy} disabled={name.trim().length < 2} onClick={() => void save()}>{edit === 'new' ? 'Create role' : 'Send for approval'}</Button>}</>}>
        {edit !== 'new' && edit?.is_system ? <Banner tone="info">Everything, always.</Banner> : (
          <>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={!can('roles.manage')} />
            <TextAreaField label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!can('roles.manage')} />
            <PermissionPicker catalogue={catalogue} value={sel} onChange={setSel} held={(k) => can(k)} />
          </>
        )}
      </Dialog>
    </>
  )
}
