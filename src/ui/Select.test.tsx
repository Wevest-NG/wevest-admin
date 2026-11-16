import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectField } from './forms'
import { Dialog } from './Dialog'
import { a11yViolations } from '../test/utils'

function Demo({ onValue }: { onValue?: (v: string) => void }) {
  const [v, setV] = useState('medium')
  return (
    <SelectField label="Priority" value={v} onChange={(e) => { setV(e.target.value); onValue?.(e.target.value) }}>
      <option value="low">Low (14 days)</option>
      <option value="medium">Medium (7 days)</option>
      <option value="high" disabled>High (72 hours)</option>
      <option value="critical">Critical (24 hours)</option>
      <option value="plan">Planned</option>
    </SelectField>
  )
}
const trigger = () => screen.getByRole('combobox', { name: 'Priority' })

describe('custom dropdown', () => {
  it('is a labelled combobox showing the current choice, closed by default', () => {
    render(<Demo />)
    expect(trigger()).toHaveTextContent('Medium (7 days)')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens on click, marks the current option, and choosing one updates the value and returns focus', async () => {
    const seen = vi.fn(); const user = userEvent.setup()
    render(<Demo onValue={seen} />)
    await user.click(trigger())
    const list = screen.getByRole('listbox')
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(within(list).getByRole('option', { name: /Medium/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(list).getByRole('option', { name: /Critical/ }))
    expect(seen).toHaveBeenCalledWith('critical')
    expect(trigger()).toHaveTextContent('Critical (24 hours)')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('works from the keyboard: arrows skip disabled options, Enter chooses, Escape cancels', async () => {
    const user = userEvent.setup()
    render(<Demo />)
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{ArrowDown}') // medium -> (high is disabled) -> critical
    expect(trigger().getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Critical/ }).id)
    await user.keyboard('{Enter}')
    expect(trigger()).toHaveTextContent('Critical')

    await user.keyboard('{ArrowUp}{Home}{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveTextContent('Critical') // Escape changed nothing

    await user.keyboard('{End}{Enter}')
    expect(trigger()).toHaveTextContent('Planned')
  })

  it('jumps by typing, like a native select', async () => {
    const user = userEvent.setup()
    render(<Demo />)
    trigger().focus()
    await user.keyboard('p') // closed: selects the matching option without opening? it opens and highlights
    await user.keyboard('{Enter}')
    expect(trigger()).toHaveTextContent('Planned')
  })

  it('closes when you click elsewhere', async () => {
    const user = userEvent.setup()
    render(<><Demo /><button>elsewhere</button></>)
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does not open when disabled', async () => {
    const user = userEvent.setup()
    render(<SelectField label="Locked" value="a" disabled><option value="a">A</option><option value="b">B</option></SelectField>)
    await user.click(screen.getByRole('combobox', { name: 'Locked' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('inside a dialog the list lives in the dialog, and Escape closes only the list', async () => {
    const onClose = vi.fn(); const user = userEvent.setup()
    render(<Dialog open title="Open a case" onClose={onClose}><Demo /></Dialog>)
    await user.click(trigger())
    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(screen.getByRole('listbox'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(trigger()).toHaveFocus()
  })

  it('has no automatically detectable accessibility problems, open or closed', async () => {
    const user = userEvent.setup()
    const { container } = render(<Demo />)
    expect(await a11yViolations(container)).toEqual([])
    await user.click(trigger())
    expect(await a11yViolations(document.body)).toEqual([])
  })
})
