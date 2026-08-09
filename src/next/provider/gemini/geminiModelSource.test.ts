import { describe, expect, it, vi } from 'vitest'
import {
  listGeminiProviderModelAvailability,
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
        observation: expect.objectContaining({
          rawProviderRecord: expect.objectContaining({
            supportedGenerationMethods: ['generateContent', 'countTokens'],
            inputTokenLimit: 1048576,
            outputTokenLimit: 65536,
          }),
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
          apiKey: 'fake-provider-secret-should-not-leak',
          nested: { Authorization: 'Bearer fake-provider-secret-should-not-leak' },
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('fake-provider-secret-should-not-leak')
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
      providerSpecific: expect.objectContaining({
        supportedGenerationMethods: ['embedContent'],
        inputTokenLimit: 2048,
        outputTokenLimit: 1,
      }),
      observation: expect.objectContaining({
        facts: expect.objectContaining({ textChat: expect.objectContaining({ presence: 'present', value: false }) }),
      }),
    })
  })
})

describe('Gemini provider observation authority', () => {
  it('does not insert curated models into provider-reported observations', () => {
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
      observation: expect.objectContaining({
        facts: expect.objectContaining({ textChat: expect.objectContaining({ presence: 'present', value: true }) }),
      }),
    })
    expect(flash?.warnings).toEqual([])
    expect(result.ok && result.models.some((model) => model.nativeModelId === 'gemini-2.5-pro')).toBe(false)
  })

  it('preserves the raw thinking own-property evidence without inferring missing support', () => {
    const result = parseGeminiModelsResponse({
      models: [
        {
          name: 'models/gemini-3.1-flash-lite',
          baseModelId: 'gemini-3.1-flash-lite',
          supportedGenerationMethods: ['generateContent'],
          thinking: true,
        },
        {
          name: 'models/gemini-3.6-flash',
          baseModelId: 'gemini-3.6-flash',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok && result.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nativeModelId: 'gemini-3.1-flash-lite',
        providerSpecific: expect.objectContaining({ thinkingOwnProperty: true, thinkingRawValue: true, thinkingRawType: 'boolean' }),
        observation: expect.objectContaining({ facts: expect.objectContaining({ reasoning: expect.objectContaining({ presence: 'present', value: true }) }) }),
      }),
      expect.objectContaining({
        nativeModelId: 'gemini-3.6-flash',
        providerSpecific: expect.objectContaining({ thinkingOwnProperty: false, thinkingRawType: 'missing' }),
        observation: expect.objectContaining({ facts: expect.objectContaining({ reasoning: expect.objectContaining({ presence: 'missing' }) }) }),
      }),
    ]))
  })
})

describe('Gemini model availability transport errors', () => {
  it('keeps sanitized network cause without leaking raw messages', async () => {
    const secret = 'fake-google-secret'
    const cause = Object.assign(new Error(`connect failed for ${secret}`), {
      name: 'ConnectTimeoutError',
      code: 'UND_ERR_CONNECT_TIMEOUT',
    })
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new TypeError(`fetch failed ${secret}`), { cause })
    }) as unknown as typeof fetch

    const result = await listGeminiProviderModelAvailability({
      apiKey: secret,
      fetchImpl,
      observedAtMs: OBSERVED_AT_MS,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'network_error',
      message: 'Google AI Studio model source: Connection timed out.',
      networkError: {
        safeDetailCode: 'connection_timeout',
      },
      transportCause: {
        name: 'TypeError',
        code: 'UND_ERR_CONNECT_TIMEOUT',
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secret)
    expect(result).toMatchObject({
      providerFailure: {
        origin: 'network_transport',
        phase: 'request_open',
        transportError: { name: 'TypeError', message: 'fetch failed [redacted]' },
        redactions: expect.arrayContaining([expect.objectContaining({ reason: 'credential' })]),
      },
    })
  })
})
