import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { dateTime, humanize } from '../lib/format'
import { errorMessage } from '../lib/gated'
import { Badge, Banner, Button, Card, DataTable, KeyValue, PageHeader } from '../ui/components'
import { PasswordField } from '../ui/forms'
import { useTheme, type Theme } from '../lib/theme'
import { SelectField } from '../ui/forms'
import { useToast } from '../ui/Toasts'

interface SessionRow { id: string; ip: string | null; user_agent: string | null; created_at: string; last_used_at: string; current: boolean }

export default function Account() {
  const { staff } = useAuth(); const toast = useToast(); const qc = useQueryClient(); const [theme, setTheme] = useTheme()
  const sessions = useQuery({ queryKey: ['me', 'sessions'], queryFn: () => api.get<{ data: SessionRow[] }>('/v1/staff/me/sessions') })
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState('')
  const change = useMutation({
    mutationFn: () => api.post('/v1/staff/me/password', { current_password: cur, new_password: next }),
    onSuccess: () => { toast('Password changed. Your other sessions were signed out.', 'success'); setCur(''); setNext(''); setAgain(''); void qc.invalidateQueries({ queryKey: ['me'] }) }, onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const end = useMutation({ mutationFn: (id: string) => api.del(`/v1/staff/me/sessions/${id}`), onSuccess: () => { toast('Session ended.', 'success'); void qc.invalidateQueries({ queryKey: ['me'] }) }, onError: (e) => toast(errorMessage(e), 'danger') })
  const submit = (e: FormEvent) => { e.preventDefault(); if (next === again) change.mutate() }
  if (!staff) return null
  const groups = staff.permissions.includes('*') ? ['Everything'] : staff.permissions

  return (
    <>
      <PageHeader title="My account" subtitle="Your sign-in, sessions and what your role can do." />
      <div className="grid cols-2">
        <Card title="Profile"><KeyValue items={[['Name', staff.name], ['Email', staff.email], ['Role', <Badge key="r" tone="primary">{staff.role.name}</Badge>], ['Last sign-in', dateTime(staff.last_login_at)]]} />
          <div style={{ marginTop: 16 }}><SelectField label="Appearance" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option></SelectField></div></Card>
        <Card title="Change password">
          <form className="stack" onSubmit={submit}>
            <PasswordField label="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
            <PasswordField label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={12} hint="At least 12 characters, with letters and numbers." required />
            <PasswordField label="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={again && next !== again ? 'The passwords do not match' : null} required />
            <div><Button type="submit" loading={change.isPending} disabled={!cur || next.length < 12 || next !== again}>Change password</Button></div>
          </form>
        </Card>
      </div>
      <Banner tone="info" title="Lost your phone?">A Super Admin can remove your authenticator so you can set up a new one. Use a recovery code to sign in meanwhile.</Banner>
      <Card title="Active sessions" flush>
        <DataTable<SessionRow> caption="Active sessions" rows={sessions.data?.data} rowKey={(s) => s.id} loading={sessions.isLoading} error={sessions.error}
          columns={[
            { key: 'd', header: 'Device', cell: (s) => <><span className="cell-main">{(s.user_agent ?? 'Unknown').slice(0, 70)}</span> {s.current && <Badge tone="success">This session</Badge>}<div className="cell-sub mono">{s.ip}</div></> },
            { key: 's', header: 'Started', cell: (s) => dateTime(s.created_at) }, { key: 'l', header: 'Last active', cell: (s) => dateTime(s.last_used_at) },
            { key: 'a', header: '', align: 'right', cell: (s) => s.current ? null : <Button size="sm" variant="secondary" loading={end.isPending && end.variables === s.id} onClick={() => end.mutate(s.id)}>End</Button> },
          ]} />
      </Card>
      <Card title="What your role can do"><div className="row">{groups.map((g) => <Badge key={g}>{humanize(g)}</Badge>)}</div></Card>
    </>
  )
}
