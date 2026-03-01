import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWebSearchDefaults,
  setWebSearchDefaults,
} from './webSearchDefaultsClient'

describe('webSearchDefaultsClient', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
    vi.restoreAllMocks()
  })

  it('reads settings.getWebSearchDefaults through contract decoder', async () => {
    const invoke = vi.fn(async () => ({ value: { searchMode: 'enable' } }))
    ;(globalThis as any).dbBridge = { invoke }

    await expect(getWebSearchDefaults()).resolves.toEqual({ searchMode: 'enable' })
    expect(invoke).toHaveBeenCalledWith('settings.getWebSearchDefaults')
  })

  it('writes settings.setWebSearchDefaults and decodes ack', async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).dbBridge = { invoke }

    await expect(setWebSearchDefaults({ searchMode: 'default' })).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('settings.setWebSearchDefaults', { value: { searchMode: 'default' } })
  })

  it('returns safe defaults when dbBridge is unavailable', async () => {
    ;(globalThis as any).dbBridge = null
    await expect(getWebSearchDefaults()).resolves.toBeNull()
    await expect(setWebSearchDefaults({ searchMode: 'enable' })).resolves.toBe(false)
  })
})
