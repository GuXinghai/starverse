import { describe, expect, it } from 'vitest'
import { OpenAIResponsesStreamAssemblerV1, OpenAIResponsesTypedSseDecoderV1 } from './responsesStreamV1'

function event(type: string, sequence_number: number, value: Record<string, unknown> = {}) {
  const data = JSON.stringify({ type, sequence_number, ...value })
  return new TextEncoder().encode(`event: ${type}\ndata: ${data}\n\n`)
}

function response(status: 'completed' | 'failed' | 'incomplete', output: unknown[]) {
  return {
    id: 'resp_1', object: 'response', created_at: 1, completed_at: status === 'completed' ? 2 : null,
    status, model: 'gpt-5.6-sol', output, usage: status === 'completed' ? {
      input_tokens: 3, output_tokens: 4, total_tokens: 7,
      input_tokens_details: { cached_tokens: 1 }, output_tokens_details: { reasoning_tokens: 2 },
    } : null,
    error: status === 'failed' ? { code: 'server_error', message: 'failed' } : null,
    incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
  }
}

describe('OpenAI Responses typed SSE V1', () => {
  it('assembles visible and reasoning deltas but accepts terminal output as native truth', () => {
    const decoder = new OpenAIResponsesTypedSseDecoderV1()
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    const output = [
      { id: 'rs_1', type: 'reasoning', status: 'completed', summary: [{ type: 'summary_text', text: 'why' }], encrypted_content: 'enc' },
      { id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello', annotations: [] }] },
      { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{"city":"Paris"}', status: 'completed' },
    ]
    const chunks = [
      event('response.reasoning_summary_text.delta', 1, { item_id: 'rs_1', output_index: 0, summary_index: 0, delta: 'why' }),
      event('response.output_text.delta', 2, { item_id: 'msg_1', output_index: 1, content_index: 0, delta: 'hello' }),
      event('response.output_item.done', 3, { output_index: 0, item: output[0] }),
      event('response.output_item.done', 4, { output_index: 1, item: output[1] }),
      event('response.output_item.done', 5, { output_index: 2, item: output[2] }),
      event('response.completed', 6, { response: response('completed', output) }),
    ]
    for (const chunk of chunks) for (const decoded of decoder.push(chunk)) assembler.push(decoded)
    for (const decoded of decoder.finish()) assembler.push(decoded)
    expect(assembler.finish()).toMatchObject({
      terminalKind: 'completed', visibleText: 'hello', reasoningSummaryText: 'why',
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7, cachedInputTokens: 1, reasoningTokens: 2 },
    })
    expect(assembler.finish().output).toEqual(output)
  })

  it('preserves failed and incomplete terminal distinctions', () => {
    for (const status of ['failed', 'incomplete'] as const) {
      const decoder = new OpenAIResponsesTypedSseDecoderV1()
      const assembler = new OpenAIResponsesStreamAssemblerV1()
      for (const decoded of decoder.push(event(`response.${status}`, 1, { response: response(status, []) }))) assembler.push(decoded)
      decoder.finish()
      expect(assembler.finish()).toMatchObject({ terminalKind: status })
    }
  })

  it('rejects DONE, sequence gaps, delta/terminal mismatch and done-item drift', () => {
    const done = new OpenAIResponsesTypedSseDecoderV1()
    expect(() => done.push(new TextEncoder().encode('event: response.completed\ndata: [DONE]\n\n'))).toThrow('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
    const sequence = new OpenAIResponsesTypedSseDecoderV1()
    sequence.push(event('response.in_progress', 1, { response: {} }))
    expect(() => sequence.push(event('response.completed', 3, { response: {} }))).toThrow('GENERATION_V2_OPENAI_STREAM_SEQUENCE_INVALID')
    const unsupported = new OpenAIResponsesTypedSseDecoderV1()
    expect(() => unsupported.push(event('response.mcp_call.in_progress', 1, {})))
      .toThrow('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')

    const mismatch = new OpenAIResponsesStreamAssemblerV1()
    mismatch.push({ type: 'response.output_text.delta', sequenceNumber: 1, value: { type: 'response.output_text.delta', sequence_number: 1, delta: 'wrong' } })
    expect(() => mismatch.push({
      type: 'response.completed', sequenceNumber: 2,
      value: { type: 'response.completed', sequence_number: 2, response: response('completed', [{ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'right', annotations: [] }] }]) },
    })).toThrow('GENERATION_V2_OPENAI_STREAM_INCONSISTENT')
  })
})
