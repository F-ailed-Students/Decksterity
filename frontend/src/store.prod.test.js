import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('prod store', () => {
  let store

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('DEV', false)
    vi.clearAllMocks()
    store = await import('./store')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('loads decks and deduplicates concurrent requests', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'default', name: 'Default' }] })

    const first = store.fetchCourses()
    const second = store.fetchCourses()

    await expect(first).resolves.toEqual([{ id: 'default', name: 'Default' }])
    await expect(second).resolves.toEqual([{ id: 'default', name: 'Default' }])
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('deduplicates card requests per course', async () => {
    api.get.mockImplementation((url) => {
      const courseId = url.split('/')[2]
      return Promise.resolve({ data: [{ courseId }] })
    })

    const [first, duplicate, second] = await Promise.all([
      store.fetchCards('a'),
      store.fetchCards('a'),
      store.fetchCards('b'),
    ])

    expect(first).toEqual([{ courseId: 'a' }])
    expect(duplicate).toEqual([{ courseId: 'a' }])
    expect(second).toEqual([{ courseId: 'b' }])
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('unwraps course statistics responses', async () => {
    api.get.mockResolvedValue({ data: { due: 2, new: 3 } })

    await expect(store.getCourseStatistics({ id: 'anatomy' })).resolves.toEqual({
      due: 2,
      new: 3,
    })
  })

  it('sends reviews on the API rating scale', () => {
    store.rateCard('anatomy', 7, 2)

    expect(api.post).toHaveBeenCalledWith('review', {
      deck_id: 'anatomy',
      card_id: 7,
      rating: 3,
    })
  })

  it('returns unwrapped aggregate statistics', async () => {
    api.get.mockResolvedValue({ data: { due: 1, new: 2, reviewedToday: 3 } })

    await expect(store.fetchStats()).resolves.toEqual({
      due: 1,
      new: 2,
      reviewedToday: 3,
    })
  })

  it('wraps deck errors with context', async () => {
    api.get.mockRejectedValue({
      response: { status: 500, data: { detail: 'database offline' } },
    })

    await expect(store.fetchCourses()).rejects.toThrow(
      'Failed to load decks: 500 database offline',
    )
  })
})
