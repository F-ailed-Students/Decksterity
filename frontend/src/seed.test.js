import { describe, expect, it } from 'vitest'
import { seedCards, seedCourses } from './seed'

describe('seed data', () => {
  it('has unique course ids', () => {
    const ids = seedCourses.map((course) => course.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('links every card to a seeded course', () => {
    const courseIds = new Set(seedCourses.map((course) => course.id))

    for (const card of seedCards) {
      expect(courseIds.has(card.courseId)).toBe(true)
    }
  })

  it('has unique card ids and non-empty content', () => {
    const ids = seedCards.map((card) => card.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (const card of seedCards) {
      expect(card.front.trim()).not.toBe('')
      expect(card.back.trim()).not.toBe('')
    }
  })

  it('provides the scheduling fields used by the store', () => {
    for (const card of seedCards) {
      expect(typeof card.interval).toBe('number')
      expect(typeof card.ease).toBe('number')
      expect(typeof card.new).toBe('boolean')
    }
  })
})
