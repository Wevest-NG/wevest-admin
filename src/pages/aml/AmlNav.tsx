import { NavLink } from 'react-router-dom'

const LINKS: [string, string, boolean][] = [['/aml', 'Overview', true], ['/aml/alerts', 'Alerts', false], ['/aml/cases', 'Cases', false], ['/aml/reports', 'Reports', false], ['/aml/screening', 'Screening', false]]

/** Sub-navigation shared by every AML page. */
export function AmlNav() {
  return (
    <nav className="tabs" aria-label="AML sections">
      {LINKS.map(([to, label, end]) => (
        <NavLink key={to} to={to} end={end} style={({ isActive }) => ({ padding: '7px 16px', borderRadius: 999, fontWeight: 600, textDecoration: 'none', color: isActive ? 'var(--text)' : 'var(--text-muted)', background: isActive ? 'var(--surface)' : 'transparent', boxShadow: isActive ? 'var(--shadow-1)' : 'none' })}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
