import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Error404 from './Error404'

describe('Error404', () => {
  it('returns to the dashboard', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <Routes>
          <Route path="/missing" element={<Error404 />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('404 Not Found')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return' }))

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
