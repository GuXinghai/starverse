import { describe, expect, it } from 'vitest'
import {
  createMockMagikaRuntimeLoader,
  createUnavailableMagikaRuntimeLoader,
} from './magikaRuntimeLoader'

describe('magikaRuntimeLoader', () => {
  it('returns mock runtime with explicit modelVersion', async () => {
    const loader = createMockMagikaRuntimeLoader({
      modelVersion: 'magika-model-v1',
      output: { label: 'json', score: 0.9 },
    })
    const loaded = await loader.load()
    expect(loaded.available).toBe(true)
    if (!loaded.available) return
    expect(loaded.runtime.kind).toBe('mock')
    expect(loaded.runtime.modelVersion).toBe('magika-model-v1')
    const output = await loaded.runtime.classify({ bytes: new Uint8Array([1, 2, 3]) })
    expect(output?.label).toBe('json')
  })

  it('returns structured unavailable status', async () => {
    const loader = createUnavailableMagikaRuntimeLoader({
      reason: 'runtime_unavailable',
      detail: 'missing runtime at /home/user/private/model',
      modelVersion: 'v2',
    })
    const loaded = await loader.load()
    expect(loaded.available).toBe(false)
    if (loaded.available) return
    expect(loaded.reason).toBe('runtime_unavailable')
    expect(loaded.detail).toContain('[redacted-path]')
    expect(loaded.modelVersion).toBe('v2')
  })
})
