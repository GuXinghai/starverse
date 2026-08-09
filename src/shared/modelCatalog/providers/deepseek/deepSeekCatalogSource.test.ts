import { describe, expect, it, vi } from 'vitest'
import { createDeepSeekCatalogSource } from './deepSeekCatalogSource'

describe('deepSeekCatalogSource', () => {
  it('publishes only models and capability facts returned by DeepSeek /models', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      object: 'list',
      data: [
        {
          object: 'model',
          id: 'deepseek-v4-flash',
          owned_by: 'deepseek',
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

    const snapshot = await createDeepSeekCatalogSource().fetchSnapshot({
      providerKey: 'deepseek',
      apiKey: 'sk-deepseek-test',
      baseUrl: 'https://api.deepseek.com/',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.objectContaining({
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk-deepseek-test',
      },
      redirect: 'error',
    }))
    expect(snapshot.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerKey: 'deepseek',
        modelId: 'deepseek-v4-flash',
        modelKey: 'deepseek::deepseek-v4-flash',
        displayName: 'deepseek-v4-flash',
        status: 'active',
        visibility: 'visible',
        contextLength: null,
        maxOutputTokens: null,
        pricing: null,
        capabilities: expect.objectContaining({
          reasoning: false,
          tools: false,
          structuredOutputs: false,
          longContext: false,
        }),
        supportedParameters: [],
      }),
    ]))
    expect(snapshot.models.map((model) => model.modelId)).toEqual(['deepseek-v4-flash'])
    expect(snapshot.models[0]?.raw?.buckets[0]?.payload ?? {}).not.toHaveProperty('capabilitySeed')
    expect(JSON.stringify(snapshot)).not.toContain('sk-deepseek-test')
  })
})
