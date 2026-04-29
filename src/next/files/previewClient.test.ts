import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensurePreview, getLatestReadyPreview } from './previewClient'

describe('previewClient', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('reads latest ready preview payload for renderer display', async () => {
    const invoke = vi.fn(async () => ({
      assetId: 'asset-1',
      status: 'ready',
      derivativeId: 'derivative-1',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,AA==',
      width: 128,
      height: 128,
      bytes: 512,
      reused: false,
      errorCode: null,
      errorMessage: null,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await getLatestReadyPreview('asset-1')

    expect(invoke).toHaveBeenCalledWith('preview.getLatestReady', { assetId: 'asset-1' })
    expect(result.status).toBe('ready')
    expect(result.dataUrl?.startsWith('data:image/')).toBe(true)
  })

  it('ensures preview and returns failed status payload without throwing', async () => {
    const invoke = vi.fn(async () => ({
      assetId: 'asset-1',
      status: 'failed',
      derivativeId: null,
      mime: null,
      dataUrl: null,
      width: null,
      height: null,
      bytes: null,
      reused: false,
      errorCode: 'preview_ensure_failed',
      errorMessage: 'mock failure',
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await ensurePreview({ assetId: 'asset-1', maxEdge: 256 })

    expect(invoke).toHaveBeenCalledWith('preview.ensure', { assetId: 'asset-1', maxEdge: 256 })
    expect(result.status).toBe('failed')
    expect(result.errorCode).toBe('preview_ensure_failed')
  })
})
