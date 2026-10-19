import { describe, expect, it } from 'vitest'
import {
  OpenRouterChatProviderStreamErrorV1,
  OpenRouterChatStreamAssemblerV1,
} from '../../../../core/generation-v2/providers/openrouter/chatStreamV1'

describe('OpenRouter Chat stream v1', () => {
  it('retains returned images through completed and interrupted native snapshots', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    const images = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw==' } }]
    const annotations = [{ type: 'url_citation', url_citation: { url: 'https://example.test/citation', title: 'source' } }]
    const chunk = { id: 'gen-images', model: 'image-model', choices: [{ index: 0, delta: { images, annotations }, finish_reason: null }] }
    assembler.push(chunk)
    assembler.push({ ...chunk, choices: [{ index: 0, delta: { images }, finish_reason: 'stop' }] })
    expect(assembler.interruptedSnapshot().items[0].images).toEqual(images)
    expect(assembler.interruptedSnapshot().items[0].annotations).toEqual(annotations)
    assembler.done()
    expect(assembler.finish().assistantMessage.images).toEqual(images)
  })
  it('preserves the complete official typed mid-stream provider error payload', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    let captured: unknown
    const event = {
      id: 'gen-1',
      model: 'openai/gpt-4.1-nano',
      choices: [{ index: 0, delta: { content: '' }, finish_reason: null }],
      error: {
        code: 429,
        message: 'sensitive upstream message',
        metadata: { error_type: 'rate_limit_exceeded', provider_code: 'private-provider-code' },
      },
    }
    try {
      assembler.push(event, JSON.stringify(event))
    } catch (error) {
      captured = error
    }

    expect(captured).toBeInstanceOf(OpenRouterChatProviderStreamErrorV1)
    expect(captured).toMatchObject({
      code: 'GENERATION_V2_PROVIDER_REPORTED_ERROR',
      message: 'GENERATION_V2_PROVIDER_REPORTED_ERROR',
      rawPayload: JSON.stringify(event),
    })
  })

  it('preserves the official overview string-code error payload', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    const event = {
      error: { code: 'server_error', message: 'sensitive upstream message' },
    }
    expect(() => assembler.push(event, JSON.stringify(event))).toThrowError(expect.objectContaining({
      code: 'GENERATION_V2_PROVIDER_REPORTED_ERROR',
      message: 'GENERATION_V2_PROVIDER_REPORTED_ERROR',
      rawPayload: JSON.stringify(event),
    }))
  })

  it('rejects malformed provider error metadata as an invalid stream contract', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    expect(() => assembler.push({ error: { code: 429, message: 'x' } }))
      .toThrow('GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID')
  })

  it('accepts official empty-choice debug and early usage chunks without treating them as completion order', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    expect(assembler.push({
      id: 'gen-1', model: 'openai/gpt-4.1-nano', provider: 'OpenAI', choices: [],
      debug: { echo_upstream_body: { model: 'gpt-4.1-nano' } },
    })).toEqual({})
    expect(assembler.push({
      id: 'gen-1', model: 'openai/gpt-4.1-nano', provider: 'OpenAI', choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
    })).toEqual({})
    expect(assembler.push({
      id: 'gen-1', model: 'openai/gpt-4.1-nano', provider: 'OpenAI',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
    })).toEqual({ contentDelta: 'OK' })
    assembler.done()
    expect(assembler.finish()).toMatchObject({
      responseId: 'gen-1', model: 'openai/gpt-4.1-nano', provider: 'OpenAI', finishReason: 'stop',
      assistantMessage: { role: 'assistant', content: 'OK' },
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
    })
  })

  it('retains top-level usage attached to the terminal choice frame', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    const usage = {
      prompt_tokens: 18,
      prompt_tokens_details: { cached_tokens: 4 },
      completion_tokens: 23,
      completion_tokens_details: { reasoning_tokens: 7 },
      total_tokens: 41,
      cost: 0.000031,
      is_byok: true,
      cost_details: { upstream_inference_cost: 0.000029, upstream_inference_input_cost: 0.000011 },
    }
    assembler.push({
      id: 'gen-terminal-usage', model: 'openai/gpt-4.1-nano', provider: 'OpenAI',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'A full response.' }, finish_reason: null }],
    })
    assembler.push({
      id: 'gen-terminal-usage', model: 'openai/gpt-4.1-nano', provider: 'OpenAI',
      choices: [{ index: 0, delta: { content: '', role: 'assistant' }, finish_reason: 'stop' }],
      usage,
    })
    assembler.done()

    expect(assembler.finish()).toMatchObject({
      finishReason: 'stop',
      assistantMessage: { role: 'assistant', content: 'A full response.' },
      usage,
    })
  })

  it('keeps the latest provider finish reason without treating repeated fields as a stream failure', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    assembler.push({
      id: 'gen-repeat', model: 'openai/gpt-4.1-nano', provider: 'OpenAI',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
    })
    assembler.push({
      id: 'gen-repeat', model: 'openai/gpt-4.1-nano', provider: 'OpenAI',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })
    assembler.done()

    expect(assembler.finish()).toMatchObject({
      responseId: 'gen-repeat', finishReason: 'stop',
      assistantMessage: { role: 'assistant', content: 'OK' },
    })
  })

  it('rejects only a structurally invalid non-string finish reason', () => {
    const assembler = new OpenRouterChatStreamAssemblerV1()
    expect(() => assembler.push({
      id: 'gen-invalid', model: 'openai/gpt-4.1-nano',
      choices: [{ index: 0, delta: {}, finish_reason: { value: 'stop' } }],
    })).toThrowError(expect.objectContaining({
      code: 'GENERATION_V2_OPENROUTER_CHAT_STREAM_INVALID',
      detailCode: 'finish_reason_invalid',
    }))
  })
})
