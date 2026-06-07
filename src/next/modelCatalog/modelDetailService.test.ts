import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getModelCatalogModelDetail,
} from './modelDetailService'

describe('modelDetailService', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronAPI
    vi.restoreAllMocks()
  })

  it('returns explainable error when scoped query IPC is unavailable', async () => {
    ;(globalThis as any).electronAPI = undefined
    const result = await getModelCatalogModelDetail({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
    })
    expect(result).toEqual({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
      item: null,
      error: 'Model detail unavailable.',
    })
  })

  it('loads model detail from current scoped row and normalizes fields', async () => {
    const legacyInvoke = vi.fn(async () => {
      throw new Error('legacy model detail should not be called')
    })
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      providerKey: 'openrouter',
      status: 'synced',
      items: [{
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        canonicalSlug: 'openai/gpt-4o',
        displayName: 'GPT-4o',
        description: 'omni',
        vendor: 'openai',
        family: 'gpt-4',
        status: 'active',
        visibility: 'visible',
        contextLength: 128000,
        maxOutputTokens: 4096,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        supportedParameters: ['temperature', 'tools', 'reasoning'],
        capabilities: {
          reasoning: true,
          tools: true,
          structuredOutputs: true,
          vision: true,
          longContext: true,
        },
        pricing: {
          prompt: '0.00003',
          completion: '0.00006',
          request: '0',
          image: '0',
          webSearch: '0',
        },
        createdAtSec: 1692901234,
        firstSeenAtMs: 1700000000000,
        lastSeenAtMs: 1700000000100,
        syncedAtMs: 1700000000200,
        raw: {
          rawJson: null,
          inputModalitiesJson: '["text","image"]',
          outputModalitiesJson: '["text"]',
          supportedParametersJson: '["temperature","tools","reasoning"]',
          capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":true,"longContext":true}',
          pricingJson: '{"prompt":"0.00003","completion":"0.00006","web_search":"0"}',
        },
      }],
      nextCursor: null,
    }))
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }

    const result = await getModelCatalogModelDetail({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({
      providerKey: 'openrouter',
      modelIds: ['openai/gpt-4o'],
      limit: 1,
    })
    expect(legacyInvoke).not.toHaveBeenCalled()
    expect(JSON.stringify(modelCatalogQueryScopedCurrent.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(modelCatalogQueryScopedCurrent.mock.calls)).not.toContain('catalogScopeKey')
    expect(result.error).toBeNull()
    expect(result.item).toMatchObject({
      modelId: 'openai/gpt-4o',
      displayName: 'GPT-4o',
      inputModalities: ['text', 'image'],
      supportedParameters: ['temperature', 'tools', 'reasoning'],
      capabilities: {
        reasoning: true,
        tools: true,
        structuredOutputs: true,
        vision: true,
        longContext: true,
      },
      pricing: {
        prompt: '0.00003',
        completion: '0.00006',
        webSearch: '0',
      },
      topProviderIsModerated: null,
    })
  })

  it('does not fallback to legacy model detail when scoped row is missing', async () => {
    const legacyInvoke = vi.fn(async () => ({
      providerKey: 'openrouter',
      modelId: 'legacy/only',
      modelKey: 'openrouter::legacy/only',
      displayName: 'Legacy Only',
    }))
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      providerKey: 'openrouter',
      status: 'not_synced',
      items: [],
      nextCursor: null,
    }))
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }

    const result = await getModelCatalogModelDetail({
      providerKey: 'openrouter',
      modelId: 'legacy/only',
    })

    expect(result).toMatchObject({
      providerKey: 'openrouter',
      modelId: 'legacy/only',
      item: null,
      error: null,
    })
    expect(legacyInvoke).not.toHaveBeenCalled()
  })
})
