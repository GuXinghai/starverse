import { describe, expect, it } from 'vitest'
import {
  getGeminiCuratedModelAvailabilitySeeds,
  parseGeminiModelsResponse,
  resolveGeminiModelAvailabilityFromModelsPayload,
} from './geminiModelSource'

const OBSERVED_AT_MS = Date.UTC(2026, 5, 25, 0, 0, 0)

describe('Gemini models.list parser', () => {
  it('parses normal provider-reported model records', () => {
    const result = parseGeminiModelsResponse({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          baseModelId: 'gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          description: 'Fast Gemini model',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
          inputTokenLimit: 1048576,
          outputTokenLimit: 65536,
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result).toMatchObject({ ok: true, warnings: [] })
    expect(result.ok && result.models).toEqual([
      expect.objectContaining({
        providerKey: 'google_ai_studio',
        endpointId: 'google-ai-studio-official',
        profileId: 'gemini_api_v1',
        nativeModelId: 'gemini-2.5-flash',
        providerModelName: 'models/gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        source: 'gemini_models_api',
        confidence: 'provider_reported',
        observedAtMs: OBSERVED_AT_MS,
        capabilitySeed: expect.objectContaining({
          textChat: true,
          supportedGenerationMethods: ['generateContent', 'countTokens'],
          inputTokenLimit: 1048576,
          outputTokenLimit: 65536,
        }),
      }),
    ])
  })

  it('returns a safe invalid response when models[] is missing', () => {
    expect(parseGeminiModelsResponse({ object: 'list' }, OBSERVED_AT_MS)).toEqual({
      ok: false,
      code: 'invalid_response',
      message: 'Gemini models.list response is missing models[].',
      warnings: [],
    })
  })

  it('drops invalid model names without throwing', () => {
    const result = parseGeminiModelsResponse({
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: '', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/../secret', supportedGenerationMethods: ['generateContent'] },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(result.ok && result.models.map((model) => model.nativeModelId)).toEqual(['gemini-2.5-flash'])
    expect(result.ok && result.warnings).toEqual([
      'Dropped invalid Gemini models.list item at index 1.',
      'Dropped invalid Gemini models.list item at index 2.',
    ])
  })

  it('ignores extra fields safely', () => {
    const result = parseGeminiModelsResponse({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          supportedGenerationMethods: ['generateContent'],
          apiKey: 'AIza-provider-should-not-leak',
          nested: { Authorization: 'Bearer AIza-provider-should-not-leak' },
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('AIza-provider-should-not-leak')
    expect(JSON.stringify(result)).not.toContain('Authorization')
    expect(JSON.stringify(result)).not.toContain('Bearer')
  })

  it('accepts an empty model list', () => {
    const result = parseGeminiModelsResponse({ models: [] }, OBSERVED_AT_MS)

    expect(result).toEqual({
      ok: true,
      models: [],
      warnings: [],
    })
  })

  it('maps supported generation methods and token limits conservatively', () => {
    const result = parseGeminiModelsResponse({
      models: [
        {
          name: 'models/gemini-embedding-001',
          supportedGenerationMethods: ['embedContent'],
          inputTokenLimit: 2048,
          outputTokenLimit: 1,
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok && result.models[0]).toMatchObject({
      nativeModelId: 'gemini-embedding-001',
      capabilitySeed: {
        textChat: false,
        supportedGenerationMethods: ['embedContent'],
        inputTokenLimit: 2048,
        outputTokenLimit: 1,
        thinking: 'unknown',
        functionCalling: 'unknown',
        vision: 'unknown',
        structuredOutput: 'unknown',
      },
    })
  })
})

describe('Gemini curated metadata seed', () => {
  it('distinguishes curated metadata from provider-reported availability', () => {
    const seeds = getGeminiCuratedModelAvailabilitySeeds(OBSERVED_AT_MS)

    expect(seeds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nativeModelId: 'gemini-2.5-flash',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs: OBSERVED_AT_MS,
        warnings: expect.arrayContaining([
          expect.stringContaining('supplemental metadata'),
        ]),
      }),
    ]))
  })

  it('merges curated warnings without overriding provider-reported source confidence', () => {
    const result = resolveGeminiModelAvailabilityFromModelsPayload({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const flash = result.ok ? result.models.find((model) => model.nativeModelId === 'gemini-2.5-flash') : null
    expect(flash).toMatchObject({
      source: 'gemini_models_api',
      confidence: 'provider_reported',
      capabilitySeed: {
        textChat: true,
        thinking: 'supported',
      },
    })
    expect(flash?.warnings.join('\n')).toContain('supplemental metadata')
    expect(result.ok && result.models.some((model) => model.nativeModelId === 'gemini-2.5-pro')).toBe(false)
  })
})
