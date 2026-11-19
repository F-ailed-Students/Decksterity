import { afterEach, describe, expect, it, vi } from 'vitest'
import { dev_makeid } from './utils'

describe('dev_makeid', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the requested number of alphanumeric characters', () => {
    const id = dev_makeid(10)

    expect(id).toHaveLength(10)
    expect(id).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('maps each character from Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(dev_makeid(3)).toBe('AAA')
  })
})
