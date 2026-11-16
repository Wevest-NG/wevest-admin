import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { RequirePerm } from './auth/Can'
import { Layout } from './Layout'
import { Login } from './pages/Login'
import { LoadingRows, EmptyState, Button } from './ui/components'

const Overview = lazy(() => import('./pages/Overview'))
const Approvals = lazy(() => import('./pages/Approvals'))
const Customers = lazy(() => import('./pages/Customers'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const Kyc = lazy(() => import('./pages/Kyc'))
const Payments = lazy(() => import('./pages/Payments'))
const Books = lazy(() => import('./pages/Books'))
const Investments = lazy(() => import('./pages/Investments'))
const AmlOverview = lazy(() => import('./pages/aml/AmlOverview'))
const AmlAlerts = lazy(() => import('./pages/aml/AmlAlerts'))
const AmlCases = lazy(() => import('./pages/aml/AmlCases'))
const AmlCaseDetail = lazy(() => import('./pages/aml/AmlCaseDetail'))
const AmlReports = lazy(() => import('./pages/aml/AmlReports'))
const AmlReportDetail = lazy(() => import('./pages/aml/AmlReportDetail'))
const AmlScreening = lazy(() => import('./pages/aml/AmlScreening'))
const Audit = lazy(() => import('./pages/Audit'))
const Staff = lazy(() => import('./pages/Staff'))
const Roles = lazy(() => import('./pages/Roles'))
const Config = lazy(() => import('./pages/Config'))
const Jobs = lazy(() => import('./pages/Jobs'))
const JobDetail = lazy(() => import('./pages/JobDetail'))
const Account = lazy(() => import('./pages/Account'))

export function App() {
  const { status, retry } = useAuth()
  const loc = useLocation()
  if (status === 'unavailable') {
    return (
      <div className="auth-card" style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh' }}>
        <h1>We cannot check your sign-in right now</h1>
        <p className="muted">The service is busy or unreachable. Your work is not lost. Try again in a moment.</p>
        <Button onClick={retry}>Try again</Button>
      </div>
    )
  }
  if (status === 'loading') return <div style={{ padding: 40 }}><LoadingRows rows={3} /></div>
  if (status === 'anon') {
    // sign-in is the only screen without a session
    return loc.pathname === '/login' ? <Login /> : <Navigate to="/login" replace />
  }
  return (
    <Suspense fallback={<div style={{ padding: 40 }}><LoadingRows rows={4} /></div>}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="approvals/:id" element={<Approvals />} />
          <Route path="customers" element={<RequirePerm perm="users.read"><Customers /></RequirePerm>} />
          <Route path="customers/:id" element={<RequirePerm perm="users.read"><CustomerDetail /></RequirePerm>} />
          <Route path="kyc" element={<RequirePerm perm="kyc.review"><Kyc /></RequirePerm>} />
          <Route path="payments" element={<RequirePerm perm="payments.read"><Payments /></RequirePerm>} />
          <Route path="books" element={<RequirePerm perm="books.read"><Books /></RequirePerm>} />
          <Route path="investments" element={<RequirePerm perm="investments.dividends"><Investments /></RequirePerm>} />
          <Route path="aml" element={<RequirePerm perm="aml.read"><AmlOverview /></RequirePerm>} />
          <Route path="aml/alerts" element={<RequirePerm perm="aml.read"><AmlAlerts /></RequirePerm>} />
          <Route path="aml/cases" element={<RequirePerm perm="aml.read"><AmlCases /></RequirePerm>} />
          <Route path="aml/cases/:id" element={<RequirePerm perm="aml.read"><AmlCaseDetail /></RequirePerm>} />
          <Route path="aml/reports" element={<RequirePerm perm="aml.read"><AmlReports /></RequirePerm>} />
          <Route path="aml/reports/:id" element={<RequirePerm perm="aml.read"><AmlReportDetail /></RequirePerm>} />
          <Route path="aml/screening" element={<RequirePerm perm="aml.read"><AmlScreening /></RequirePerm>} />
          <Route path="audit" element={<RequirePerm perm="audit.read"><Audit /></RequirePerm>} />
          <Route path="staff" element={<RequirePerm perm="staff.read"><Staff /></RequirePerm>} />
          <Route path="roles" element={<RequirePerm perm="staff.read"><Roles /></RequirePerm>} />
          <Route path="config" element={<RequirePerm any={['config.manage', 'content.manage', 'legal.publish']}><Config /></RequirePerm>} />
          <Route path="jobs" element={<RequirePerm perm="jobs.run"><Jobs /></RequirePerm>} />
          <Route path="jobs/:name" element={<RequirePerm perm="jobs.run"><JobDetail /></RequirePerm>} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<div className="card"><EmptyState title="Page not found">Check the address, or use the menu.</EmptyState></div>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
