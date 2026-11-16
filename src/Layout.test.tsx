import { describe, expect, it, afterEach, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { renderWithProviders, signedIn, staffWith } from './test/utils'

afterEach(() => vi.unstubAllGlobals())
const app = () => <Routes><Route element={<Layout />}><Route index element={<p>home</p>} /></Route></Routes>

describe('navigation', () => {
  it('shows each person only the areas their role holds', async () => {
    signedIn(staffWith(['users.read', 'support.manage'], 'Support'))
    renderWithProviders(app())
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: /Customers/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Approvals/ })).toBeInTheDocument()
    for (const hidden of [/Books/, /Payments/, /AML/, /Audit log/, /Staff/, /Roles/, /Jobs/, /Configuration/]) expect(within(nav).queryByRole('link', { name: hidden })).not.toBeInTheDocument()
  })

  it('shows everything to a Super Admin', async () => {
    signedIn(staffWith(['*'], 'Super Admin'))
    renderWithProviders(app())
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' })
    for (const name of [/Customers/, /KYC reviews/, /Payments/, /Books/, /Investments/, /AML/, /Audit log/, /Staff/, /Roles/, /Configuration/, /Jobs/]) expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
  })

  it('badges approvals waiting for you and has a skip link and a main landmark', async () => {
    signedIn(staffWith(['users.read']), { 'GET /v1/admin/approvals/summary': () => ({ body: { waiting_for_you: 3, your_open_requests: 0 } }) })
    renderWithProviders(app())
    expect(await screen.findByLabelText('3 waiting for you')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
