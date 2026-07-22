import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getModelCatalogModelDetail,
} from './modelDetailService'
import { installGenerationV2ModelsList, successfulGenerationV2Models } from '../../../tests/helpers/generationV2ModelsBridge'

describe('modelDetailService', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalGenerationV2 = (globalThis as any).generationV2

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).generationV2 = originalGenerationV2
    vi.restoreAllMocks()
  })

  it('returns explainable error when scoped query IPC is unavailable', async () => {
    ;(globalThis as any).generationV2 = { ...(globalThis as any).generationV2, models: {} }
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
    const modelCatalogQueryScopedCurrent = installGenerationV2ModelsList('openrouter', vi.fn(async () => successfulGenerationV2Models([{
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
      }])))
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }

    const result = await getModelCatalogModelDetail({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({ timeoutMs: 30_000 })
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
    installGenerationV2ModelsList('openrouter', vi.fn(async () => successfulGenerationV2Models([])))
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }

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
