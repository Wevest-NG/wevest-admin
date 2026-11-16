import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Plus, ShieldOff, UserCheck, UserX } from 'lucide-react'
import { api } from '../api/client'
import type { Role, StaffMember } from '../api/types'
import { Can } from '../auth/Can'
import { useAuth } from '../auth/AuthContext'
import { dateTime, relative } from '../lib/format'
import { errorMessage, useGated } from '../lib/gated'
import { Badge, Banner, Button, Card, DataTable, PageHeader, Status } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { SelectField, TextField } from '../ui/forms'
import { useConfirm, useToast } from '../ui/Toasts'

type Action = { kind: 'disable' | 'enable' | 'reset-password' | 'reset-2fa' | 'sessions' | 'role'; who: StaffMember }

export default function Staff() {
  const { staff: me, can } = useAuth(); const toast = useToast(); const confirm = useConfirm(); const qc = useQueryClient(); const gate = useGated()
  const list = useQuery({ queryKey: ['staff'], queryFn: () => api.get<{ data: StaffMember[] }>('/v1/admin/staff') })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<{ data: Role[] }>('/v1/admin/roles') })
  const [act, setAct] = useState<Action | null>(null); const [invite, setInvite] = useState(false)
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [roleId, setRoleId] = useState(''); const [busy, setBusy] = useState(false)

  const direct = useMutation({
    mutationFn: ({ kind, who }: Action) => kind === 'disable' || kind === 'enable' ? api.patch(`/v1/admin/staff/${who.id}`, { status: kind === 'disable' ? 'disabled' : 'active' }) : kind === 'sessions' ? api.del(`/v1/admin/staff/${who.id}/sessions`) : api.post(`/v1/admin/staff/${who.id}/${kind}`, {}),
    onSuccess: () => { toast('Done.', 'success'); setAct(null); void qc.invalidateQueries({ queryKey: ['staff'] }) },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const send = async () => {
    setBusy(true)
    const ok = invite
      ? await gate(() => api.post('/v1/admin/staff', { email: email.trim(), name: name.trim(), role_id: roleId }))
      : await gate(() => api.post(`/v1/admin/staff/${act!.who.id}/role`, { role_id: roleId }))
    setBusy(false); if (ok) { setInvite(false); setAct(null); setEmail(''); setName('') }
  }
  const roleOptions = roles.data?.data ?? []
  const copy: Record<Action['kind'], [string, string]> = {
    disable: ['Disable this account?', 'They are signed out immediately and cannot sign in until you enable the account again.'],
    enable: ['Enable this account?', 'They can sign in again.'],
    'reset-password': ['Reset their password?', 'They get a new temporary password by email, and are signed out everywhere.'],
    'reset-2fa': ['Remove their authenticator?', 'Use this when they lose their phone and recovery codes. They sign in again with their password and set up a new authenticator.'],
    sessions: ['End all their sessions?', 'They are signed out everywhere and must sign in again.'],
    role: ['', ''],
  }

  const ask = async (a: Action) => {
    const [title, text] = copy[a.kind]
    if (await confirm({ title, message: `${a.who.name}: ${text}`, confirmLabel: 'Confirm', tone: a.kind === 'disable' || a.kind === 'reset-2fa' ? 'danger' : 'primary' })) direct.mutate(a)
  }

  return (
    <>
      <PageHeader title="Staff" subtitle="Everyone who can sign in to this dashboard. New accounts and role changes need a second person's approval." actions={<Can perm="staff.create"><Button onClick={() => { setRoleId(roleOptions[0]?.id ?? ''); setInvite(true) }}><Plus size={16} aria-hidden /> Invite staff</Button></Can>} />
      <Card flush>
        <DataTable<StaffMember> caption="Staff" rows={list.data?.data} rowKey={(s) => s.id} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()}
          columns={[
            { key: 'n', header: 'Person', cell: (s) => <><span className="cell-main">{s.name}</span> {s.id === me?.id && <Badge tone="primary">You</Badge>}<div className="cell-sub">{s.email}</div></> },
            { key: 'r', header: 'Role', cell: (s) => s.role.name },
            { key: 's', header: 'Status', cell: (s) => <><Status value={s.status} />{s.must_change_password && <div className="cell-sub">Has not signed in yet</div>}</> },
            { key: '2', header: 'Two-step', cell: (s) => s.two_factor ? <Badge tone="success" dot>On</Badge> : <Badge tone="warning" dot>Not set up</Badge> },
            { key: 'l', header: 'Last sign-in', cell: (s) => s.last_login_at ? <><span>{relative(s.last_login_at)}</span><div className="cell-sub">{dateTime(s.last_login_at)}</div></> : 'Never' },
            { key: 'a', header: '', align: 'right', cell: (s) => s.id === me?.id ? null : (
              <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                <Can perm="staff.assign_role"><Button size="sm" variant="secondary" onClick={() => { setRoleId(s.role.id); setAct({ kind: 'role', who: s }) }}>Change role…</Button></Can>
                {can('staff.manage') && <>
                  {s.status === 'active' ? <Button size="sm" variant="ghost" icon aria-label={`Disable ${s.name}`} title="Disable" onClick={() => void ask({ kind: 'disable', who: s })}><UserX size={16} aria-hidden /></Button> : <Button size="sm" variant="ghost" icon aria-label={`Enable ${s.name}`} title="Enable" onClick={() => void ask({ kind: 'enable', who: s })}><UserCheck size={16} aria-hidden /></Button>}
                  <Button size="sm" variant="ghost" icon aria-label={`Reset password of ${s.name}`} title="Reset password" onClick={() => void ask({ kind: 'reset-password', who: s })}><KeyRound size={16} aria-hidden /></Button>
                  <Button size="sm" variant="ghost" icon aria-label={`Remove authenticator of ${s.name}`} title="Remove authenticator" onClick={() => void ask({ kind: 'reset-2fa', who: s })}><ShieldOff size={16} aria-hidden /></Button>
                  <Button size="sm" variant="ghost" icon aria-label={`End sessions of ${s.name}`} title="End sessions" onClick={() => void ask({ kind: 'sessions', who: s })}><LogOut size={16} aria-hidden /></Button>
                </>}
              </div>) },
          ]} />
      </Card>

      <Dialog open={invite} title="Invite a staff member" description="A second person must approve before the account is created. They then get a temporary password by email." onClose={() => setInvite(false)}
        footer={<><Button variant="secondary" onClick={() => setInvite(false)}>Cancel</Button><Button loading={busy} disabled={!email.includes('@') || name.trim().length < 2 || !roleId} onClick={() => void send()}>Send for approval</Button></>}>
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Work email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField>
        <Banner tone="info">You can only give a role whose permissions you hold yourself.</Banner>
      </Dialog>
      <Dialog open={act?.kind === 'role'} title={`Change role for ${act?.who.name ?? ''}`} description="A second person (never the person affected) must approve. Their sessions end so the new role starts clean." onClose={() => setAct(null)}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button><Button loading={busy} disabled={!roleId || roleId === act?.who.role.id} onClick={() => void send()}>Send for approval</Button></>}>
        <SelectField label="New role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField>
      </Dialog>
    </>
  )
}
