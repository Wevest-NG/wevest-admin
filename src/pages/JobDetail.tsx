import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Play } from 'lucide-react'
import { api } from '../api/client'
import type { JobPlan, JobRun, JobRunDetail, JobStep } from '../api/types'
import { dateTime, duration, formatValue, humanize } from '../lib/format'
import { errorMessage } from '../lib/gated'
import { Banner, Button, Card, Clamp, DataTable, EmptyState, ErrorState, JsonBlock, LoadingRows, PageHeader, Status } from '../ui/components'
import { SelectField } from '../ui/forms'
import { useToast } from '../ui/Toasts'
import { stepName, WHAT } from './Jobs'

interface RunResponse { job: string; run_id: string | null; status: 'succeeded' | 'failed'; error: string | null; failed_step: string | null }
const PAGE = 15

/** One job: the steps it takes (from the latest or the selected run), every past run, and the button to run it. */
export default function JobDetail() {
  const { name = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)

  const plan = useQuery({ queryKey: ['jobs', 'plan', name], queryFn: () => api.get<JobPlan>(`/v1/admin/jobs/${name}/plan`) })
  const history = useQuery({
    queryKey: ['jobs', 'runs', name, status, page],
    queryFn: () => api.get<{ data: JobRun[]; has_more: boolean }>('/v1/admin/jobs/runs', { job: name, status: status || undefined, limit: PAGE, offset: page * PAGE }),
    refetchInterval: (q) => (q.state.data?.data.some((r) => r.status === 'running') ? 3000 : false),
  })
  const runs = history.data?.data
  const selectedId = params.get('run') ?? runs?.[0]?.id ?? null
  const select = (id: string) => setParams({ run: id }, { replace: true })

  const run = useMutation({
    mutationFn: () => api.post<RunResponse>(`/v1/admin/jobs/${name}/run`),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
      setStatus(''); setPage(0)
      if (r.run_id) select(r.run_id)
      if (r.status === 'failed') toast(`${name} failed${r.failed_step ? ` at "${stepName(r.failed_step)}"` : ''}.`, 'danger')
      else toast(`${name} finished.`, 'success')
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })

  return (
    <>
      <p><Link to="/jobs" className="back-link"><ArrowLeft size={14} aria-hidden /> All jobs</Link></p>
      <PageHeader title={name} subtitle={WHAT[name] ?? plan.data?.summary}
        actions={<Button loading={run.isPending} onClick={() => run.mutate()}><Play size={14} aria-hidden /> Run now</Button>} />
      <p className="muted" style={{ marginBottom: 16 }}>{plan.data ? `${plan.data.effect} Running it twice does not do the work twice.` : null}</p>

      <div className="grid cols-2">
        <Card title="Steps taken">
          {selectedId ? <RunSteps runId={selectedId} plan={plan.data} /> : history.isLoading || plan.isLoading ? <LoadingRows rows={3} /> : (
            <>
              <p className="muted" style={{ marginBottom: 8 }}>This job has not run yet. When it runs, it takes these steps:</p>
              <PlannedSteps plan={plan.data} />
            </>
          )}
        </Card>

        <Card title="Past runs" flush actions={
          <SelectField label="Outcome" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
            <option value="">Any outcome</option><option value="failed">Failed</option><option value="succeeded">Succeeded</option>
          </SelectField>}>
          <DataTable<JobRun> caption={`Runs of ${name}`} rows={runs} rowKey={(r) => r.id} loading={history.isLoading} error={history.error} onRetry={() => void history.refetch()}
            empty={<EmptyState title="No runs">Runs are kept for 7 days (failed ones for 90).</EmptyState>}
            columns={[
              { key: 'w', header: 'Started', cell: (r) => <button type="button" className="link-btn" aria-current={r.id === selectedId} onClick={() => select(r.id)}><span className={r.id === selectedId ? 'cell-main' : undefined}>{dateTime(r.started_at)}</span></button> },
              { key: 'b', header: 'By', cell: (r) => r.trigger === 'manual' ? r.started_by_name ?? 'Staff' : 'Schedule' },
              { key: 's', header: 'Outcome', cell: (r) => <><Status value={r.status} />{r.status === 'failed' && <div className="cell-sub">at {stepName(r.failed_step) ?? 'the job itself'}</div>}</> },
              { key: 'd', header: 'Took', cell: (r) => duration(r.duration_ms) },
            ]} />
          {(page > 0 || history.data?.has_more) && (
            <div className="pager"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button><Button size="sm" variant="secondary" disabled={!history.data?.has_more} onClick={() => setPage(page + 1)}>Older</Button></div>
          )}
        </Card>
      </div>
    </>
  )
}

