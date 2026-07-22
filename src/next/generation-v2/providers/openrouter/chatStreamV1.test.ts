import { describe, expect, it } from 'vitest'
import {
  OpenRouterChatProviderStreamErrorV1,
  OpenRouterChatStreamAssemblerV1,
} from './chatStreamV1'

describe('OpenRouter Chat stream v1', () => {
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
