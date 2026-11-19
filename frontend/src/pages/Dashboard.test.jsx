import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { ThemeProvider } from '../context/ThemeProvider'
import { fetchCourses, fetchStats, getCourseStatistics } from '../store'

vi.mock('../store', () => ({
  fetchCourses: vi.fn(),
  fetchStats: vi.fn(),
  getCourseStatistics: vi.fn(),
  invalidateCoursesCache: vi.fn(),
  resetData: vi.fn(),
}))

const course = {
  id: 'anatomy',
  name: 'Human Anatomy',
  description: 'Gross anatomy',
  color: '#4E9188',
}

describe('Dashboard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    fetchStats.mockResolvedValue({ due: 0, new: 0, reviewedToday: 0 })
    getCourseStatistics.mockResolvedValue({ due: 1, new: 0 })
  })

  it('loads and renders courses', async () => {
    fetchCourses.mockResolvedValue([course])

    render(
      <ThemeProvider>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(await screen.findByText('Human Anatomy')).toBeInTheDocument()
    expect(screen.getByText('Your Courses')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear all memory' })).toBeInTheDocument()
  })
})
