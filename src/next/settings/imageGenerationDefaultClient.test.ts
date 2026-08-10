import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getImageGenerationDefault,
  setImageGenerationDefault,
} from './imageGenerationDefaultClient'

describe('imageGenerationDefaultClient', () => {
  const originalStore = (globalThis as any).electronStore

  afterEach(() => {
    ;(globalThis as any).electronStore = originalStore
    vi.restoreAllMocks()
  })

  it('reads settings.getImageGenerationDefault through contract decoder', async () => {
    const get = vi.fn(async () => ({ imageGenerationDefault: { enabled: true, outputMode: 'image_only' } }))
    ;(globalThis as any).electronStore = { get, set: vi.fn() }

    await expect(getImageGenerationDefault()).resolves.toEqual({ enabled: true, outputMode: 'image_only' })
    expect(get).toHaveBeenCalledWith('generationV2UiPreferences')
  })

  it('writes settings.setImageGenerationDefault and decodes ack', async () => {
    const get = vi.fn(async () => ({}))
    const set = vi.fn(async () => undefined)
    ;(globalThis as any).electronStore = { get, set }

    await expect(setImageGenerationDefault({ enabled: false, outputMode: 'auto' })).resolves.toBe(true)
    expect(set).toHaveBeenCalledWith('generationV2UiPreferences', {
      imageGenerationDefault: { enabled: false, outputMode: 'auto' },
    })
  })

  it('returns safe defaults when the retained preference store is unavailable', async () => {
    ;(globalThis as any).electronStore = null
    await expect(getImageGenerationDefault()).resolves.toBeNull()
    await expect(setImageGenerationDefault({ enabled: true })).resolves.toBe(false)
  })
})
