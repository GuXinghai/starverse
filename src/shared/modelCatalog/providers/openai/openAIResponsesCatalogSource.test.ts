import { describe, expect, it, vi } from 'vitest'
import { createOpenAIResponsesCatalogSource } from './openAIResponsesCatalogSource'

describe('openAIResponsesCatalogSource', () => {
  it('fetches OpenAI /models into Responses catalog entries without requiring curated capability metadata', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      object: 'list',
      data: [
        {
          object: 'model',
          id: 'gpt-4.1',
          owned_by: 'openai',
          created: 1710000000,
          deprecation_date: '2026-10-23',
        },
        {
          object: 'model',
          id: 'non-curated-model',
          owned_by: 'openai',
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

    const snapshot = await createOpenAIResponsesCatalogSource().fetchSnapshot({
      providerKey: 'openai_responses',
      apiKey: 'sk-openai-test',
      baseUrl: 'https://api.openai.com/v1/',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk-openai-test',
      },
      redirect: 'error',
    }))
    expect(snapshot.models.map((model) => model.modelId)).toEqual(['gpt-4.1', 'non-curated-model'])
    expect(snapshot.models[0]).toMatchObject({
      providerKey: 'openai_responses',
      modelKey: 'openai_responses::gpt-4.1',
      displayName: 'gpt-4.1',
      vendor: 'openai',
      family: 'gpt',
      status: 'active',
      visibility: 'visible',
      createdAtSec: 1710000000,
      expirationDate: '2026-10-23',
      capabilities: expect.objectContaining({
        reasoning: false,
      }),
    })
    expect(snapshot.models[1]).toMatchObject({
      providerKey: 'openai_responses',
      modelKey: 'openai_responses::non-curated-model',
      displayName: 'non-curated-model',
      vendor: 'openai',
      family: 'non',
      status: 'active',
      visibility: 'visible',
      inputModalities: [],
      outputModalities: [],
      capabilities: expect.objectContaining({
        reasoning: false,
        tools: false,
        structuredOutputs: false,
        vision: false,
      }),
    })
    expect(snapshot.models[0]?.raw?.buckets[0]?.payload ?? {}).not.toHaveProperty('capabilitySeed')
    expect(snapshot.rawModelListPayloads).toEqual([expect.objectContaining({
      object: 'list',
      data: expect.arrayContaining([expect.objectContaining({ id: 'gpt-4.1' })]),
    })])
    expect(JSON.stringify(snapshot)).not.toContain('sk-openai-test')
  })
})
