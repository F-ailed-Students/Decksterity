import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import { ThemeProvider } from '../context/ThemeProvider'
import { fetchStats } from '../store'

vi.mock('../store', () => ({
  fetchStats: vi.fn(),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.clearAllMocks()
  })

  it('renders aggregate statistics', async () => {
    fetchStats.mockResolvedValue({ due: 2, new: 3, reviewedToday: 4 })

    render(
      <ThemeProvider>
        <Sidebar />
      </ThemeProvider>,
    )

    expect(await screen.findByText('Due today')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('toggles and persists the theme', async () => {
    const user = userEvent.setup()
    fetchStats.mockResolvedValue({ due: 0, new: 0, reviewedToday: 0 })

    render(
      <ThemeProvider>
        <Sidebar />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: /Dark mode/ }))

    expect(screen.getByRole('button', { name: /Light mode/ })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem('sr_theme')).toBe('dark')
  })
})