function PlannedSteps({ plan }: { plan?: JobPlan }) {
  if (!plan) return null
  if (plan.steps.length === 0) return <p className="muted">This job runs as a single action.</p>
  return <ol className="timeline" aria-label="Steps this job takes">{plan.steps.map((s, i) => <li key={s.name}><strong>{i + 1}. {s.label}</strong></li>)}</ol>
}

/** The steps of one run. Steps the job would have taken but never reached (because an earlier one failed) are listed as not run. */
function RunSteps({ runId, plan }: { runId: string; plan?: JobPlan }) {
  const q = useQuery({ queryKey: ['jobs', 'run', runId], queryFn: () => api.get<JobRunDetail>(`/v1/admin/jobs/runs/${runId}`), refetchInterval: (s) => (s.state.data?.run.status === 'running' ? 3000 : false) })
  if (q.isLoading) return <LoadingRows rows={3} />
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const { run, steps } = q.data!
  const recorded = new Map<string, JobStep>(steps.map((s) => [s.name, s]))
  const rows: { name: string; label: string; step?: JobStep }[] = [
    ...(plan?.steps ?? []).map((p) => ({ ...p, step: recorded.get(p.name) })),
    ...steps.filter((s) => !(plan?.steps ?? []).some((p) => p.name === s.name)).map((s) => ({ name: s.name, label: s.label, step: s })),
  ].sort((a, b) => (a.step?.seq ?? 99) - (b.step?.seq ?? 99))
  const finished = run.status !== 'running'
  return (
    <>
      <p className="cell-sub" style={{ marginBottom: 10 }}>
        Run of {dateTime(run.started_at)} · {run.trigger === 'manual' ? `by ${run.started_by_name ?? 'a staff member'}` : 'scheduled'} · <Status value={run.status} /> · {duration(run.duration_ms)}
      </p>
      {run.status === 'failed' && <Banner tone="danger" title={run.failed_step ? `Failed at “${stepName(run.failed_step)}”` : 'The job failed'}><Clamp text={run.error} max={400} /></Banner>}
      {rows.length === 0
        ? <p className="muted">This job runs as a single action{run.status === 'succeeded' ? ' and it succeeded' : ''}. Its result is below.</p>
        : (
          <ol className="timeline scroll-list" aria-label="Steps in this run">
            {rows.map((r, i) => (
              <li key={r.name} data-state={r.step?.status ?? 'skipped'}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{i + 1}. {r.step?.label ?? r.label}</strong>
                  {r.step ? <span className="row"><span className="cell-sub">{duration(r.step.duration_ms)}</span><Status value={r.step.status} /></span> : <span className="cell-sub">{finished ? 'Did not run' : 'Waiting'}</span>}
                </div>
                {r.step?.error && <p className="step-error"><Clamp text={r.step.error} /></p>}
                {r.step?.detail != null && typeof r.step.detail === 'object' && (
                  <div className="meta">{Object.entries(r.step.detail as Record<string, unknown>).map(([k, v]) => `${humanize(k)}: ${formatValue(v)}`).join(' · ')}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      {run.result != null && <details style={{ marginTop: 12 }}><summary>Full result</summary><JsonBlock label={`Result of ${run.job}`} value={run.result} /></details>}
    </>
  )
}
