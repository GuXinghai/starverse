import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchGenerationInfo } from './fetchGeneration'

describe('fetchGenerationInfo', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('fetches generation info with correct URL and headers', async () => {
    const mockData = {
      data: {
        id: 'gen_abc123',
        total_cost: 0.0025,
        model: 'openai/gpt-4',
        provider: 'OpenAI',
        streamed: true,
        generation_time: 1234,
        created_at: '2025-12-13T10:00:00Z',
        tokens_prompt: 100,
        tokens_completion: 200,
        native_tokens_prompt: 100,
        native_tokens_completion: 200,
        finish_reason: 'stop',
      },
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await fetchGenerationInfo('gen_abc123', 'sk-or-test-key')

    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/generation?id=gen_abc123',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer sk-or-test-key',
        },
      })
    )

    expect(result.id).toBe('gen_abc123')
    expect(result.model).toBe('openai/gpt-4')
    expect(result.tokens_prompt).toBe(100)
    expect(result.tokens_completion).toBe(200)
    expect(result.total_cost).toBe(0.0025)
  })

  it('uses custom baseUrl when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'gen_123' } }),
    })

    await fetchGenerationInfo('gen_123', 'sk-test', {
      baseUrl: 'https://custom.api.com/v1',
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://custom.api.com/v1/generation?id=gen_123',
      expect.anything()
    )
  })

  it('encodes generationId in URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'gen_with spaces&special' } }),
    })

    await fetchGenerationInfo('gen_with spaces&special', 'sk-test')

    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/generation?id=gen_with%20spaces%26special',
      expect.anything()
    )
  })

  it('throws error with status info when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    await expect(
      fetchGenerationInfo('gen_nonexistent', 'sk-test')
    ).rejects.toThrow('Failed to fetch generation info: 404 Not Found')
  })

  it('throws error on 401 unauthorized', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    await expect(fetchGenerationInfo('gen_123', 'invalid-key')).rejects.toThrow(
      'Failed to fetch generation info: 401 Unauthorized'
    )
  })

  it('passes AbortSignal to fetch', async () => {
    const controller = new AbortController()

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'gen_123' } }),
    })

    await fetchGenerationInfo('gen_123', 'sk-test', {
      signal: controller.signal,
    })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: controller.signal,
      })
    )
  })
})
