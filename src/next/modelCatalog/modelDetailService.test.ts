import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getModelCatalogModelDetail,
} from './modelDetailService'

describe('modelDetailService', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    vi.restoreAllMocks()
  })

  it('returns explainable error when dbBridge is unavailable', async () => {
    ;(globalThis as any).dbBridge = undefined
    const result = await getModelCatalogModelDetail({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
    })
    expect(result).toEqual({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
      item: null,
      error: 'Model detail unavailable (dbBridge/modelId missing).',
    })
  })

  it('loads model detail from local cache row and normalizes json fields', async () => {
    const invoke = vi.fn(async () => ({
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
      architectureModality: 'text->text',
      inputModalitiesJson: '["text","image"]',
      outputModalitiesJson: '["text"]',
      tokenizer: 'GPT',
      instructType: 'chatml',
      supportedParametersJson: '["temperature","tools"]',
      capabilitiesJson: '{"reasoning":true,"tools":true,"structuredOutputs":true,"vision":true,"longContext":true}',
      capReasoning: 1,
      capTools: 1,
      capStructuredOutputs: 1,
      capVision: 1,
      capLongContext: 1,
      pricingJson: '{"prompt":"0.00003","completion":"0.00006","web_search":"0"}',
      pricePrompt: '0.00003',
      priceCompletion: '0.00006',
      priceRequest: '0',
      priceImage: '0',
      priceWebSearch: null,
      priceInternalReasoning: null,
      priceInputCacheRead: null,
      priceInputCacheWrite: null,
      createdAtSec: 1692901234,
      expirationDate: null,
      expirationAtSec: null,
      unknownExpiration: 0,
      perRequestLimitsJson: '{"max_input_tokens":120000}',
      defaultParametersJson: '{"temperature":0.2}',
      hasPerRequestLimits: 1,
      hasDefaultParameters: 1,
      hasTools: 1,
      hasStructuredOutputs: 1,
      hasReasoning: 1,
      hasSeed: 0,
      inModalityImage: 1,
      topProviderContextLength: 128000,
      topProviderIsModerated: 1,
      firstSeenAtMs: 1700000000000,
      lastSeenAtMs: 1700000000100,
      syncedAtMs: 1700000000200,
      rawJson: '{"id":"openai/gpt-4o"}',
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await getModelCatalogModelDetail({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
    })

    expect(invoke).toHaveBeenCalledWith('modelCatalog.getModelDetail', {
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o',
    })
    expect(result.error).toBeNull()
    expect(result.item).toMatchObject({
      modelId: 'openai/gpt-4o',
      displayName: 'GPT-4o',
      inputModalities: ['text', 'image'],
      supportedParameters: ['temperature', 'tools'],
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
      hasPerRequestLimits: true,
      hasDefaultParameters: true,
      topProviderIsModerated: true,
    })
  })

  it('tolerates malformed json payloads without throwing', async () => {
    const invoke = vi.fn(async () => ({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o-mini',
      modelKey: 'openrouter::openai/gpt-4o-mini',
      displayName: 'GPT-4o-mini',
      status: 'active',
      visibility: 'visible',
      inputModalitiesJson: '[',
      outputModalitiesJson: '[',
      supportedParametersJson: '[',
      capabilitiesJson: '{',
      capReasoning: 0,
      capTools: 0,
      capStructuredOutputs: 0,
      capVision: 0,
      capLongContext: 0,
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await getModelCatalogModelDetail({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4o-mini',
    })

    expect(result.error).toBeNull()
    expect(result.item?.inputModalities).toEqual([])
    expect(result.item?.outputModalities).toEqual([])
    expect(result.item?.supportedParameters).toEqual([])
  })
})
