import { describe, expect, it } from 'vitest'
import type { AppPersistedData } from './catalog'
import { isProductEnabledForEvent } from './inventory'

describe('isProductEnabledForEvent', () => {
  const base = {
    disabledProductsByEvent: {
      ev1: { p2: true }
    }
  } as Pick<AppPersistedData, 'disabledProductsByEvent'>

  it('returns true when not disabled', () => {
    expect(isProductEnabledForEvent(base as AppPersistedData, 'ev1', 'p1')).toBe(true)
  })

  it('returns false when disabled for event', () => {
    expect(isProductEnabledForEvent(base as AppPersistedData, 'ev1', 'p2')).toBe(false)
  })

  it('returns true without event id', () => {
    expect(isProductEnabledForEvent(base as AppPersistedData, null, 'p2')).toBe(true)
  })
})
