import { describe, expect, it, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { Login } from './Login'
import { a11yViolations, mockApi, renderWithProviders, staffWith } from '../test/utils'

afterEach(() => vi.unstubAllGlobals())
const page = () => <Routes><Route path="/login" element={<Login />} /><Route path="/" element={<p>dashboard home</p>} /></Routes>
const anon = { 'POST /v1/staff/auth/refresh': () => ({ status: 401, body: {} }) }

describe('sign in', () => {
  it('asks for the authenticator code after the password, then opens the dashboard', async () => {
    const m = mockApi({
      ...anon,
      'POST /v1/staff/auth/login': () => ({ body: { status: 'mfa_required', mfa_token: 'mfa-1' } }),
      'POST /v1/staff/auth/mfa': ({ headers }) => (headers.get('authorization') === 'Bearer mfa-1' ? { body: { access_token: 't', expires_in: 900, staff: staffWith(['*']) } } : { status: 401, body: {} }),
    })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/login' })
    await user.type(await screen.findByLabelText('Work email'), 'a@wevest.app')
    await user.type(screen.getByLabelText('Password'), 'Correct-Horse-9')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(await screen.findByLabelText('Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    expect(await screen.findByText('dashboard home')).toBeInTheDocument()
    expect(m.calls.find((c) => c.url === '/v1/staff/auth/login')?.body).toEqual({ email: 'a@wevest.app', password: 'Correct-Horse-9' })
  })

  it('shows the server\'s message for wrong credentials and keeps the person on the form', async () => {
    mockApi({ ...anon, 'POST /v1/staff/auth/login': () => ({ status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } } }) })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/login' })
    await user.type(await screen.findByLabelText('Work email'), 'a@wevest.app')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password')
    expect(screen.getByLabelText('Work email')).toBeInTheDocument()
  })

  it('walks a first-time user through a new password and an authenticator, and makes them save recovery codes', async () => {
    const m = mockApi({
      ...anon,
      'POST /v1/staff/auth/login': () => ({ body: { status: 'setup_required', setup_token: 'setup-1', must_change_password: true, totp_required: true } }),
      'POST /v1/staff/auth/setup/password': () => ({ body: { ok: true } }),
      'POST /v1/staff/auth/setup/totp': () => ({ body: { secret: 'JBSWY3DPEHPK3PXP', otpauth_url: 'otpauth://totp/Wevest:a@wevest.app?secret=JBSWY3DPEHPK3PXP' } }),
      'POST /v1/staff/auth/setup/totp/confirm': () => ({ body: { access_token: 't', expires_in: 900, staff: staffWith(['*']), recovery_codes: ['abcd-efgh', 'jkmn-pqrs'] } }),
    })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/login' })
    await user.type(await screen.findByLabelText('Work email'), 'new@wevest.app')
    await user.type(screen.getByLabelText('Password'), 'Temporary-Pass-1')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.type(await screen.findByLabelText('New password'), 'Brand-New-Passw0rd')
    await user.type(screen.getByLabelText('Repeat new password'), 'Brand-New-Passw0rd')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(m.calls.find((c) => c.url.endsWith('/setup/password'))?.body).toEqual({ current_password: 'Temporary-Pass-1', new_password: 'Brand-New-Passw0rd' })

    expect(await screen.findByText(/JBSWY3DPEHPK3PXP/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on two-step verification' }))

    // recovery codes are shown once and must be acknowledged before continuing
    expect(await screen.findByText('abcd-efgh')).toBeInTheDocument()
    const open = screen.getByRole('button', { name: 'Open the dashboard' })
    expect(open).toBeDisabled()
    await user.click(screen.getByLabelText('I have saved these codes'))
    expect(open).toBeEnabled()
    await user.click(open)
    await waitFor(() => expect(screen.getByText('dashboard home')).toBeInTheDocument())
  })

  it('does not let mismatched new passwords through', async () => {
    mockApi({ ...anon, 'POST /v1/staff/auth/login': () => ({ body: { status: 'setup_required', setup_token: 's', must_change_password: true, totp_required: true } }) })
    const user = userEvent.setup()
    renderWithProviders(page(), { route: '/login' })
    await user.type(await screen.findByLabelText('Work email'), 'x@wevest.app')
    await user.type(screen.getByLabelText('Password'), 'Temporary-Pass-1')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(await screen.findByLabelText('New password'), 'Brand-New-Passw0rd')
    await user.type(screen.getByLabelText('Repeat new password'), 'Different-Passw0rd')
    expect(screen.getByText('The passwords do not match')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled()
  })

  it('has no automatically detectable accessibility problems', async () => {
    mockApi(anon)
    const { container } = renderWithProviders(page(), { route: '/login' })
    await screen.findByLabelText('Work email')
    expect(await a11yViolations(container)).toEqual([])
  })
})
