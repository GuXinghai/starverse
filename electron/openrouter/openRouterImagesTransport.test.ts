import { describe, expect, it, vi } from 'vitest'
import { postOpenRouterImagesExactBody } from './openRouterImagesTransport'

describe('OpenRouter Images transport', () => {
  it('posts the compiler-owned serialized body once without fallback or mutation', async () => {
    const serializedBody = '{"model":"m","provider":{"only":["p"],"allow_fallbacks":false}}'
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'x-generation-id': 'gen-1' },
    }))
    const result = await postOpenRouterImagesExactBody({
      baseUrl: 'https://openrouter.ai/api/v1/',
      apiKey: 'secret',
      serializedBody,
      fetchImpl,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/images', expect.objectContaining({
      method: 'POST', body: serializedBody,
    }))
    expect(result.headers['x-generation-id']).toBe('gen-1')
  })
})
