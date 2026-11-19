import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import AccountMenu from './AccountMenu'
import { AuthProvider } from '../context/AuthProvider'

describe('AccountMenu', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('links to the login page', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AccountMenu />} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('shows the signed-in account name', () => {
    localStorage.setItem('sr_account_profile', JSON.stringify({ name: 'Ada Lovelace' }))

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <AccountMenu />
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toBeInTheDocument()
  })
})
