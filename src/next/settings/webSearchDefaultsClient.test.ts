import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWebSearchDefaults,
  setWebSearchDefaults,
} from './webSearchDefaultsClient'

describe('webSearchDefaultsClient', () => {
  const originalStore = (globalThis as any).electronStore

  afterEach(() => {
    ;(globalThis as any).electronStore = originalStore
    vi.restoreAllMocks()
  })

  it('reads settings.getWebSearchDefaults through contract decoder', async () => {
    const get = vi.fn(async () => ({ webSearchDefaults: { searchMode: 'enable' } }))
    ;(globalThis as any).electronStore = { get, set: vi.fn() }

    await expect(getWebSearchDefaults()).resolves.toEqual({ searchMode: 'enable' })
    expect(get).toHaveBeenCalledWith('generationV2UiPreferences')
  })

  it('writes settings.setWebSearchDefaults and decodes ack', async () => {
    const get = vi.fn(async () => ({}))
    const set = vi.fn(async () => undefined)
    ;(globalThis as any).electronStore = { get, set }

    await expect(setWebSearchDefaults({ searchMode: 'default' })).resolves.toBe(true)
    expect(set).toHaveBeenCalledWith('generationV2UiPreferences', { webSearchDefaults: { searchMode: 'default' } })
  })

  it('returns safe defaults when the retained preference store is unavailable', async () => {
    ;(globalThis as any).electronStore = null
    await expect(getWebSearchDefaults()).resolves.toBeNull()
    await expect(setWebSearchDefaults({ searchMode: 'enable' })).resolves.toBe(false)
  })
})
