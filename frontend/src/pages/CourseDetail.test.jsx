import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseDetail from './CourseDetail'
import { ThemeProvider } from '../context/ThemeProvider'
import {
  fetchCards,
  fetchCourses,
  fetchStats,
  getCardsByCourse,
  getCourse,
  getDueCards,
  getNewCards,
} from '../store'

vi.mock('../store', () => ({
  fetchCards: vi.fn(),
  fetchCourses: vi.fn(),
  fetchStats: vi.fn(),
  getCardsByCourse: vi.fn(),
  getCourse: vi.fn(),
  getDueCards: vi.fn(),
  getNewCards: vi.fn(),
}))

const course = {
  id: 'anatomy',
  name: 'Human Anatomy',
  description: 'Gross anatomy',
  color: '#4E9188',
}

describe('CourseDetail', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    fetchCourses.mockResolvedValue([course])
    fetchCards.mockResolvedValue([])
    fetchStats.mockResolvedValue({ due: 0, new: 0, reviewedToday: 0 })
    getCourse.mockReturnValue(course)
    getDueCards.mockReturnValue([{ id: '1' }, { id: '2' }])
    getNewCards.mockReturnValue([{ id: '3' }])
    getCardsByCourse.mockReturnValue([{ id: '1' }, { id: '2' }, { id: '3' }])
  })

  it('shows course statistics and starts a study session', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/courses/anatomy']}>
          <Routes>
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/study/:id" element={<div>Study session</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(await screen.findByText('Human Anatomy')).toBeInTheDocument()
    expect(screen.getByText('Cards due')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Start studying (3 cards)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start studying (3 cards)' }))

    expect(screen.getByText('Study session')).toBeInTheDocument()
  })
})
