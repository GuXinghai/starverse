import { describe, expect, it, vi } from 'vitest'
import { createAnthropicCatalogSource } from './anthropicCatalogSource'

describe('anthropicCatalogSource', () => {
  it('fetches Anthropic Models API into a provider catalog snapshot', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          type: 'model',
          id: 'claude-sonnet-4-5',
          display_name: 'Claude Sonnet 4.5',
          created_at: '2026-01-01T00:00:00Z',
          max_input_tokens: 200000,
          max_tokens: 64000,
          capabilities: {
            vision: true,
            tool_use: true,
            extended_thinking: true,
          },
        },
      ],
      has_more: false,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

    const snapshot = await createAnthropicCatalogSource().fetchSnapshot({
      providerKey: 'anthropic_messages',
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com/v1/',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://api.anthropic.com/v1/models?limit=100', expect.objectContaining({
      method: 'GET',
      headers: {
        'x-api-key': 'sk-ant-test',
        'anthropic-version': '2023-06-01',
      },
      redirect: 'error',
    }))
    expect(snapshot).toMatchObject({
      providerKey: 'anthropic_messages',
      baseUrl: 'https://api.anthropic.com/v1',
      dataSource: 'models_user_primary',
      models: [
        expect.objectContaining({
          providerKey: 'anthropic_messages',
          modelId: 'claude-sonnet-4-5',
          modelKey: 'anthropic_messages::claude-sonnet-4-5',
          displayName: 'Claude Sonnet 4.5',
          vendor: 'Anthropic',
          family: 'claude',
          status: 'active',
          visibility: 'visible',
          contextLength: 200000,
          maxOutputTokens: 64000,
          inputModalities: ['text', 'image'],
          capabilities: expect.objectContaining({
            reasoning: true,
            tools: true,
            vision: true,
            longContext: true,
          }),
        }),
      ],
    })
    expect(JSON.stringify(snapshot)).not.toContain('sk-ant-test')
  })
})
