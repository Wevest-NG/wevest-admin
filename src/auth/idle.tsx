import { useEffect, useRef, useState } from 'react'
import { refreshSession } from '../api/client'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/components'
import { useAuth } from './AuthContext'

const IDLE_LIMIT_MS = 30 * 60_000 // matches STAFF_IDLE_MINUTES on the server
const WARN_BEFORE_MS = 2 * 60_000

/** Signs out after 30 minutes without interaction, warning two minutes before. The server enforces the same limit. */
export function IdleGuard() {
  const { signOut } = useAuth()
  const last = useRef(0)
  const warning = useRef(false)
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    last.current = Date.now()
    // once the warning is up, ordinary movement no longer counts: the person has to choose
    const bump = () => {
      if (!warning.current) last.current = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const t = setInterval(() => {
      const idle = Date.now() - last.current
      if (idle >= IDLE_LIMIT_MS) void signOut()
      else if (idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS) {
        warning.current = true
        setLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000))
      } else {
        warning.current = false
        setLeft(null)
      }
    }, 1000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      clearInterval(t)
    }
  }, [signOut])

  const stay = async () => {
    last.current = Date.now()
    warning.current = false
    setLeft(null)
    await refreshSession()
  }

  return (
    <Dialog
      open={left !== null}
      title="Still there?"
      description={`For your security you will be signed out in ${left ?? 0} seconds.`}
      onClose={() => void stay()}
      footer={
        <>
          <Button variant="secondary" onClick={() => void signOut()}>Sign out now</Button>
          <Button onClick={() => void stay()}>Stay signed in</Button>
        </>
      }
    />
  )
}
