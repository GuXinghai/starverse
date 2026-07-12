import { describe, expect, it, vi } from 'vitest'
import {
  createOpenRouterCatalogSource,
  OPENROUTER_PROVIDER_CATALOG_DESCRIPTOR,
} from './openRouterCatalogSource'

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 })
}

describe('openRouterCatalogSource', () => {
  it('exposes OpenRouter as a provider catalog source descriptor', () => {
    expect(OPENROUTER_PROVIDER_CATALOG_DESCRIPTOR).toMatchObject({
      providerKey: 'openrouter',
      displayName: 'OpenRouter',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      defaultDataSource: 'models_user_primary',
    })
  })

  it('fetches a provider-neutral snapshot through the existing OpenRouter client', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/models/user')) {
        return jsonResponse({
          data: [
            {
              id: 'openai/gpt-test',
              name: 'GPT Test',
              context_length: 128000,
              architecture: {
                input_modalities: ['text'],
                output_modalities: ['text'],
              },
              supported_parameters: ['tools'],
            },
          ],
        })
      }
      if (url.endsWith('/providers')) {
        return jsonResponse({
          data: [
            {
              slug: 'openai',
              name: 'OpenAI',
            },
          ],
        })
      }
      if (url.endsWith('/models/count')) {
        return jsonResponse({ data: { count: 1 } })
      }
      throw new Error(`unexpected URL: ${url}`)
    }) as unknown as typeof fetch
    const source = createOpenRouterCatalogSource({ fetchImpl, enableCountProbe: true })

    const snapshot = await source.fetchSnapshot({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-test',
      fetchImpl,
    })

    expect(snapshot).toMatchObject({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      providerCount: 1,
      countProbe: { count: 1 },
    })
    expect(snapshot.models.map((model) => model.modelId)).toEqual(['openai/gpt-test'])
    expect(snapshot.providers?.map((provider) => provider.providerKey)).toEqual(['openai'])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models/user',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      }),
    )
  })

  it('requires an apiKey before fetching', async () => {
    const source = createOpenRouterCatalogSource({ fetchImpl: vi.fn() as unknown as typeof fetch })

    await expect(source.fetchSnapshot({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
    })).rejects.toThrow('OpenRouter catalog source requires apiKey')
  })
})
