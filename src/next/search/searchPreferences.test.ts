import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SEARCH_PREFERENCES, PAGINATION_CAPACITY_PAGES, decodeSearchPreferences, getSearchPreferences, isPositiveInteger,
  setSearchPreferences,
} from './searchPreferences'

describe('search preferences', () => {
  const original = (globalThis as any).electronStore
  let stored: unknown
  let set: ReturnType<typeof vi.fn>

  beforeEach(() => {
    stored = undefined
    set = vi.fn(async () => true)
    ;(globalThis as any).electronStore = { get: vi.fn(async () => ({ searchPreferences: stored })), set }
  })
  afterEach(() => { (globalThis as any).electronStore = original })

  it('has the specified initial defaults', () => {
    expect(DEFAULT_SEARCH_PREFERENCES.defaultSort).toBe('chronological')
    expect(DEFAULT_SEARCH_PREFERENCES.defaultPresentation).toBe('scroll')
    expect(DEFAULT_SEARCH_PREFERENCES.resultLimit).toBe(5_000)
    expect(DEFAULT_SEARCH_PREFERENCES.scroll).toMatchObject({ batchSize: 50, prefetchBatches: 3 })
    expect(DEFAULT_SEARCH_PREFERENCES.pagination.capacity).toBe('standard')
    expect(PAGINATION_CAPACITY_PAGES).toMatchObject({ standard: 99, extended: 999 })
    expect(PAGINATION_CAPACITY_PAGES.unlimited).toBe(Number.POSITIVE_INFINITY)
    expect(DEFAULT_SEARCH_PREFERENCES.pagination).toMatchObject({ arrowClick: 'direct', pageClick: 'direct', keyboard: 'direct' })
  })

  it('accepts only positive integers for quantities', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined]) expect(isPositiveInteger(bad)).toBe(false)
    expect(isPositiveInteger(1)).toBe(true)
    const decoded = decodeSearchPreferences({ resultLimit: 0, scroll: { batchSize: -5, prefetchBatches: 2.5 }, pagination: { fixedPageSize: 0, prefetchPages: 4 } })
    expect(decoded.resultLimit).toBe(5_000)
    expect(decoded.scroll.batchSize).toBe(50)
    expect(decoded.scroll.prefetchBatches).toBe(3)
    expect(decoded.pagination.fixedPageSize).toBe(50)
    expect(decoded.pagination.prefetchPages).toBe(4)
  })

  it('falls back per field, not wholesale, for unrecognised values', () => {
    const decoded = decodeSearchPreferences({ defaultSort: 'nonsense', defaultPresentation: 'pagination', pagination: { capacity: 'extended', keyboard: 'select-first', arrowClick: 'wat' } })
    expect(decoded.defaultSort).toBe('chronological')
    expect(decoded.defaultPresentation).toBe('pagination')
    expect(decoded.pagination).toMatchObject({ capacity: 'extended', keyboard: 'select-first', arrowClick: 'direct' })
    expect(decodeSearchPreferences('garbage')).toEqual(DEFAULT_SEARCH_PREFERENCES)
  })

  it('round-trips through the UI preference store under one leaf', async () => {
    expect(await getSearchPreferences()).toEqual(DEFAULT_SEARCH_PREFERENCES)
    const next = decodeSearchPreferences({ resultLimit: 12_000, defaultPresentation: 'pagination' })
    expect(await setSearchPreferences(next)).toBe(true)
    expect(set).toHaveBeenCalledWith('generationV2UiPreferences.searchPreferences', next)
    stored = next
    expect((await getSearchPreferences()).resultLimit).toBe(12_000)
  })
})
