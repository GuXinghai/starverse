import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getGenerationParamsDefaults,
  setGenerationParamsDefaults,
} from './generationParamsDefaultsClient'

describe('generationParamsDefaultsClient', () => {
  const originalStore = (globalThis as any).electronStore

  afterEach(() => {
    ;(globalThis as any).electronStore = originalStore
    vi.restoreAllMocks()
  })

  it('reads settings.getGenerationParamsDefaults through contract decoder', async () => {
    const get = vi.fn().mockResolvedValue({ generationParamsDefaults: { version: 1, params: { topP: { mode: 'custom', value: 0.9 } } } })
    ;(globalThis as any).electronStore = { get, set: vi.fn() }

    await expect(getGenerationParamsDefaults()).resolves.toEqual({
      version: 1,
      params: { topP: { mode: 'custom', value: 0.9 } },
    })
    expect(get).toHaveBeenCalledWith('generationV2UiPreferences')
  })

  it('writes settings.setGenerationParamsDefaults and decodes ack', async () => {
    const get = vi.fn().mockResolvedValue({})
    const set = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).electronStore = { get, set }

    const value = { version: 1, params: { temperature: { mode: 'custom', value: 0.7 } } }
    await expect(setGenerationParamsDefaults(value)).resolves.toBe(true)
    expect(set).toHaveBeenCalledWith('generationV2UiPreferences', { generationParamsDefaults: value })
  })

  it('returns safe defaults when the retained preference store is unavailable', async () => {
    ;(globalThis as any).electronStore = null
    await expect(getGenerationParamsDefaults()).resolves.toBeNull()
    await expect(setGenerationParamsDefaults({ version: 1, params: {} })).resolves.toBe(false)
  })
})
