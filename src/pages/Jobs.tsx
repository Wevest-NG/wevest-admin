import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { api } from '../api/client'
import type { JobRun } from '../api/types'
import { duration, humanize, relative } from '../lib/format'
import { Banner, Card, EmptyState, ErrorState, LoadingRows, PageHeader, Status } from '../ui/components'
import { TextField } from '../ui/forms'

export const WHAT: Record<string, string> = {
  autosave: 'Collect due AutoSave contributions.', reminders: 'Remind customers of tomorrow\'s AutoSave.', accrual: 'Accrue savings interest for today.', maturity: 'Pay out matured savings and investments.',
  prices: 'Refresh market prices.', orders: 'Ask the broker about pending orders.', reconcile: 'Ask payment providers about pending payments and payouts.', snapshots: 'Take daily net-worth snapshots.',
  spendSync: 'Sync linked-account transactions.', budgets: 'Send budget alerts.', aml: 'Run transaction-monitoring rules and raise AML alerts.', purge: 'Remove personal data of customers deleted 30+ days ago.',
  cleanup: 'Delete expired one-time codes, idempotency keys, old webhook events and old job history.', books: 'Check that the double-entry books balance.', auditChain: 'Verify the audit log chain and anchor its latest fingerprint.',
  approvals: 'Lapse stale approval requests and finish interrupted ones.', screening: 'Screen customers against sanctions and PEP lists.', amlDeadlines: 'Warn about AML reports close to their deadline.',
}

interface JobsResponse { data: string[]; last_runs: Record<string, JobRun> }

export { duration }

export const stepName = (s: string | null) => (s ? humanize(s).toLowerCase() : null)

export default function Jobs() {
  const nav = useNavigate()
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api.get<JobsResponse>('/v1/admin/jobs') })
  const lastRuns = jobs.data?.last_runs ?? {} // an API that has not been restarted yet answers without it
  const [q, setQ] = useState('')
  // failing jobs first, then by name, so a problem is never buried in a long list
  const needle = q.trim().toLowerCase()
  const shown = (jobs.data?.data ?? []).filter((j) => !needle || j.toLowerCase().includes(needle) || (WHAT[j] ?? '').toLowerCase().includes(needle))
    .sort((a, b) => Number(lastRuns[b]?.status === 'failed') - Number(lastRuns[a]?.status === 'failed') || a.localeCompare(b))
  const failing = Object.values(lastRuns).filter((r) => r.status === 'failed')

  return (
    <>
      <PageHeader title="Jobs" subtitle="Background jobs run on a schedule. Open a job to see its steps, its past runs, and to run it by hand." />
      {failing.length > 0 && (
        <Banner tone="danger" title={`${failing.length} job${failing.length === 1 ? '' : 's'} failed on the latest run`}>
          {failing.map((r) => (
            <div key={r.id}><button type="button" className="link-btn" onClick={() => nav(`/jobs/${r.job}?run=${r.id}`)}><span className="mono">{r.job}</span></button>{r.failed_step ? ` failed at “${stepName(r.failed_step)}”` : ' failed'} {relative(r.started_at)}</div>
          ))}
        </Banner>
      )}
      {(jobs.data?.data.length ?? 0) > 8 && <div className="filters"><TextField label="Find a job" placeholder="Name or what it does" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {jobs.isLoading ? <LoadingRows /> : jobs.error ? <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} /> : shown.length === 0 ? <EmptyState title="No job matches">Try a different word.</EmptyState> : (
        <div className="grid auto">
          {shown.map((j) => {
            const last = lastRuns[j] as JobRun | undefined
            return (
              <Card key={j} title={<span className="mono">{j}</span>} actions={last ? <Status value={last.status} /> : undefined}>
                <p className="muted" style={{ minHeight: 44 }}>{WHAT[j] ?? 'Background job.'}</p>
                <p className="cell-sub" style={{ marginTop: 8 }}>
                  {last ? <>Last run {relative(last.started_at)} · {duration(last.duration_ms)}{last.status === 'failed' && last.failed_step ? <> · failed at <strong>{stepName(last.failed_step)}</strong></> : null}</> : 'No runs recorded yet'}
                </p>
                <button type="button" className="card-link" onClick={() => nav(`/jobs/${j}`)} aria-label={`Open ${j}: steps and past runs`}>Steps and past runs <ChevronRight size={14} aria-hidden /></button>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
