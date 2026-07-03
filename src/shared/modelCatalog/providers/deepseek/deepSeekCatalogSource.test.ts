import { describe, expect, it, vi } from 'vitest'
import { createDeepSeekCatalogSource } from './deepSeekCatalogSource'

describe('deepSeekCatalogSource', () => {
  it('fetches DeepSeek /models into catalog entries with curated metadata', async () => {
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
        displayName: 'DeepSeek V4 Flash',
        status: 'active',
        visibility: 'visible',
        contextLength: 1000000,
        maxOutputTokens: 384000,
        pricing: expect.objectContaining({
          prompt: '0.14',
          completion: '0.28',
        }),
        capabilities: expect.objectContaining({
          reasoning: true,
          tools: true,
          structuredOutputs: true,
          longContext: true,
        }),
      }),
    ]))
    expect(snapshot.models.map((model) => model.modelId)).toEqual(expect.arrayContaining([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'deepseek-chat',
      'deepseek-reasoner',
    ]))
    expect(JSON.stringify(snapshot)).not.toContain('sk-deepseek-test')
  })
})
