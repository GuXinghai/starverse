import { describe, expect, it, vi } from 'vitest'
import { createGoogleAIStudioCatalogSource } from './googleAIStudioCatalogSource'

describe('googleAIStudioCatalogSource', () => {
  it('fetches Gemini models.list into a provider catalog snapshot', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
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
        {
          name: 'models/gemini-embedding-001',
          supportedGenerationMethods: ['embedContent'],
          inputTokenLimit: 2048,
          outputTokenLimit: 1,
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
    const source = createGoogleAIStudioCatalogSource()

    const snapshot = await source.fetchSnapshot({
      providerKey: 'google_ai_studio',
      apiKey: 'AIza-test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', expect.objectContaining({
      method: 'GET',
      headers: { 'x-goog-api-key': 'AIza-test-key' },
      redirect: 'error',
    }))
    expect(snapshot).toMatchObject({
      providerKey: 'google_ai_studio',
      baseUrl: 'https://generativelanguage.googleapis.com',
      dataSource: 'models_user_primary',
    })
    expect(snapshot.models[0]).toEqual(expect.objectContaining({
          providerKey: 'google_ai_studio',
          modelId: 'gemini-2.5-flash',
          modelKey: 'google_ai_studio::gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          vendor: 'Google',
          family: 'gemini',
          status: 'active',
          visibility: 'visible',
          contextLength: 1048576,
          maxOutputTokens: 65536,
          capabilities: expect.objectContaining({
            reasoning: false,
            longContext: true,
          }),
        }))
    expect(snapshot.models.map((model) => model.modelId)).toEqual(['gemini-2.5-flash', 'gemini-embedding-001'])
    expect(snapshot.models[0]?.raw?.buckets[0]?.payload ?? {}).toMatchObject({
      observation: expect.objectContaining({
        facts: expect.objectContaining({ reasoning: expect.objectContaining({ presence: 'missing' }) }),
      }),
    })
    expect(JSON.stringify(snapshot)).not.toContain('AIza-test-key')
  })

  it('requires injected fetch implementation so Electron callers control transport', async () => {
    const source = createGoogleAIStudioCatalogSource()

    await expect(source.fetchSnapshot({
      providerKey: 'google_ai_studio',
      apiKey: 'AIza-test-key',
      baseUrl: 'https://generativelanguage.googleapis.com',
    })).rejects.toThrow('Google AI Studio catalog source requires fetchImpl')
  })
})
