import { describe, expect, it, vi } from 'vitest'
import { syncOpenRouterModelCatalog } from './catalogSyncJob'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('syncOpenRouterModelCatalog', () => {
  it('prefers /models/user and writes both legacy + core snapshots', async () => {
    const calls: string[] = []
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const fakeFetch = async (url: string): Promise<Response> => {
      calls.push(url)
      if (url.endsWith('/models/user')) {
        return jsonResponse({
          data: [
            {
              id: 'openai/a',
              name: 'A',
              canonical_slug: 'openai/a',
              created: '1701000100',
              context_length: 8192,
              supported_parameters: ['temperature', 'tools'],
              pricing: {
                prompt: '0.00001',
                completion: '0.00002',
                request: '0',
                image: '0',
                web_search: '0.0001',
                internal_reasoning: '0.0002',
                input_cache_read: '0.0003',
                input_cache_write: '0.0004',
              },
              architecture: {
                modality: 'text->text',
                input_modalities: ['text'],
                output_modalities: ['text'],
                tokenizer: 'cl100k_base',
                instruct_type: 'chatml',
              },
              top_provider: {
                is_moderated: true,
                context_length: 8192,
                max_completion_tokens: 4096,
              },
              expiration_date: '2099-01-01T00:00:00.000Z',
              per_request_limits: { max_input_tokens: 4096 },
              default_parameters: { temperature: 0.2 },
            },
          ],
        })
      }
      if (url.endsWith('/providers')) {
        return jsonResponse({
          data: [
            {
              name: 'OpenAI',
              slug: 'openai',
            },
          ],
        })
      }
      if (url.endsWith('/models/count')) {
        return jsonResponse({
          data: { count: 123 },
        })
      }
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const legacyWrites: any[] = []
    const coreWrites: any[] = []

    const result = await syncOpenRouterModelCatalog({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fakeFetch as any,
      snapshotId: 'snap_task6_1',
      enableCountProbe: true,
      writer: {
        syncSnapshot: (input) => {
          legacyWrites.push(input)
        },
        syncCoreSnapshot: (input) => {
          coreWrites.push(input)
        },
      },
      logger,
    })

    expect(result).toMatchObject({ ok: true, snapshotId: 'snap_task6_1', modelCount: 1 })
    expect(calls).toEqual([
      'https://openrouter.ai/api/v1/models/user',
      'https://openrouter.ai/api/v1/providers',
      'https://openrouter.ai/api/v1/models/count',
    ])

    expect(legacyWrites).toHaveLength(1)
    expect(legacyWrites[0].models).toHaveLength(1)
    expect(legacyWrites[0].models[0]).toMatchObject({
      modelId: 'openai/a',
      routerSource: 'openrouter',
      supportedParametersJson: JSON.stringify(['temperature', 'tools']),
    })

    expect(coreWrites).toHaveLength(1)
    expect(coreWrites[0].providerKey).toBe('openrouter')
    expect(coreWrites[0].models).toHaveLength(1)
    expect(coreWrites[0].providers.map((row: any) => row.providerKey).sort()).toEqual(['openai', 'openrouter'])
    expect(coreWrites[0].models[0]).toMatchObject({
      providerKey: 'openrouter',
      modelId: 'openai/a',
      canonicalSlug: 'openai/a',
      architectureModality: 'text->text',
      inputModalitiesJson: JSON.stringify(['text']),
      outputModalitiesJson: JSON.stringify(['text']),
      tokenizer: 'cl100k_base',
      instructType: 'chatml',
      priceWebSearch: '0.0001',
      priceInternalReasoning: '0.0002',
      priceInputCacheRead: '0.0003',
      priceInputCacheWrite: '0.0004',
      createdAtSec: 1701000100,
      expirationDate: '2099-01-01T00:00:00.000Z',
      hasPerRequestLimits: 1,
      hasDefaultParameters: 1,
      topProviderIsModerated: 1,
      topProviderContextLength: 8192,
    })
    expect(coreWrites[0].models[0].rawJson).toContain('"id":"openai/a"')
    expect(coreWrites[0].meta).toMatchObject({
      providerKey: 'openrouter',
      dataSource: 'models_user_primary',
      modelCount: 1,
      visibleModelCount: 1,
      hiddenModelCount: 0,
      lastCountProbe: 123,
      baseUrl: 'https://openrouter.ai/api/v1',
    })
    expect(logger.info).toHaveBeenCalledWith(
      '[CatalogSyncJob] sync end',
      expect.objectContaining({
        status: 'ok',
        snapshotId: 'snap_task6_1',
        modelCount: 1,
        legacyModelRows: 1,
        coreModelRows: 1,
        ftsBuildStatus: 'trigger_managed',
      })
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('falls back to /models when /models/user fails and still writes snapshot', async () => {
    const calls: string[] = []
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const fakeFetch = async (url: string): Promise<Response> => {
      calls.push(url)
      if (url.endsWith('/models/user')) {
        return jsonResponse({ error: { code: 503, message: 'unavailable' } }, 503)
      }
      if (url.endsWith('/models')) {
        return jsonResponse({
          data: [
            {
              id: 'openai/b',
              supported_parameters: [],
            },
          ],
        })
      }
      if (url.endsWith('/providers')) {
        return jsonResponse({ error: { code: 500, message: 'provider-down' } }, 500)
      }
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const coreWrites: any[] = []
    const result = await syncOpenRouterModelCatalog({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fakeFetch as any,
      snapshotId: 'snap_task6_2',
      writer: {
        syncSnapshot: () => undefined,
        syncCoreSnapshot: (input) => {
          coreWrites.push(input)
        },
      },
      logger,
    })

    expect(result).toMatchObject({ ok: true, snapshotId: 'snap_task6_2', modelCount: 1 })
    expect(calls[0]).toBe('https://openrouter.ai/api/v1/models/user')
    expect(calls[1]).toBe('https://openrouter.ai/api/v1/models')
    expect(calls).toContain('https://openrouter.ai/api/v1/providers')
    expect(coreWrites).toHaveLength(1)
    expect(coreWrites[0].providers).toEqual([])
    expect(coreWrites[0].meta).toMatchObject({
      dataSource: 'mixed',
      providerCount: null,
    })
    expect(coreWrites[0].models[0]).toMatchObject({
      modelId: 'openai/b',
      displayName: 'openai/b',
      supportedParametersJson: '[]',
    })
    expect(logger.warn).toHaveBeenCalledWith(
      '[CatalogSyncJob] stage degraded',
      expect.objectContaining({
        stage: 'fetch_providers',
      })
    )
  })

  it('logs failure stage when legacy write fails', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const fakeFetch = async (url: string): Promise<Response> => {
      if (url.endsWith('/models/user')) {
        return jsonResponse({
          data: [{ id: 'openai/x' }],
        })
      }
      if (url.endsWith('/providers')) {
        return jsonResponse({ data: [] })
      }
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    await expect(
      syncOpenRouterModelCatalog({
        apiKey: 'sk-test',
        baseUrl: 'https://openrouter.ai/api/v1',
        fetchImpl: fakeFetch as any,
        snapshotId: 'snap_fail_write',
        writer: {
          syncSnapshot: () => {
            throw new Error('disk_full')
          },
          syncCoreSnapshot: () => undefined,
        },
        logger,
      })
    ).rejects.toThrow(/\[write_legacy\]/)

    expect(logger.error).toHaveBeenCalledWith(
      '[CatalogSyncJob] sync end',
      expect.objectContaining({
        status: 'failed',
        failureStage: 'write_legacy',
      })
    )
  })
})
