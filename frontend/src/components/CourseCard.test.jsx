import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseCard from './CourseCard'
import { getCourseStatistics } from '../store'

vi.mock('../store', () => ({
  getCourseStatistics: vi.fn(),
}))

const course = {
  id: 'anatomy',
  name: 'Human Anatomy',
  description: 'Gross anatomy',
  color: '#4E9188',
}

describe('CourseCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows due and new badges and opens the course', async () => {
    const user = userEvent.setup()
    const onDetails = vi.fn()
    const onStudy = vi.fn()
    getCourseStatistics.mockResolvedValue({ due: 2, new: 3 })

    render(<CourseCard course={course} onDetails={onDetails} onStudy={onStudy} />)

    expect(await screen.findByText('2 due')).toBeInTheDocument()
    expect(screen.getByText('3 new')).toBeInTheDocument()

    await user.click(screen.getByText('Human Anatomy'))

    expect(onDetails).toHaveBeenCalledWith('anatomy')
  })

  it('starts studying without opening the course', async () => {
    const user = userEvent.setup()
    const onDetails = vi.fn()
    const onStudy = vi.fn()
    getCourseStatistics.mockResolvedValue({ due: 0, new: 1 })

    render(<CourseCard course={course} onDetails={onDetails} onStudy={onStudy} />)
    await screen.findByText('1 new')

    await user.click(screen.getByRole('button', { name: 'Study now' }))

    expect(onStudy).toHaveBeenCalledWith('anatomy')
    expect(onDetails).not.toHaveBeenCalled()
  })

  it('disables study when the course is caught up', async () => {
    getCourseStatistics.mockResolvedValue({ due: 0, new: 0 })

    render(<CourseCard course={course} onDetails={vi.fn()} onStudy={vi.fn()} />)

    expect(await screen.findByText('All caught up!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Study now' })).toBeDisabled()
  })
})
