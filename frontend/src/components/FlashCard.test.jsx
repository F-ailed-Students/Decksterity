import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FlashCard from './FlashCard'

const card = {
  id: 'card-1',
  front: 'Question text',
  back: 'Answer text',
}

describe('FlashCard', () => {
  it('reveals the answer and reports the selected rating', async () => {
    const user = userEvent.setup()
    const onRate = vi.fn()
    render(<FlashCard card={card} onRate={onRate} />)

    await user.type(screen.getByPlaceholderText('Your answer...'), 'my attempt')
    await user.click(screen.getByRole('button', { name: 'Show Answer' }))

    expect(screen.getByText('my attempt')).toBeInTheDocument()
    expect(screen.getByText('Answer text')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Good/ }))

    expect(onRate).toHaveBeenCalledWith(2, 'my attempt')
    expect(screen.queryByText('Answer text')).not.toBeInTheDocument()
  })

  it('shows a placeholder when no answer was typed', async () => {
    const user = userEvent.setup()
    render(<FlashCard card={card} onRate={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Show Answer' }))

    expect(screen.getByText('(no answer entered)')).toBeInTheDocument()
  })
})
