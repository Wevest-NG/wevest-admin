import type { ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import { useAuth } from './AuthContext'
import { EmptyState } from '../ui/components'

/** Renders children only when the signed-in role holds the permission. Use for buttons and panels. */
export function Can({ perm, any, children, fallback = null }: { perm?: string; any?: string[]; children: ReactNode; fallback?: ReactNode }) {
  const { can, canAny } = useAuth()
  const ok = perm ? can(perm) : any ? canAny(...any) : true
  return <>{ok ? children : fallback}</>
}

/** Guards a whole page. The server enforces the same rule; this just avoids showing a screen that cannot work. */
export function RequirePerm({ perm, any, children }: { perm?: string; any?: string[]; children: ReactNode }) {
  const { can, canAny } = useAuth()
  const ok = perm ? can(perm) : any ? canAny(...any) : true
  if (ok) return <>{children}</>
  return (
    <div className="card">
      <EmptyState title="Your role does not include this area" icon={<LockKeyhole size={36} aria-hidden />}>
        Ask a Super Admin if you need access{perm ? ` (${perm})` : ''}.
      </EmptyState>
    </div>
  )
}
