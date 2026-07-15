import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_STABLE_SSE_MAX_PENDING_FRAME_BYTES_V1,
  DEEPSEEK_STABLE_STREAM_MAX_NATIVE_OUTPUT_BYTES_V1,
  DeepSeekStableChatStreamAssemblerV1,
  DeepSeekStableSseDecoderV1,
} from './chatStreamV1'

function chunk(input: Readonly<{
  delta?: unknown
  finishReason?: string | null
  choices?: unknown[]
  usage?: unknown
}>) {
  return {
    id: 'resp_1', model: 'deepseek-v4-pro', created: 1,
    system_fingerprint: 'fp_1', object: 'chat.completion.chunk',
    choices: input.choices ?? [{ index: 0, delta: input.delta ?? {}, finish_reason: input.finishReason ?? null, logprobs: null }],
    ...(input.usage === undefined ? {} : { usage: input.usage }),
  }
}

const usage = {
  prompt_tokens: 5, completion_tokens: 7, total_tokens: 12,
  prompt_cache_hit_tokens: 2, prompt_cache_miss_tokens: 3,
  completion_tokens_details: { reasoning_tokens: 4 },
} as const

describe('DeepSeek stable Chat stream V1', () => {
  it('assembles reasoning, content and fragmented multi-tool deltas into one native assistant message', () => {
    const assembler = new DeepSeekStableChatStreamAssemblerV1('enabled')
    expect(assembler.pushChunk(chunk({ delta: { role: 'assistant', reasoning_content: 'Think ' } })))
      .toMatchObject({ reasoningDelta: 'Think ' })
    assembler.pushChunk(chunk({ delta: {
      reasoning_content: 'more', content: 'Checking',
      tool_calls: [
        { index: 0, id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city"' } },
        { index: 1, id: 'call_2', type: 'function', function: { name: 'date', arguments: '{}' } },
      ],
    } }))
    assembler.pushChunk(chunk({ delta: {
      tool_calls: [{ index: 0, function: { arguments: ':"杭州"}' } }],
    }, finishReason: 'tool_calls' }))
    assembler.pushChunk(chunk({ choices: [], usage }))
    const result = assembler.acceptDone()
    expect(result.assistantMessage).toEqual({
      role: 'assistant', content: 'Checking', reasoning_content: 'Think more',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city":"杭州"}' } },
        { id: 'call_2', type: 'function', function: { name: 'date', arguments: '{}' } },
      ],
    })
    expect(result.finishReason).toBe('tool_calls')
    expect(result.generatedWithThinking).toBe('enabled')
  })

  it('accepts the formal insufficient_system_resource finish and a usage tail before DONE', () => {
    const assembler = new DeepSeekStableChatStreamAssemblerV1('disabled')
    assembler.pushChunk(chunk({ delta: { content: 'partial' }, finishReason: 'insufficient_system_resource' }))
    assembler.pushChunk(chunk({ choices: [], usage }))
    const result = assembler.acceptDone()
    expect(result.finishReason).toBe('insufficient_system_resource')
    expect(result.assistantMessage.content).toBe('partial')
    expect(result.usage?.total_tokens).toBe(12)
  })

  it('requires exactly one usage-only tail after finish and rejects unknown or incomplete terminal data', () => {
    expect(() => new DeepSeekStableChatStreamAssemblerV1('disabled').pushChunk(chunk({ choices: [], usage })))
      .toThrow('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
    const assembler = new DeepSeekStableChatStreamAssemblerV1('disabled')
    assembler.pushChunk(chunk({ delta: { content: 'ok' }, finishReason: 'stop' }))
    assembler.pushChunk(chunk({ choices: [], usage }))
    expect(() => assembler.pushChunk(chunk({ choices: [], usage })))
      .toThrow('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')
    expect(assembler.acceptDone().usage).toMatchObject({ total_tokens: 12, completion_tokens_details: { reasoning_tokens: 4 } })

    expect(() => new DeepSeekStableChatStreamAssemblerV1('disabled').pushChunk(chunk({
      delta: { content: 'bad' }, usage,
    }))).toThrow('GENERATION_V2_DEEPSEEK_STREAM_SEQUENCE_INVALID')

    expect(() => new DeepSeekStableChatStreamAssemblerV1('disabled').pushChunk(chunk({ finishReason: 'error' })))
      .toThrow('GENERATION_V2_DEEPSEEK_STREAM_INVALID_VALUE')
    const incomplete = new DeepSeekStableChatStreamAssemblerV1('enabled')
    incomplete.pushChunk(chunk({ delta: {
      tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { arguments: '{}' } }],
    }, finishReason: 'tool_calls' }))
    incomplete.pushChunk(chunk({ choices: [], usage }))
    expect(() => incomplete.acceptDone()).toThrow('GENERATION_V2_DEEPSEEK_STREAM_TOOL_CALL_INCOMPLETE')

    const missingReasoning = new DeepSeekStableChatStreamAssemblerV1('enabled')
    missingReasoning.pushChunk(chunk({ delta: {
      tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'a', arguments: '{}' } }],
    }, finishReason: 'tool_calls' }))
    missingReasoning.pushChunk(chunk({ choices: [], usage }))
    expect(() => missingReasoning.acceptDone())
      .toThrow('GENERATION_V2_DEEPSEEK_THINKING_REASONING_CONTENT_REQUIRED')

    const contradictory = new DeepSeekStableChatStreamAssemblerV1('disabled')
    contradictory.pushChunk(chunk({ delta: {
      tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'a', arguments: '{}' } }],
    }, finishReason: 'stop' }))
    contradictory.pushChunk(chunk({ choices: [], usage }))
    expect(() => contradictory.acceptDone()).toThrow('GENERATION_V2_DEEPSEEK_STREAM_TERMINAL_INVALID')
  })

  it('frames SSE only at a blank line across every byte boundary and keeps DONE explicit', () => {
    const json = JSON.stringify(chunk({ delta: { reasoning_content: '思考' }, finishReason: 'stop' }))
    const wire = `data: ${json}\r\n\r\ndata: [DONE]\n\n`
    for (let split = 0; split <= new TextEncoder().encode(wire).length; split += 1) {
      const bytes = new TextEncoder().encode(wire)
      const decoder = new DeepSeekStableSseDecoderV1()
      const events = [
        ...decoder.push(bytes.slice(0, split)),
        ...decoder.push(bytes.slice(split)),
        ...decoder.finish(),
      ]
      expect(events.map((event) => event.type)).toEqual(['json', 'done'])
    }
  })

  it('does not flush on a single line ending and rejects premature EOF, duplicate terminal and metadata drift', () => {
    const decoder = new DeepSeekStableSseDecoderV1()
    expect(decoder.push(new TextEncoder().encode('data: {"x":1}\n'))).toEqual([])
    expect(() => decoder.finish()).toThrow('GENERATION_V2_DEEPSEEK_SSE_PREMATURE_EOF')

    const assembler = new DeepSeekStableChatStreamAssemblerV1('disabled')
    assembler.pushChunk(chunk({ finishReason: 'stop' }))
    assembler.pushChunk(chunk({ choices: [], usage }))
    assembler.acceptDone()
    expect(() => assembler.acceptDone()).toThrow('GENERATION_V2_DEEPSEEK_STREAM_TERMINAL_INVALID')

    const drift = new DeepSeekStableChatStreamAssemblerV1('disabled')
    drift.pushChunk(chunk({ delta: { content: 'a' } }))
    expect(() => drift.pushChunk({ ...chunk({ delta: { content: 'b' } }), id: 'resp_2' }))
      .toThrow('GENERATION_V2_DEEPSEEK_STREAM_METADATA_MISMATCH')

    const malformedUtf8 = new DeepSeekStableSseDecoderV1()
    expect(() => malformedUtf8.push(new Uint8Array([0xc3, 0x28])))
      .toThrow('GENERATION_V2_DEEPSEEK_SSE_INVALID')
  })

  it('requires one DONE and rejects duplicate or post-DONE data', () => {
    const json = JSON.stringify(chunk({ finishReason: 'stop' }))
    const missing = new DeepSeekStableSseDecoderV1()
    missing.push(new TextEncoder().encode(`data: ${json}\n\n`))
    expect(() => missing.finish()).toThrow('GENERATION_V2_DEEPSEEK_SSE_PREMATURE_EOF')

    const duplicate = new DeepSeekStableSseDecoderV1()
    expect(() => duplicate.push(new TextEncoder().encode('data: [DONE]\n\ndata: [DONE]\n\n')))
      .toThrow('GENERATION_V2_DEEPSEEK_SSE_INVALID')

    const postDone = new DeepSeekStableSseDecoderV1()
    expect(() => postDone.push(new TextEncoder().encode(`data: [DONE]\n\ndata: ${json}\n\n`)))
      .toThrow('GENERATION_V2_DEEPSEEK_SSE_INVALID')

    const commentAfterDone = new DeepSeekStableSseDecoderV1()
    expect(() => commentAfterDone.push(new TextEncoder().encode('data: [DONE]\n\n: keepalive\n\n')))
      .toThrow('GENERATION_V2_DEEPSEEK_SSE_INVALID')
  })

  it('bounds pending SSE frames and aggregate native output', () => {
    const decoder = new DeepSeekStableSseDecoderV1()
    expect(() => decoder.push(new Uint8Array(DEEPSEEK_STABLE_SSE_MAX_PENDING_FRAME_BYTES_V1 + 1).fill(0x61)))
      .toThrow('GENERATION_V2_DEEPSEEK_STREAM_LIMIT_EXCEEDED')

    const completeOversizedFrame = new DeepSeekStableSseDecoderV1()
    const oversizedComment = `:${'x'.repeat(DEEPSEEK_STABLE_SSE_MAX_PENDING_FRAME_BYTES_V1)}\n\n`
    expect(() => completeOversizedFrame.push(new TextEncoder().encode(oversizedComment)))
      .toThrow('GENERATION_V2_DEEPSEEK_STREAM_LIMIT_EXCEEDED')

    const assembler = new DeepSeekStableChatStreamAssemblerV1('disabled')
    expect(() => assembler.pushChunk(chunk({
      delta: { content: 'x'.repeat(DEEPSEEK_STABLE_STREAM_MAX_NATIVE_OUTPUT_BYTES_V1 + 1) },
    }))).toThrow('GENERATION_V2_DEEPSEEK_STREAM_LIMIT_EXCEEDED')
  })
})
