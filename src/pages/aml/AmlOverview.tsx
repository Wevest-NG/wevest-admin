import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { AmlSummary } from '../../api/types'
import { integer } from '../../lib/format'
import { Banner, ErrorState, Kpi, LoadingRows, PageHeader } from '../../ui/components'
import { AmlNav } from './AmlNav'

export default function AmlOverview() {
  const q = useQuery({ queryKey: ['aml', 'summary'], queryFn: () => api.get<AmlSummary>('/v1/admin/aml/summary') })
  const s = q.data
  return (
    <>
      <PageHeader title="Anti-money-laundering" subtitle="Alerts become cases; cases produce reports for the regulator. Nothing here is ever visible to customers." />
      <AmlNav />
      {q.isLoading ? <LoadingRows rows={3} /> : q.error || !s ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <>
          {s.overdue_reports > 0 && <Banner tone="danger" title={`${s.overdue_reports} report(s) are past their filing deadline`}>File them now, or record why they are late.</Banner>}
          <div className="grid cols-4">
            <Kpi label="Open alerts" value={integer(s.open_alerts)} hint={s.open_alerts ? `oldest ${s.oldest_open_alert_hours} h · ${s.open_screening_alerts} from screening` : 'nothing waiting'} tone={s.open_alerts ? 'warning' : 'success'} to="/aml/alerts" />
            <Kpi label="Open cases" value={integer(s.open_cases)} hint={`${s.escalated_cases} escalated · ${s.unassigned_cases} unassigned`} to="/aml/cases" />
            <Kpi label="Overdue cases" value={integer(s.overdue_cases)} hint="Past their review date" tone={s.overdue_cases ? 'danger' : 'success'} to="/aml/cases" />
            <Kpi label="Draft reports" value={integer(s.draft_reports)} hint={`${s.overdue_reports} overdue`} tone={s.overdue_reports ? 'danger' : undefined} to="/aml/reports" />
            <Kpi label="Filed, last 30 days" value={integer(s.filed_last_30_days)} hint={`${s.filed_late_last_30_days} filed late`} tone={s.filed_late_last_30_days ? 'warning' : 'success'} to="/aml/reports" />
          </div>
        </>
      )}
    </>
  )
}
