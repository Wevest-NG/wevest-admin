export interface Paged<T> {
  data: T[]
  next_cursor?: string | null
}

export interface ApprovalItem {
  id: string
  action: string
  label: string
  summary: string
  status: 'pending' | 'approved' | 'executed' | 'failed' | 'rejected' | 'cancelled' | 'expired'
  requested_by: { id: string; name: string }
  requested_at: string
  expires_at: string
  decided_by: { id: string; name: string } | null
  decided_at: string | null
  decision_note: string | null
  executed_at: string | null
  error: string | null
  can_decide: boolean
  can_cancel: boolean
  approve_permission: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
}

export interface Accepted {
  approval: { id: string; status: 'pending'; summary: string; expires_at: string; approvers_needed_with: string }
}

/** Shown once to a Super Admin when the server has EXPOSE_STAFF_CREDENTIALS on (email delivery not yet working). */
export interface StaffCredentials {
  email: string
  temp_password: string
  sign_in_url: string
  expires_in_hours: string
}

/** A Super Admin creates staff directly (201); everyone else gets {@link Accepted} (202). */
export interface Created {
  approval: { id: string; status: 'executed'; summary: string }
  credentials?: StaffCredentials | null
}

export interface Customer {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  tier: number
  status: string
  account_type: string
  created_at: string
}

export interface CustomerWallet { id: string; currency: string; balance: number; created_at: string; account_number: string | null; account_name: string | null; bank_name: string | null }

export interface Customer360 {
  user: Customer & { role: string; deactivated_at: string | null }
  kyc: { dob: string | null; bvn_last4: string | null; bvn_verified_at: string | null; nin_last4: string | null; nin_verified_at: string | null; selfie_verified_at: string | null; address: unknown; address_verified_at: string | null; has_address_doc: boolean } | null
  wallets: CustomerWallet[]
  bank_accounts: { id: string; bank_name: string; account_number: string; account_name: string; is_default: boolean; created_at: string }[]
  savings: { id: string; name: string; product_code: string; currency: string; balance: number; target_amount: number | null; rate_bps: number; status: string; maturity_date: string | null; created_at: string }[]
  holdings: { symbol: string; name: string; type: string; currency: string; quantity: string | number; cost_basis: number; price: number | null }[]
  logins: { success: boolean; method: string | null; reason: string | null; ip: string | null; user_agent: string | null; created_at: string }[]
  devices: { name: string | null; platform: string | null; trusted: boolean; biometric_enabled: boolean; last_seen_at: string; created_at: string; revoked_at: string | null }[]
  counts: Record<string, number>
}

export interface CustomerTransaction {
  id: number
  created_at: string
  direction: 'credit' | 'debit'
  amount: number
  balance_after: number
  ref_type: string
  ref_id: string
  currency: string
  reference: string | null
}

export interface StaffMember {
  id: string
  email: string
  name: string
  status: 'active' | 'disabled'
  two_factor: boolean
  must_change_password: boolean
  role: { id: string; name: string }
  last_login_at: string | null
  created_at: string
}

export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  is_system: boolean
  members: number
  updated_at: string
}

export interface PermissionDef {
  key: string
  group: string
  label: string
  description: string
}

export interface BookCheck {
  check: string
  currency: string
  ok: boolean
  expected: number
  actual: number
}

export interface AccountRow {
  account: string
  currency: string
  kind: string
  debits: number
  credits: number
  balance: number
}

export interface AuditEntry {
  id: number
  actor_id: string | null
  actor_role: string | null
  actor: { kind: 'staff' | 'customer' | 'system'; name: string }
  action: string
  /** One plain-English sentence: who did what to whom. */
  summary: string
  /** The person, case, payment… this was done to, by name where we know it. */
  target_label: string | null
  target_type: string | null
  target_id: string | null
  details: { label: string; value: string }[]
  meta: Record<string, unknown>
  ip: string | null
  created_at: string
}

export type JobStatus = 'running' | 'succeeded' | 'failed'

export interface JobRun {
  id: string
  job: string
  trigger: 'schedule' | 'manual'
  status: JobStatus
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  failed_step: string | null
  error: string | null
  started_by_name?: string | null
}

export interface JobStep {
  seq: number
  name: string
  label: string
  status: 'succeeded' | 'failed'
  started_at: string
  duration_ms: number
  detail: unknown
  error: string | null
}

export interface JobRunDetail { run: JobRun & { result: unknown }; steps: JobStep[] }

export interface AmlAlert {
  id: string
  user_id: string | null
  rule: string
  details: Record<string, unknown>
  status: 'open' | 'in_case' | 'resolved' | 'escalated'
  created_at: string
  case_id: string | null
  case_no: string | null
  resolution_note: string | null
  email: string | null
}

export interface AmlCaseRow {
  id: string
  case_no: string
  title: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'under_review' | 'escalated' | 'closed'
  user_id: string | null
  assigned_to: string | null
  assignee_name: string | null
  subject_name: string | null
  subject_email: string | null
  opened_at: string
  review_due_at: string
  closed_at: string | null
  outcome: string | null
  overdue: boolean
  alerts: number
  draft_reports: number
}

export interface AmlReportRow {
  id: string
  case_id: string
  case_no: string
  kind: 'str' | 'ctr'
  status: 'draft' | 'filed' | 'discarded'
  suspected_at: string
  due_at: string
  filed_at: string | null
  regulator_ref: string | null
  filed_late: boolean | null
  amount_total: number
  currency: string | null
  prepared_at: string
  prepared_by_name: string | null
  filed_by_name: string | null
  overdue: boolean
}

export interface AmlSummary {
  open_alerts: number
  open_screening_alerts: number
  oldest_open_alert_hours: number
  open_cases: number
  escalated_cases: number
  overdue_cases: number
  unassigned_cases: number
  draft_reports: number
  overdue_reports: number
  filed_last_30_days: number
  filed_late_last_30_days: number
}

export interface JobPlan {
  job: string
  summary: string
  /** What running it changes: money moved, people notified, data deleted. */
  effect: string
  idempotent: boolean
  steps: { name: string; label: string }[]
  last_run: { id: string; status: JobStatus; started_at: string; duration_ms: number | null; failed_step: string | null; error: string | null } | null
}
