import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, ClipboardCheck, Users, ShieldCheck, CreditCard, Landmark, TrendingUp, ShieldAlert, ScrollText, UserCog, KeyRound, SlidersHorizontal, Timer, CircleUser, Menu, LogOut, Sun, Moon, MonitorCog } from 'lucide-react'
import { api } from './api/client'
import { useAuth } from './auth/AuthContext'
import { IdleGuard } from './auth/idle'
import { useTheme, type Theme } from './lib/theme'
import { Button } from './ui/components'

interface Item {
  to: string
  label: string
  icon: ReactNode
  /** Visible when the role holds any of these. Empty = everyone. */
  any?: string[]
  end?: boolean
}
const ico = (I: typeof Users) => <I size={18} aria-hidden />

const GROUPS: { title?: string; items: Item[] }[] = [
  { items: [{ to: '/', label: 'Overview', icon: ico(LayoutDashboard), end: true }, { to: '/approvals', label: 'Approvals', icon: ico(ClipboardCheck) }] },
  { title: 'Customers', items: [
    { to: '/customers', label: 'Customers', icon: ico(Users), any: ['users.read'] },
    { to: '/kyc', label: 'KYC reviews', icon: ico(ShieldCheck), any: ['kyc.review'] },
  ] },
  { title: 'Money', items: [
    { to: '/payments', label: 'Payments', icon: ico(CreditCard), any: ['payments.read'] },
    { to: '/books', label: 'Books', icon: ico(Landmark), any: ['books.read'] },
    { to: '/investments', label: 'Investments', icon: ico(TrendingUp), any: ['investments.dividends'] },
  ] },
  { title: 'Compliance', items: [{ to: '/aml', label: 'AML', icon: ico(ShieldAlert), any: ['aml.read'] }] },
  { title: 'Governance', items: [{ to: '/audit', label: 'Audit log', icon: ico(ScrollText), any: ['audit.read'] }] },
  { title: 'Staff & access', items: [
    { to: '/staff', label: 'Staff', icon: ico(UserCog), any: ['staff.read'] },
    { to: '/roles', label: 'Roles', icon: ico(KeyRound), any: ['staff.read'] },
  ] },
  { title: 'System', items: [
    { to: '/config', label: 'Configuration', icon: ico(SlidersHorizontal), any: ['config.manage', 'content.manage', 'legal.publish'] },
    { to: '/jobs', label: 'Jobs', icon: ico(Timer), any: ['jobs.run'] },
  ] },
]

const THEMES: [Theme, string, typeof Sun][] = [['system', 'Match system', MonitorCog], ['light', 'Light', Sun], ['dark', 'Dark', Moon]]

export function Layout() {
  const { staff, canAny, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useTheme()
  const loc = useLocation()
  const approvals = useQuery({ queryKey: ['approvals', 'summary'], queryFn: () => api.get<{ waiting_for_you: number; your_open_requests: number }>('/v1/admin/approvals/summary'), refetchInterval: 60_000 })
  const waiting = approvals.data?.waiting_for_you ?? 0
  const nextTheme = THEMES[(THEMES.findIndex((t) => t[0] === theme) + 1) % THEMES.length]!
  const NextIcon = nextTheme[2]
  // close the mobile menu after navigating
  const [lastPath, setLastPath] = useState(loc.pathname)
  if (lastPath !== loc.pathname) { setLastPath(loc.pathname); if (open) setOpen(false) }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
      <aside className="sidebar" data-open={open} aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden>W</span>
          <span>Wevest<small>Admin</small></span>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {GROUPS.map((g, i) => {
            const items = g.items.filter((it) => !it.any || canAny(...it.any))
            if (items.length === 0) return null
            return (
              <div key={i} style={{ display: 'contents' }}>
                {g.title && <div className="nav-group" aria-hidden>{g.title}</div>}
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end}>
                    {it.icon}
                    {it.label}
                    {it.to === '/approvals' && waiting > 0 && <span className="count" aria-label={`${waiting} waiting for you`}>{waiting}</span>}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <Button variant="ghost" icon className="menu-button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu size={20} aria-hidden /></Button>
          <span className="spacer" />
          <Button variant="ghost" size="sm" onClick={() => setTheme(nextTheme[0])} aria-label={`Theme: ${THEMES.find((t) => t[0] === theme)?.[1]}. Switch to ${nextTheme[1]}`} title={`Theme: ${THEMES.find((t) => t[0] === theme)?.[1]}`}>
            <NextIcon size={16} aria-hidden /> <span className="sr-only">Switch theme</span>
          </Button>
          <Link to="/account" className="btn ghost sm">
            <CircleUser size={18} aria-hidden />
            <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
              <span style={{ display: 'block' }}><span className="sr-only">My account: </span>{staff?.name}</span>
              <span className="muted" style={{ fontSize: 11.5, fontWeight: 500 }}>{staff?.role.name}</span>
            </span>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => void signOut()}><LogOut size={14} aria-hidden /> Sign out</Button>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <IdleGuard />
    </div>
  )
}
