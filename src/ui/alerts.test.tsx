import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useConfirm, useToast, type AlertOptions, type AlertTone } from './Toasts'
import { a11yViolations } from '../test/utils'

function Push({ message = 'Saved.', tone, options }: { message?: string; tone?: AlertTone; options?: AlertOptions }) {
  const toast = useToast()
  return <button onClick={() => toast(message, tone, options)}>push {message}</button>
}

afterEach(() => vi.useRealTimers())

describe('alerts', () => {
  it('shows a titled message and is polite for good news, assertive for bad', async () => {
    const user = userEvent.setup()
    render(<ToastProvider><Push message="Role saved." tone="success" /><Push message="Could not reach the bank." tone="danger" /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: 'push Role saved.' }))
    await user.click(screen.getByRole('button', { name: 'push Could not reach the bank.' }))
    const ok = screen.getByText('Role saved.').closest('.alert')!; const bad = screen.getByText('Could not reach the bank.').closest('.alert')!
    expect(ok).toHaveAttribute('role', 'status'); expect(ok).toHaveTextContent('Done')
    expect(bad).toHaveAttribute('role', 'alert'); expect(bad).toHaveTextContent('That did not work')
  })

  it('can be dismissed by hand, and runs its action once', async () => {
    const user = userEvent.setup(); const view = vi.fn()
    render(<ToastProvider><Push message="Case opened." tone="success" options={{ title: 'Case opened', action: { label: 'View case', onClick: view } }} /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: /push/ }))
    await user.click(screen.getByRole('button', { name: 'View case' }))
    expect(view).toHaveBeenCalledOnce()
    expect(screen.queryByText('Case opened.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /push/ }))
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Case opened.')).not.toBeInTheDocument()
  })

  it('goes away on its own, but waits while the mouse is over it', () => {
    vi.useFakeTimers()
    render(<ToastProvider><Push message="Gone soon." tone="info" options={{ duration: 1000 }} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /push/ }))
    const card = screen.getByText('Gone soon.').closest('.alert')!
    fireEvent.mouseEnter(card)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('Gone soon.')).toBeInTheDocument() // paused
    fireEvent.mouseLeave(card)
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByText('Gone soon.')).not.toBeInTheDocument()
  })

  it('keeps only the latest four on screen', async () => {
    const user = userEvent.setup()
    function Many() { const toast = useToast(); return <button onClick={() => { for (let i = 1; i <= 6; i++) toast(`message ${i}`, 'info') }}>go</button> }
    render(<ToastProvider><Many /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: 'go' }))
    expect(screen.getAllByRole('status')).toHaveLength(4)
    expect(screen.queryByText('message 1')).not.toBeInTheDocument(); expect(screen.getByText('message 6')).toBeInTheDocument()
  })

  it('has no automatically detectable accessibility problems', async () => {
    const user = userEvent.setup()
    render(<ToastProvider><Push message="Heads up." tone="warning" /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: /push/ }))
    expect(await a11yViolations(document.body)).toEqual([])
  })
})

describe('confirmation', () => {
  function Ask({ tone }: { tone?: 'danger' | 'primary' }) {
    const confirm = useConfirm(); const [answer, setAnswer] = useState('none')
    return <><button onClick={async () => setAnswer((await confirm({ title: 'Delete the role?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone })) ? 'yes' : 'no')}>ask</button><output>{answer}</output></>
  }

  it('resolves true when confirmed', async () => {
    const user = userEvent.setup()
    render(<ToastProvider><Ask tone="danger" /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: 'ask' }))
    expect(screen.getByRole('dialog', { name: 'Delete the role?' })).toHaveTextContent('This cannot be undone.')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('yes')).toBeInTheDocument()
  })

  it('resolves false on cancel and on closing the dialog', async () => {
    const user = userEvent.setup()
    render(<ToastProvider><Ask /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: 'ask' })); await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('no')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ask' })); await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(await screen.findByText('no')).toBeInTheDocument()
  })
})
