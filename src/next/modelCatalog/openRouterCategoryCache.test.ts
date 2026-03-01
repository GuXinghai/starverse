import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetOpenRouterCategoryCacheForTests,
  resolveOpenRouterCategoryMembership,
} from './openRouterCategoryCache'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('openRouterCategoryCache', () => {
  afterEach(() => {
    __resetOpenRouterCategoryCacheForTests()
    vi.restoreAllMocks()
  })

  it('fetches category membership on first request and reuses cache on second request', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: 'openai/a' },
          { id: 'openai/b' },
        ],
      })
    )

    const first = await resolveOpenRouterCategoryMembership({
      category: 'programming',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
      fetchImpl: fetchImpl as any,
      nowMs: 1_000,
      ttlMs: 60_000,
    })
    const second = await resolveOpenRouterCategoryMembership({
      category: 'programming',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
      fetchImpl: fetchImpl as any,
      nowMs: 2_000,
      ttlMs: 60_000,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(first).toMatchObject({
      modelIds: ['openai/a', 'openai/b'],
      cacheHit: false,
      usedStaleCache: false,
      unresolved: false,
    })
    expect(second).toMatchObject({
      modelIds: ['openai/a', 'openai/b'],
      cacheHit: true,
      usedStaleCache: false,
      unresolved: false,
    })
  })

  it('falls back to stale cache when refresh fails after ttl expiry', async () => {
    const fetchImpl = vi
      .fn(async () =>
        jsonResponse({
          data: [{ id: 'openai/a' }],
        })
      )
      .mockImplementationOnce(async () =>
        jsonResponse({
          data: [{ id: 'openai/a' }],
        })
      )
      .mockImplementationOnce(async () => {
        throw new Error('network down')
      })

    const first = await resolveOpenRouterCategoryMembership({
      category: 'programming',
      fetchImpl: fetchImpl as any,
      nowMs: 1_000,
      ttlMs: 1_000,
    })
    const second = await resolveOpenRouterCategoryMembership({
      category: 'programming',
      fetchImpl: fetchImpl as any,
      nowMs: 3_000,
      ttlMs: 1_000,
    })

    expect(first).toMatchObject({
      modelIds: ['openai/a'],
      cacheHit: false,
      usedStaleCache: false,
      unresolved: false,
    })
    expect(second).toMatchObject({
      modelIds: ['openai/a'],
      cacheHit: false,
      usedStaleCache: true,
      unresolved: false,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('marks unresolved when first fetch fails without cache', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      throw new Error(`offline for ${url}`)
    })

    const result = await resolveOpenRouterCategoryMembership({
      category: 'science',
      fetchImpl: fetchImpl as any,
      nowMs: 1_000,
      ttlMs: 60_000,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      cacheHit: false,
      usedStaleCache: false,
      unresolved: true,
    })
    expect(result.modelIds).toEqual([])
  })
})
