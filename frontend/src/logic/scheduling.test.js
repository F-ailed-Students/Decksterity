import { describe, expect, it } from 'vitest'
import {
  MS_PER_DAY,
  applyRating,
  buildStudyQueue,
  countCards,
  getDueTime,
  isDueCard,
  isNewCard,
  toApiRating,
} from './scheduling'

const NOW = Date.UTC(2026, 10, 19, 12)

function card(overrides = {}) {
  return {
    id: 'card-1',
    due: NOW,
    interval: 1,
    ease: 2.5,
    new: false,
    lastReviewed: null,
    ...overrides,
  }
}

describe('card scheduling', () => {
  it('reads due from due or the legacy dueDate field', () => {
    expect(getDueTime(card())).toBe(NOW)
    expect(getDueTime(card({ due: undefined, dueDate: NOW }))).toBe(NOW)
  })

  it('keeps new cards out of the due queue', () => {
    expect(isNewCard(card({ new: true }))).toBe(true)
    expect(isDueCard(card({ new: true }), NOW)).toBe(false)
    expect(isDueCard(card(), NOW)).toBe(true)
    expect(isDueCard(card({ due: NOW + 1 }), NOW)).toBe(false)
  })

  it('counts due, new, and reviewed-today cards', () => {
    const cards = [
      card({ id: 'due', due: NOW }),
      card({ id: 'new', new: true, due: NOW }),
      card({ id: 'future', due: NOW + MS_PER_DAY }),
      card({ id: 'reviewed', due: NOW + MS_PER_DAY, lastReviewed: NOW }),
    ]

    expect(countCards(cards, NOW)).toEqual({
      due: 1,
      new: 1,
      reviewedToday: 1,
    })
  })

  it('resets a card when rated Again', () => {
    const next = applyRating(card({ new: true }), 0, NOW)

    expect(next.ease).toBeCloseTo(2.2, 5)
    expect(next.interval).toBe(1)
    expect(next.new).toBe(false)
    expect(next.due).toBe(NOW + MS_PER_DAY)
    expect(next.lastReviewed).toBe(NOW)
  })

  it('uses the first interval for a new card rated Good', () => {
    const next = applyRating(card({ new: true }), 2, NOW)

    expect(next.interval).toBe(4)
    expect(next.new).toBe(false)
    expect(next.due).toBe(NOW + 4 * MS_PER_DAY)
  })

  it('scales an existing card interval by ease', () => {
    const next = applyRating(card({ interval: 2 }), 3, NOW)

    expect(next.ease).toBeCloseTo(2.65, 5)
    expect(next.interval).toBe(15)
  })

  it('never lowers ease below 1.3', () => {
    const next = applyRating(card({ ease: 1.3 }), 0, NOW)

    expect(next.ease).toBe(1.3)
  })

  it('builds a limited, shuffled queue without duplicate new cards', () => {
    const cards = [
      card({ id: 'due-1', due: 0 }),
      card({ id: 'due-2', due: 0 }),
      card({ id: 'new-1', new: true, due: NOW }),
      card({ id: 'new-2', new: true, due: NOW }),
      card({ id: 'new-3', new: true, due: NOW }),
    ]

    const queue = buildStudyQueue(cards, 4, () => 0)
    const ids = queue.map((item) => item.id)

    expect(queue).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids).toContain('due-1')
    expect(ids).toContain('due-2')
    expect(ids.filter((id) => id.startsWith('new-'))).toHaveLength(2)
  })

  it('returns an empty queue for a non-positive limit', () => {
    expect(buildStudyQueue([card()], 0)).toEqual([])
    expect(buildStudyQueue([card()], -1)).toEqual([])
  })

  it('maps UI ratings to the API scale', () => {
    expect(toApiRating(0)).toBe(1)
    expect(toApiRating(3)).toBe(4)
  })
})
