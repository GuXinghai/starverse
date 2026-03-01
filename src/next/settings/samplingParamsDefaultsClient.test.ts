import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSamplingParamsDefaults,
  setSamplingParamsDefaults,
} from './samplingParamsDefaultsClient'

describe('samplingParamsDefaultsClient', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
    vi.restoreAllMocks()
  })

  it('reads settings.getSamplingParamsDefaults through contract decoder', async () => {
    const invoke = vi.fn(async () => ({ value: { temperature: { mode: 'custom', value: 0.8 } } }))
    ;(globalThis as any).dbBridge = { invoke }

    await expect(getSamplingParamsDefaults()).resolves.toEqual({
      temperature: { mode: 'custom', value: 0.8 },
    })
    expect(invoke).toHaveBeenCalledWith('settings.getSamplingParamsDefaults')
  })

  it('writes settings.setSamplingParamsDefaults and decodes ack', async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).dbBridge = { invoke }

    await expect(setSamplingParamsDefaults({ temperature: { mode: 'custom', value: 0.7 } })).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('settings.setSamplingParamsDefaults', {
      value: { temperature: { mode: 'custom', value: 0.7 } },
    })
  })

  it('returns safe defaults when dbBridge is unavailable', async () => {
    ;(globalThis as any).dbBridge = null
    await expect(getSamplingParamsDefaults()).resolves.toBeNull()
    await expect(setSamplingParamsDefaults({ temperature: { mode: 'custom', value: 0.5 } })).resolves.toBe(false)
  })
})
