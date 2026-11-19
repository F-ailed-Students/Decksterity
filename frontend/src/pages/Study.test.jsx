import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Study from './Study'
import { ThemeProvider } from '../context/ThemeProvider'
import {
  fetchCards,
  fetchCourses,
  getCardsByCourse,
  getCourse,
  rateCard,
} from '../store'

vi.mock('../store', () => ({
  fetchCards: vi.fn(),
  fetchCourses: vi.fn(),
  getCardsByCourse: vi.fn(),
  getCourse: vi.fn(),
  rateCard: vi.fn(),
}))

const course = {
  id: 'anatomy',
  name: 'Human Anatomy',
  description: 'Gross anatomy',
  color: '#4E9188',
}

const card = {
  id: 'card-1',
  courseId: 'anatomy',
  front: 'Question text',
  back: 'Answer text',
  due: 0,
  interval: 1,
  ease: 2.5,
  new: false,
  lastReviewed: null,
}

describe('Study', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    fetchCourses.mockResolvedValue([course])
    fetchCards.mockResolvedValue([card])
    getCourse.mockReturnValue(course)
    getCardsByCourse.mockReturnValue([card])
  })

  it('rates a card and shows the completed session', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/study/anatomy']}>
          <Routes>
            <Route path="/study/:id" element={<Study />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(await screen.findByText('Question text')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show Answer' }))
    await user.click(screen.getByRole('button', { name: /Good/ }))

    expect(rateCard).toHaveBeenCalledWith('anatomy', 'card-1', 2)
    expect(await screen.findByText('Session complete!')).toBeInTheDocument()
    expect(screen.getByText('1', { selector: '.done-stat-value' })).toBeInTheDocument()
  })
})
