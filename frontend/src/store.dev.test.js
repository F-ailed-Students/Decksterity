import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedCards, seedCourses } from './seed'

function createMemoryStorage() {
  const values = new Map()

  return {
    clear: () => values.clear(),
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}

describe('dev store', () => {
  let store

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('DEV', true)
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.spyOn(console, 'log').mockImplementation(() => {})
    store = await import('./store')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('loads seed courses', async () => {
    const courses = await store.fetchCourses()

    expect(courses.map((course) => course.id)).toEqual(['anatomy', 'pharmaco', 'pathology'])
    expect(store.getCourse('anatomy').name).toBe('Human Anatomy')
  })

  it('loads cards for one course', async () => {
    const cards = await store.fetchCards('anatomy')

    expect(cards).toHaveLength(7)
    expect(cards.every((card) => card.courseId === 'anatomy')).toBe(true)
    expect(store.getCardsByCourse('anatomy')).toBe(cards)
  })

  it('returns new cards from the seed data', async () => {
    await store.fetchCards('anatomy')

    expect(store.getNewCards('anatomy')).toHaveLength(4)
  })

  it('reads the legacy dueDate field for due cards', async () => {
    await store.fetchCards('anatomy')

    expect(store.getDueCards('anatomy')).toHaveLength(2)
  })

  it('builds dev statistics from the course cards', async () => {
    const stats = await store.getCourseStatistics({ id: 'anatomy' })

    expect(stats).toEqual({ due: 2, new: 4, reviewedToday: 0 })
  })

  it('writes new cards to localStorage', async () => {
    await store.fetchCards('anatomy')

    store.addCard('anatomy', 'Question', 'Answer')

    const saved = JSON.parse(localStorage.getItem('sr_cards'))
    const added = saved.at(-1)

    expect(saved).toHaveLength(seedCards.length + 1)
    expect(added).toMatchObject({
      courseId: 'anatomy',
      front: 'Question',
      back: 'Answer',
      new: true,
    })
    expect(typeof added.due).toBe('number')

    await store.fetchCards('anatomy')
    expect(store.getNewCards('anatomy')).toHaveLength(5)
    expect(store.getDueCards('anatomy')).toHaveLength(2)
  })

  it('rates a card and persists the new schedule', async () => {
    await store.fetchCards('anatomy')

    store.rateCard('anatomy', 'a1', 0)

    const saved = JSON.parse(localStorage.getItem('sr_cards'))
    const rated = saved.find((card) => card.id === 'a1')

    expect(rated.ease).toBeCloseTo(2.2, 5)
    expect(rated.interval).toBe(1)
    expect(rated.new).toBe(false)
    expect(rated.due).toBeGreaterThan(Date.now())
  })

  it('counts reviewed cards in dev statistics', async () => {
    await store.fetchCards('anatomy')
    store.rateCard('anatomy', 'a1', 2)

    const stats = await store.getCourseStatistics({ id: 'anatomy' })

    expect(stats).toEqual({ due: 2, new: 3, reviewedToday: 1 })
  })

  it('reports aggregate dev statistics', async () => {
    await store.fetchCourses()

    const stats = await store.fetchStats()

    expect(stats).toEqual({ due: 6, new: 11, reviewedToday: 0 })
  })

  it('resets localStorage to the seed data', async () => {
    store.resetData()

    expect(JSON.parse(localStorage.getItem('sr_courses'))).toHaveLength(seedCourses.length)
    expect(JSON.parse(localStorage.getItem('sr_cards'))).toHaveLength(seedCards.length)
  })
})
