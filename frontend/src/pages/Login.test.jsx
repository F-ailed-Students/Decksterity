import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import Login from './Login'
import { AuthProvider } from '../context/AuthProvider'

function renderLogin() {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('signs in with the demo account and returns to the dashboard', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText('you@example.com'), 'student@example.com')
    await user.type(screen.getByPlaceholderText('Any password for this demo'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('sr_account_profile'))).toMatchObject({
      email: 'student@example.com',
      role: 'Student',
    })
  })

  it('creates an account in sign-up mode', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Need an account?' }))
    await user.type(screen.getByPlaceholderText('Your name'), 'Ada Lovelace')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('sr_account_profile'))).toMatchObject({
      name: 'Ada Lovelace',
      role: 'Member',
    })
  })
})
