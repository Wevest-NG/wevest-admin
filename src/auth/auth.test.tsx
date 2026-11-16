import { describe, expect, it, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { hasPermission } from './AuthContext'
import { Can, RequirePerm } from './Can'
import { renderWithProviders, signedIn, staffWith } from '../test/utils'

afterEach(() => vi.unstubAllGlobals())

describe('permissions', () => {
  it('treats * as everything and otherwise needs the exact key', () => {
    expect(hasPermission(['*'], 'anything.at.all')).toBe(true)
    expect(hasPermission(['users.read'], 'users.read')).toBe(true)
    expect(hasPermission(['users.read'], 'users.freeze')).toBe(false)
    expect(hasPermission([], 'users.read')).toBe(false)
  })

  it('shows a control only to roles that hold the permission', async () => {
    signedIn(staffWith(['users.freeze']))
    renderWithProviders(<><Can perm="users.freeze"><button>Request freeze</button></Can><Can perm="payments.routing"><button>Change routing</button></Can></>)
    expect(await screen.findByRole('button', { name: 'Request freeze' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change routing' })).not.toBeInTheDocument()
  })

  it('accepts any of several permissions', async () => {
    signedIn(staffWith(['content.manage']))
    renderWithProviders(<Can any={['config.manage', 'content.manage']}><p>configuration</p></Can>)
    expect(await screen.findByText('configuration')).toBeInTheDocument()
  })

  it('explains, rather than hiding, a page the role cannot open', async () => {
    signedIn(staffWith(['users.read']))
    renderWithProviders(<RequirePerm perm="books.read"><p>secret books</p></RequirePerm>)
    expect(await screen.findByText(/does not include this area/i)).toBeInTheDocument()
    expect(screen.queryByText('secret books')).not.toBeInTheDocument()
  })

  it('lets a Super Admin through everywhere', async () => {
    signedIn(staffWith(['*'], 'Super Admin'))
    renderWithProviders(<RequirePerm perm="books.read"><p>the books</p></RequirePerm>)
    expect(await screen.findByText('the books')).toBeInTheDocument()
  })
})
