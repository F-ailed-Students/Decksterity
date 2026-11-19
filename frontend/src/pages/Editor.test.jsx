import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Editor from './Editor'
import { ThemeProvider } from '../context/ThemeProvider'
import { addCard, fetchCourses, fetchStats, getCourse } from '../store'

vi.mock('../store', () => ({
  addCard: vi.fn(),
  fetchCourses: vi.fn(),
  fetchStats: vi.fn(),
  getCourse: vi.fn(),
}))

const course = {
  id: 'anatomy',
  name: 'Human Anatomy',
  description: 'Gross anatomy',
  color: '#4E9188',
}

describe('Editor', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    fetchCourses.mockResolvedValue([course])
    fetchStats.mockResolvedValue({ due: 0, new: 0, reviewedToday: 0 })
    getCourse.mockReturnValue(course)
  })

  it('saves a new card and clears the form', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/courses/anatomy/edit']}>
          <Routes>
            <Route path="/courses/:id/edit" element={<Editor />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(await screen.findByText('Human Anatomy')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Question'), 'What is 2 + 2?')
    await user.type(screen.getByPlaceholderText('Answer'), '4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(addCard).toHaveBeenCalledWith('anatomy', 'What is 2 + 2?', '4')
    expect(screen.getByPlaceholderText('Question')).toHaveValue('')
    expect(screen.getByPlaceholderText('Answer')).toHaveValue('')
  })

  it('requires both sides of the card', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/courses/anatomy/edit']}>
          <Routes>
            <Route path="/courses/:id/edit" element={<Editor />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    await screen.findByText('Human Anatomy')
    const save = screen.getByRole('button', { name: 'Save' })

    expect(save).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Question'), 'What is 2 + 2?')
    expect(save).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Answer'), '4')
    expect(save).toBeEnabled()
  })

  it('shows an error when the course does not exist', async () => {
    getCourse.mockReturnValue(null)

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/courses/missing/edit']}>
          <Routes>
            <Route path="/courses/:id/edit" element={<Editor />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(await screen.findByText(/Course not found/)).toBeInTheDocument()
  })
})
