import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import type { Accepted } from '../api/types'
import { useToast } from '../ui/Toasts'

/**
 * Sensitive actions do not run when requested: the server queues them for a second person (HTTP 202).
 * This runs a request, tells the user plainly that it is waiting for approval, and refreshes the approvals badge.
 */
export function useGated() {
  const toast = useToast()
  const qc = useQueryClient()
  return useCallback(
    async (run: () => Promise<Accepted>): Promise<boolean> => {
      try {
        const r = await run()
        toast(`${r.approval.summary} Nothing changes until a second person approves.`, 'success', { title: 'Sent for approval' })
        void qc.invalidateQueries({ queryKey: ['approvals'] })
        return true
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not send the request', 'danger')
        return false
      }
    },
    [toast, qc],
  )
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
}
