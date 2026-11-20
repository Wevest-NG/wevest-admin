import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Plus, ShieldOff, UserCheck, UserX } from 'lucide-react'
import { api } from '../api/client'
import type { Accepted, Created, Role, StaffCredentials, StaffMember } from '../api/types'
import { Can } from '../auth/Can'
import { useAuth } from '../auth/AuthContext'
import { dateTime, relative } from '../lib/format'
import { errorMessage } from '../lib/gated'
import { Badge, Banner, Button, Card, DataTable, PageHeader, Status } from '../ui/components'
import { Dialog } from '../ui/Dialog'
import { Copy } from 'lucide-react'
import { SelectField, TextField } from '../ui/forms'
import { useConfirm, useToast } from '../ui/Toasts'

type Action = { kind: 'disable' | 'enable' | 'reset-password' | 'reset-2fa' | 'sessions' | 'role'; who: StaffMember }

export default function Staff() {
  const { staff: me, can } = useAuth(); const toast = useToast(); const confirm = useConfirm(); const qc = useQueryClient()
  const isSuper = !!me?.permissions.includes('*')
  const [creds, setCreds] = useState<{ name: string; c: StaffCredentials; reason: 'invite' | 'reset' } | null>(null)
  const list = useQuery({ queryKey: ['staff'], queryFn: () => api.get<{ data: StaffMember[] }>('/v1/admin/staff') })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<{ data: Role[] }>('/v1/admin/roles') })
  const [act, setAct] = useState<Action | null>(null); const [invite, setInvite] = useState(false)
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [roleId, setRoleId] = useState(''); const [busy, setBusy] = useState(false)

  const direct = useMutation({
    mutationFn: ({ kind, who }: Action) => kind === 'disable' || kind === 'enable' ? api.patch(`/v1/admin/staff/${who.id}`, { status: kind === 'disable' ? 'disabled' : 'active' }) : kind === 'sessions' ? api.del(`/v1/admin/staff/${who.id}/sessions`) : api.post(`/v1/admin/staff/${who.id}/${kind}`, {}),
    onSuccess: (r, a) => {
      const c = (r as { credentials?: StaffCredentials | null } | undefined)?.credentials
      if (a.kind === 'reset-password' && c) setCreds({ name: a.who.name, c, reason: 'reset' }); else toast('Done.', 'success')
      setAct(null); void qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const send = async () => {
    setBusy(true)
    try {
      const r = invite
        ? await api.post<Accepted | Created>('/v1/admin/staff', { email: email.trim(), name: name.trim(), role_id: roleId })
        : await api.post<Accepted>(`/v1/admin/staff/${act!.who.id}/role`, { role_id: roleId })
      if (r.approval.status === 'executed') {
        // A Super Admin's invite takes effect at once: no second person involved.
        const c = (r as Created).credentials
        if (c) setCreds({ name: name.trim(), c, reason: 'invite' })
        else toast(`${name.trim()} was added. They are emailed a temporary password.`, 'success', { title: 'Account created' })
        void qc.invalidateQueries({ queryKey: ['staff'] })
      } else {
        toast(`${r.approval.summary} Nothing changes until a second person approves.`, 'success', { title: 'Sent for approval' })
      }
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      setInvite(false); setAct(null); setEmail(''); setName('')
    } catch (e) { toast(errorMessage(e), 'danger') }
    setBusy(false)
  }
  const handoffText = (c: StaffCredentials) => `Hi, your Wevest admin account is ready.\n\nSign in: ${c.sign_in_url}\nEmail: ${c.email}\nTemporary password: ${c.temp_password}\n\nThe password works for ${c.expires_in_hours} hours. You will be asked to choose your own password and set up an authenticator app.`
  const copyText = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied.`, 'success') } catch { toast('Could not copy. Select the text and copy it by hand.', 'danger') }
  }
  const roleOptions = roles.data?.data ?? []
  const copy: Record<Action['kind'], [string, string]> = {
    disable: ['Disable this account?', 'They are signed out immediately and cannot sign in until you enable the account again.'],
    enable: ['Enable this account?', 'They can sign in again.'],
    'reset-password': ['Reset their password?', 'They get a new temporary password by email (you may also be shown it to pass on), and are signed out everywhere.'],
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
      <PageHeader title="Staff" subtitle={isSuper ? 'Everyone who can sign in to this dashboard. As a Super Admin you add staff directly; role changes still need a second person.' : "Everyone who can sign in to this dashboard. New accounts and role changes need a second person's approval."} actions={<Can perm="staff.create"><Button onClick={() => { setRoleId(roleOptions[0]?.id ?? ''); setInvite(true) }}><Plus size={16} aria-hidden /> Invite staff</Button></Can>} />
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

      <Dialog open={invite} title="Invite a staff member" description={isSuper ? 'The account is created straight away and they get a temporary password.' : 'A second person must approve before the account is created. They then get a temporary password by email.'} onClose={() => setInvite(false)}
        footer={<><Button variant="secondary" onClick={() => setInvite(false)}>Cancel</Button><Button loading={busy} disabled={!email.includes('@') || name.trim().length < 2 || !roleId} onClick={() => void send()}>{isSuper ? 'Create account' : 'Send for approval'}</Button></>}>
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Work email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField>
        <Banner tone="info">You can only give a role whose permissions you hold yourself.</Banner>
      </Dialog>
      <Dialog open={!!creds} title={creds?.reason === 'reset' ? `New password for ${creds.name}` : `${creds?.name ?? ''} was added`} onClose={() => setCreds(null)} wide
        description="Email delivery is not switched on, so send these to them yourself (for example on WhatsApp). This is the only time the password is shown."
        footer={<><Button variant="secondary" onClick={() => setCreds(null)}>Done</Button>{creds && <Button onClick={() => void copyText(handoffText(creds.c), 'Message')}><Copy size={16} aria-hidden /> Copy message</Button>}</>}>
        {creds && <>
          <TextField label="Sign-in link" readOnly value={creds.c.sign_in_url} onFocus={(e) => e.currentTarget.select()} />
          <TextField label="Email" readOnly value={creds.c.email} onFocus={(e) => e.currentTarget.select()} />
          <TextField label="Temporary password" readOnly value={creds.c.temp_password} onFocus={(e) => e.currentTarget.select()} hint={`Works for ${creds.c.expires_in_hours} hours. They choose their own password and set up an authenticator app at first sign-in.`} />
          <div className="row">
            <Button size="sm" variant="secondary" onClick={() => void copyText(creds.c.sign_in_url, 'Link')}>Copy link</Button>
            <Button size="sm" variant="secondary" onClick={() => void copyText(creds.c.temp_password, 'Password')}>Copy password</Button>
          </div>
        </>}
      </Dialog>
      <Dialog open={act?.kind === 'role'} title={`Change role for ${act?.who.name ?? ''}`} description="A second person (never the person affected) must approve. Their sessions end so the new role starts clean." onClose={() => setAct(null)}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button><Button loading={busy} disabled={!roleId || roleId === act?.who.role.id} onClick={() => void send()}>Send for approval</Button></>}>
        <SelectField label="New role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField>
      </Dialog>
    </>
  )
}
