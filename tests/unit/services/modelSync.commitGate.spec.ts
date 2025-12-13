/**
 * modelSync.commitGate.spec.ts
 * 
 * 验收点：syncFromOpenRouter 必须实现 commit gate：
 * - 非 200 / json.error / data 非数组 / 数据量异常偏小 => abort（success=false，models 返回 existingModels）
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { syncFromOpenRouter } from '@/services/modelSync'
import type { AppModel } from '@/types/appModel'

function makeAppModel(id: string): AppModel {
  return {
    id,
    name: id,
    context_length: 4096,
    capabilities: {
      hasReasoning: false,
      hasTools: false,
      hasJsonMode: false,
      isMultimodal: false,
    },
    pricing: {
      promptUsdPerToken: '0',
      completionUsdPerToken: '0',
      requestUsd: '0',
      imageUsd: '0',
      webSearchUsd: '0',
      internalReasoningUsdPerToken: '0',
      inputCacheReadUsdPerToken: '0',
      inputCacheWriteUsdPerToken: '0',
    },
    is_archived: false,
    first_seen_at: '2024-01-01T00:00:00.000Z',
    last_seen_at: '2024-01-01T00:00:00.000Z',
    router_source: 'openrouter',
    vendor: 'test',
  }
}

describe('syncFromOpenRouter commit gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetAllMocks()
  })

  it('aborts on non-200 response', async () => {
    const existingModels = [makeAppModel('test/a')]

    const fetchMock = vi.fn().mockResolvedValue({
      status: 401,
      statusText: 'Unauthorized',
      json: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock as any)

    const result = await syncFromOpenRouter('bad-key', existingModels, 'https://openrouter.ai')

    expect(result.success).toBe(false)
    expect(result.models).toBe(existingModels)
    expect(result.error?.message).toMatch(/commit gate: non-200/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts when json.error exists (even with 200)', async () => {
    const existingModels = [makeAppModel('test/a')]

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        error: { code: 'invalid_api_key', message: 'Invalid API key' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock as any)

    const result = await syncFromOpenRouter('bad-key', existingModels, 'https://openrouter.ai')

    expect(result.success).toBe(false)
    expect(result.models).toBe(existingModels)
    expect(result.error?.message).toMatch(/commit gate: api error/i)
  })

  it('aborts when data is not an array', async () => {
    const existingModels = [makeAppModel('test/a')]

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        data: {},
      }),
    })
    vi.stubGlobal('fetch', fetchMock as any)

    const result = await syncFromOpenRouter('key', existingModels, 'https://openrouter.ai')

    expect(result.success).toBe(false)
    expect(result.models).toBe(existingModels)
    expect(result.error?.message).toMatch(/commit gate: invalid response shape/i)
  })

  it('aborts when remote model count is suspiciously small', async () => {
    const existingModels = Array.from({ length: 200 }, (_, i) => makeAppModel(`test/${i}`))

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        data: Array.from({ length: 50 }, (_, i) => ({ id: `remote/${i}` })),
      }),
    })
    vi.stubGlobal('fetch', fetchMock as any)

    const result = await syncFromOpenRouter('key', existingModels, 'https://openrouter.ai')

    expect(result.success).toBe(false)
    expect(result.models).toBe(existingModels)
    expect(result.error?.message).toMatch(/commit gate: too few models/i)
  })
})
