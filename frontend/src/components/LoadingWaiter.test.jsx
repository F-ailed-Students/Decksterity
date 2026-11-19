import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LoadingWaiter from './LoadingWaiter'

describe('LoadingWaiter', () => {
  it('renders loading text while loading', () => {
    render(<LoadingWaiter loading>content</LoadingWaiter>)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders the error when loading has failed', () => {
    render(<LoadingWaiter error="Could not load">content</LoadingWaiter>)

    expect(screen.getByText('⚠ Could not load')).toBeInTheDocument()
  })

  it('renders children when ready', () => {
    render(<LoadingWaiter loading={false}>content</LoadingWaiter>)

    expect(screen.getByText('content')).toBeInTheDocument()
  })
})
