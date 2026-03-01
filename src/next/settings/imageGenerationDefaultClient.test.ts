import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getImageGenerationDefault,
  setImageGenerationDefault,
} from './imageGenerationDefaultClient'

describe('imageGenerationDefaultClient', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
    vi.restoreAllMocks()
  })

  it('reads settings.getImageGenerationDefault through contract decoder', async () => {
    const invoke = vi.fn(async () => ({ value: { enabled: true, outputMode: 'image_only' } }))
    ;(globalThis as any).dbBridge = { invoke }

    await expect(getImageGenerationDefault()).resolves.toEqual({ enabled: true, outputMode: 'image_only' })
    expect(invoke).toHaveBeenCalledWith('settings.getImageGenerationDefault')
  })

  it('writes settings.setImageGenerationDefault and decodes ack', async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).dbBridge = { invoke }

    await expect(setImageGenerationDefault({ enabled: false, outputMode: 'auto' })).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('settings.setImageGenerationDefault', {
      value: { enabled: false, outputMode: 'auto' },
    })
  })

  it('returns safe defaults when dbBridge is unavailable', async () => {
    ;(globalThis as any).dbBridge = null
    await expect(getImageGenerationDefault()).resolves.toBeNull()
    await expect(setImageGenerationDefault({ enabled: true })).resolves.toBe(false)
  })
})
