import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getGenerationParamsDefaults,
  setGenerationParamsDefaults,
} from './generationParamsDefaultsClient'

describe('generationParamsDefaultsClient', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
    vi.restoreAllMocks()
  })

  it('reads settings.getGenerationParamsDefaults through contract decoder', async () => {
    const invoke = vi.fn().mockResolvedValue({ value: { version: 1, params: { topP: { mode: 'custom', value: 0.9 } } } })
    ;(globalThis as any).dbBridge = { invoke }

    await expect(getGenerationParamsDefaults()).resolves.toEqual({
      version: 1,
      params: { topP: { mode: 'custom', value: 0.9 } },
    })
    expect(invoke).toHaveBeenCalledWith('settings.getGenerationParamsDefaults')
  })

  it('writes settings.setGenerationParamsDefaults and decodes ack', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).dbBridge = { invoke }

    const value = { version: 1, params: { temperature: { mode: 'custom', value: 0.7 } } }
    await expect(setGenerationParamsDefaults(value)).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('settings.setGenerationParamsDefaults', { value })
  })

  it('returns safe defaults when db bridge is unavailable', async () => {
    ;(globalThis as any).dbBridge = null
    await expect(getGenerationParamsDefaults()).resolves.toBeNull()
    await expect(setGenerationParamsDefaults({ version: 1, params: {} })).resolves.toBe(false)
  })
})
