import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetModelEndpointDetailCacheForTests,
  buildEndpointKey,
  getModelEndpointDetails,
} from './modelEndpointDetailService'
import { installGenerationV2ModelsList, successfulGenerationV2Models } from '../../../tests/helpers/generationV2ModelsBridge'

const originalDbBridge = (globalThis as any).dbBridge
const originalGenerationV2 = (globalThis as any).generationV2
const originalFetch = globalThis.fetch

describe('modelEndpointDetailService', () => {
  afterEach(() => {
    __resetModelEndpointDetailCacheForTests()
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).generationV2 = originalGenerationV2
    ;(globalThis as any).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('derives endpoint details from current scoped row', async () => {
    const modelCatalogQueryScopedCurrent = installGenerationV2ModelsList('openrouter', vi.fn(async () => successfulGenerationV2Models([{
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4',
        modelKey: 'openrouter::openai/gpt-4',
        displayName: 'GPT-4',
        vendor: 'openai',
        contextLength: 8192,
        maxOutputTokens: 4096,
        supportedParameters: ['temperature', 'tools'],
        syncedAtMs: 1700000000000,
      }])))

    const result = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({ timeoutMs: 30_000 })
    expect(result.source).toBe('scoped_catalog')
    expect(result.error).toBeNull()
    expect(result.fetchedAtMs).toBe(1700000000000)
    expect(result.items).toEqual([
      expect.objectContaining({
        endpointKey: buildEndpointKey('openai/gpt-4', {
          tag: 'current',
          quantization: null,
          providerName: 'openai',
        }),
        providerName: 'openai',
        tag: 'current',
        quantization: null,
        supportedParameters: ['temperature', 'tools'],
        contextLength: 8192,
        maxCompletionTokens: 4096,
        maxPromptTokens: 8192,
      }),
    ])
    expect(JSON.stringify(modelCatalogQueryScopedCurrent.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(modelCatalogQueryScopedCurrent.mock.calls)).not.toContain('catalogScopeKey')
  })

  it('does not read provider-only endpoint_meta or network details', async () => {
    const legacyInvoke = vi.fn(async () => {
      throw new Error('legacy endpoint_meta should not be called')
    })
    const fetchMock = vi.fn(async () => {
      throw new Error('renderer endpoint network should not be called')
    })
    installGenerationV2ModelsList('openrouter', vi.fn(async () => successfulGenerationV2Models([])))
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }
    ;(globalThis as any).fetch = fetchMock

    const result = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'legacy/only',
      forceRefresh: true,
    })

    expect(result).toMatchObject({
      providerKey: 'openrouter',
      modelId: 'legacy/only',
      source: 'scoped_catalog',
      items: [],
      error: null,
    })
    expect(legacyInvoke).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a neutral error when scoped query IPC is unavailable', async () => {
    ;(globalThis as any).generationV2 = { ...(globalThis as any).generationV2, models: {} }

    const result = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
    })

    expect(result).toMatchObject({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
      source: 'scoped_catalog',
      items: [],
      error: 'Endpoint details unavailable.',
    })
  })
})
