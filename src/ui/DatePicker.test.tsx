import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateField, DateTimeField } from './DatePicker'
import { Dialog } from './Dialog'
import { lagosToday } from '../lib/format'
import { a11yViolations } from '../test/utils'

function Demo({ initial = '2026-10-15', onValue, ...rest }: { initial?: string; onValue?: (v: string) => void; min?: string; max?: string; required?: boolean }) {
  const [v, setV] = useState(initial)
  return <DateField label="Ex-dividend date" value={v} onChange={(e) => { setV(e.target.value); onValue?.(e.target.value) }} {...rest} />
}
const trigger = () => screen.getByRole('button', { name: 'Ex-dividend date' })
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`)!

describe('date picker', () => {
  it('shows the date the way people read it, or a prompt when empty', () => {
    const { unmount } = render(<Demo initial="2026-10-31" />)
    expect(trigger()).toHaveTextContent('31 Oct 2026')
    unmount()
    render(<Demo initial="" />)
    expect(trigger()).toHaveTextContent('Select a date')
  })

  it('opens a calendar on the chosen day, and clicking a day picks it and returns focus', async () => {
    const seen = vi.fn(); const user = userEvent.setup()
    render(<Demo onValue={seen} />)
    await user.click(trigger())
    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument()
    expect(day('2026-10-15')).toHaveFocus()
    expect(day('2026-10-15')).toHaveAccessibleName('Thursday 15 October 2026')
    await user.click(day('2026-10-22'))
    expect(seen).toHaveBeenCalledWith('2026-10-22')
    expect(trigger()).toHaveTextContent('22 Oct 2026')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('is fully keyboard operable: arrows, week ends, months, years, Enter', async () => {
    const user = userEvent.setup()
    render(<Demo initial="2026-10-15" />) // a Thursday
    await user.click(trigger())
    await user.keyboard('{ArrowRight}'); expect(day('2026-10-16')).toHaveFocus()
    await user.keyboard('{ArrowDown}'); expect(day('2026-10-23')).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowUp}'); expect(day('2026-10-15')).toHaveFocus()
    await user.keyboard('{Home}'); expect(day('2026-10-12')).toHaveFocus() // Monday
    await user.keyboard('{End}'); expect(day('2026-10-18')).toHaveFocus() // Sunday
    await user.keyboard('{PageDown}'); expect(day('2026-11-18')).toHaveFocus()
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument() // the calendar follows
    await user.keyboard('{Shift>}{PageUp}{/Shift}'); expect(day('2025-11-18')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(trigger()).toHaveTextContent('18 Nov 2025')
  })

  it('will not choose a day outside the limits, but still lets you move across it', async () => {
    const seen = vi.fn(); const user = userEvent.setup()
    render(<Demo initial="2026-10-15" min="2026-10-10" max="2026-10-20" onValue={seen} />)
    await user.click(trigger())
    expect(day('2026-10-09')).toHaveAttribute('aria-disabled', 'true')
    expect(day('2026-10-21')).toHaveAttribute('aria-disabled', 'true')
    await user.click(day('2026-10-21'))
    expect(seen).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument() // still open
    await user.click(day('2026-10-20'))
    expect(seen).toHaveBeenCalledWith('2026-10-20')
  })

  it('jumps by month and year from the title', async () => {
    const user = userEvent.setup()
    render(<Demo initial="2026-10-15" />)
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /choose month and year/ }))
    await user.click(screen.getByRole('button', { name: 'Mar' }))
    expect(screen.getByRole('grid', { name: 'March 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /choose month and year/ }))
    await user.click(screen.getByRole('button', { name: /choose year/ }))
    await user.click(screen.getByRole('button', { name: '2030' }))
    await user.click(screen.getByRole('button', { name: 'Jan' }))
    expect(screen.getByRole('grid', { name: 'January 2030' })).toBeInTheDocument()
  })

  it('has Today and Clear (Clear only when the field is optional)', async () => {
    const seen = vi.fn(); const user = userEvent.setup()
    const { unmount } = render(<Demo onValue={seen} />)
    await user.click(trigger()); await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(seen).toHaveBeenLastCalledWith(lagosToday())
    await user.click(trigger()); await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(seen).toHaveBeenLastCalledWith('')
    expect(trigger()).toHaveTextContent('Select a date')
    unmount()
    render(<Demo required />)
    await user.click(trigger())
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('closes on Escape and on an outside click, changing nothing', async () => {
    const seen = vi.fn(); const user = userEvent.setup()
    render(<><Demo onValue={seen} /><button>elsewhere</button></>)
    await user.click(trigger()); await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger()).toHaveFocus()
    await user.click(trigger()); await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(seen).not.toHaveBeenCalled()
  })

  it('inside a modal dialog it lives in the dialog, and Escape closes only the calendar', async () => {
    const onClose = vi.fn(); const user = userEvent.setup()
    render(<Dialog open title="Request a dividend" onClose={onClose}><Demo /></Dialog>)
    await user.click(trigger())
    expect(screen.getByRole('dialog', { name: 'Request a dividend' })).toContainElement(screen.getByRole('dialog', { name: 'Choose a date' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Choose a date' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the open calendar', async () => {
    const user = userEvent.setup()
    render(<Demo />)
    await user.click(trigger())
    const cal = screen.getByRole('dialog', { name: 'Choose a date' })
    for (let i = 0; i < 8; i++) await user.tab()
    expect(cal).toContainElement(document.activeElement as HTMLElement)
  })

  it('has no automatically detectable accessibility problems, open or closed', async () => {
    const user = userEvent.setup()
    const { container } = render(<Demo />)
    expect(await a11yViolations(container)).toEqual([])
    await user.click(trigger())
    expect(await a11yViolations(document.body)).toEqual([])
  })
})

describe('date and time field', () => {
  function Dt({ onValue }: { onValue: (v: string) => void }) {
    const [v, setV] = useState('')
    return <DateTimeField label="When did suspicion form?" value={v} onChange={(e) => { setV(e.target.value); onValue(e.target.value) }} />
  }

  it('needs a date before the time can be set, then gives "YYYY-MM-DDTHH:mm"', async () => {
    const seen = vi.fn(); const user = userEvent.setup()
    render(<Dt onValue={seen} />)
    expect(screen.getByRole('combobox', { name: 'Hour' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'When did suspicion form?' }))
    await user.click(document.querySelector<HTMLButtonElement>(`[data-date="${lagosToday()}"]`)!)
    expect(seen.mock.lastCall?.[0]).toMatch(new RegExp(`^${lagosToday()}T\\d{2}:\\d{2}$`)) // time defaults to now
    await user.click(screen.getByRole('combobox', { name: 'Hour' })); await user.click(screen.getByRole('option', { name: '14' }))
    await user.click(screen.getByRole('combobox', { name: 'Minute' })); await user.click(screen.getByRole('option', { name: '05' }))
    expect(seen.mock.lastCall?.[0]).toBe(`${lagosToday()}T14:05`)
    await user.click(screen.getByRole('button', { name: 'When did suspicion form?' })); await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(seen.mock.lastCall?.[0]).toBe('')
    expect(screen.getByRole('combobox', { name: 'Hour' })).toBeDisabled()
  })
})
