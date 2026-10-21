import { describe, expect, it } from 'vitest'
import { OpenAIResponsesStreamAssemblerV1, OpenAIResponsesTypedSseDecoderV1,
  restoreOpenAIResponsesTerminalResultV1 } from '../../../../core/generation-v2/providers/openai-responses/responsesStreamV1'

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
  it('accepts image metadata across added, done, terminal and restored terminal facts', () => {
    const decoder = new OpenAIResponsesTypedSseDecoderV1()
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    const image = { id: 'ig_1', type: 'image_generation_call', status: 'completed', result: 'aW1hZ2U=',
      action: 'generate', revised_prompt: 'Rewritten prompt', size: '1024x1024', quality: 'low',
      background: 'opaque', output_format: 'png' }
    const frames = [event('response.output_item.added', 0, { output_index: 0,
      item: { ...image, status: 'in_progress', result: null } }),
    event('response.output_item.done', 1, { output_index: 0, item: image }),
    event('response.completed', 2, { response: response('completed', [image]) })]
    for (const frame of frames) for (const item of decoder.push(frame)) assembler.push(item)
    decoder.finish()
    expect(assembler.finish().output).toEqual([image])
    expect(assembler.readReplayOutput()).toEqual([image])
    expect(restoreOpenAIResponsesTerminalResultV1(JSON.parse(JSON.stringify(assembler.finish()))).output).toEqual([image])
  })

  it('keeps later field names in bounded diagnostics when image data is long', () => {
    const decoder = new OpenAIResponsesTypedSseDecoderV1()
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    const frame = event('response.output_item.done', 0, { output_index: 0, item: {
      id: 'ig_1', type: 'image_generation_call', status: 'completed', result: 'A'.repeat(12000),
      revised_prompt: 'official field', unexpected_after_image: true,
    } })
    try {
      for (const item of decoder.push(frame)) assembler.push(item)
      expect.fail('Malformed image item should fail')
    } catch (error) {
      expect(error).toMatchObject({ code: 'GENERATION_V2_OPENAI_STREAM_INVALID_EVENT', diagnostic: {
        stage: 'assemble', eventType: 'response.output_item.done',
      } })
      const diagnostic = (error as { diagnostic: { rawFrameExcerpt: string } }).diagnostic.rawFrameExcerpt
      expect(diagnostic.length).toBeLessThanOrEqual(8192)
      expect(diagnostic).toContain('unexpected_after_image')
      expect(diagnostic).toContain('revised_prompt')
      expect(diagnostic).toContain('[string:12000]')
    }
  })
  it('retains the valid prefix of a failed chunk exactly once without accepting the invalid frame', () => {
    const good = event('response.completed', 1, { response: response('completed', []) })
    const bad = event('unknown_event', 2)
    const joined = new Uint8Array(good.length + bad.length)
    joined.set(good)
    joined.set(bad, good.length)
    const sameChunk = new OpenAIResponsesTypedSseDecoderV1()
    const splitChunks = new OpenAIResponsesTypedSseDecoderV1()
    const expected = splitChunks.push(good)
    expect(() => splitChunks.push(bad)).toThrow('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
    expect(splitChunks.takeParsedEventsAfterError()).toEqual([])
    expect(() => sameChunk.push(joined)).toThrow('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
    const prefix = sameChunk.takeParsedEventsAfterError()
    expect(prefix).toEqual(expected)
    expect(prefix.map(item => item.type)).toEqual(['response.completed'])
    expect(Object.isFrozen(prefix)).toBe(true)
    expect(sameChunk.takeParsedEventsAfterError()).toEqual([])
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    for (const item of prefix) assembler.push(item)
    expect(assembler.interruptedSnapshot()).toMatchObject({ complete: true, terminalFact: { terminalKind: 'completed' } })
  })

  it('does not replay returned events when finish rejects a trailing incomplete frame', () => {
    const decoder = new OpenAIResponsesTypedSseDecoderV1()
    const wire = new TextDecoder().decode(event('keepalive', 1)) + 'event: unfinished'
    expect(decoder.push(new TextEncoder().encode(wire))).toHaveLength(1)
    expect(decoder.takeParsedEventsAfterError()).toEqual([])
    expect(() => decoder.finish()).toThrow('GENERATION_V2_OPENAI_STREAM_INVALID_SSE')
    expect(decoder.takeParsedEventsAfterError()).toEqual([])
  })

  it('accepts sequenced keepalive frames without completing or changing the response', () => {
    const decoder = new OpenAIResponsesTypedSseDecoderV1()
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    for (const item of decoder.push(event('keepalive', 5))) assembler.push(item)
    expect(() => assembler.finish()).toThrow('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
    for (const item of decoder.push(event('response.completed', 6, { response: response('completed', []) }))) {
      assembler.push(item)
    }
    expect(assembler.finish()).toMatchObject({ terminalKind: 'completed', visibleText: '' })
    expect(() => new OpenAIResponsesTypedSseDecoderV1().push(event('unknown_event', 1)))
      .toThrow('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
    const sequence = new OpenAIResponsesTypedSseDecoderV1()
    sequence.push(event('keepalive', 5))
    expect(() => sequence.push(event('keepalive', 7))).toThrow('GENERATION_V2_OPENAI_STREAM_SEQUENCE_INVALID')
  })
  const reasoning = { id: 'rs', type: 'reasoning', status: 'completed', summary: [], encrypted_content: 'done-A' }
  const message = { id: 'msg', type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'answer', annotations: [] }] }
  const push = (assembler: OpenAIResponsesStreamAssemblerV1, type: string, value: Record<string, unknown>) =>
    assembler.push({ type, sequenceNumber: 1, value: { type, ...value } })

  it('keeps terminal ciphertext B intact while selecting done ciphertext A for replay', () => {
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    const finalReasoning = { ...reasoning, encrypted_content: 'terminal-B' }
    push(assembler, 'response.output_item.done', { output_index: 0, item: reasoning })
    push(assembler, 'response.completed', { response: response('completed', [finalReasoning, message]) })
    expect(assembler.finish().output).toEqual([finalReasoning, message])
    expect(assembler.readReplayOutput()).toEqual([reasoning, message])
    expect(assembler.interruptedSnapshot()).toMatchObject({ complete: true, items: [reasoning, message],
      terminalFact: { output: [finalReasoning, message] } })
  })

  it.each([undefined, null, ''])('falls back from unavailable done ciphertext %s to the complete terminal item', encrypted_content => {
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    const { encrypted_content: _cipher, ...base } = reasoning
    push(assembler, 'response.output_item.done', { output_index: 0,
      item: encrypted_content === undefined ? base : { ...base, encrypted_content } })
    push(assembler, 'response.completed', { response: response('completed', [reasoning, message]) })
    expect(assembler.readReplayOutput()).toEqual([reasoning, message])
  })

  it('accepts terminal-only complete ciphertext but never promotes added or incomplete ciphertext', () => {
    for (const terminalReasoning of [reasoning, { ...reasoning, status: 'incomplete' },
      { ...reasoning, encrypted_content: null }, { id: 'rs', type: 'reasoning', summary: [] }]) {
      const assembler = new OpenAIResponsesStreamAssemblerV1()
      push(assembler, 'response.output_item.added', { output_index: 0,
        item: { ...reasoning, encrypted_content: 'added-truncated', status: 'in_progress' } })
      push(assembler, 'response.completed', { response: response('completed', [terminalReasoning, message]) })
      expect(assembler.finish().output[0]).toEqual(terminalReasoning)
      expect(assembler.readReplayOutput()).toEqual(terminalReasoning === reasoning ? [reasoning, message] : [message])
    }
  })

  it.each([
    { ...reasoning, id: 'different' }, { ...reasoning, status: 'incomplete' },
    { ...reasoning, summary: [{ type: 'summary_text', text: 'different' }] },
    { ...reasoning, content: [{ type: 'reasoning_text', text: 'different' }] }, message,
  ])('rejects semantic reasoning drift and retains the conflicting terminal fact', finalItem => {
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    push(assembler, 'response.output_item.done', { output_index: 0, item: reasoning })
    expect(() => push(assembler, 'response.completed', { response: response('completed', [finalItem]) }))
      .toThrow('GENERATION_V2_OPENAI_STREAM_INCONSISTENT')
    expect(assembler.interruptedSnapshot()).toMatchObject({ complete: false, items: [reasoning],
      terminalFact: { output: [finalItem] } })
    expect(() => assembler.finish()).toThrow('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
  })

  it('still rejects missing/reordered items, duplicate done, message text and tool argument conflicts', () => {
    const tool = { id: 'fc', type: 'function_call', call_id: 'call', name: 'weather', arguments: '{}' }
    for (const [done, output] of [
      [reasoning, []], [reasoning, [message, reasoning]],
      [message, [{ ...message, content: [{ type: 'output_text', text: 'different', annotations: [] }] }]],
      [tool, [{ ...tool, arguments: '{"city":"Paris"}' }]],
    ] as const) {
      const assembler = new OpenAIResponsesStreamAssemblerV1()
      push(assembler, 'response.output_item.done', { output_index: 0, item: done })
      expect(() => push(assembler, 'response.completed', { response: response('completed', [...output]) }))
        .toThrow('GENERATION_V2_OPENAI_STREAM_INCONSISTENT')
    }
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    push(assembler, 'response.output_item.done', { output_index: 0, item: reasoning })
    expect(() => push(assembler, 'response.output_item.done', { output_index: 0, item: reasoning }))
      .toThrow('GENERATION_V2_OPENAI_STREAM_INCONSISTENT')
  })

  it.each(['failed', 'incomplete'] as const)('preserves %s and its raw terminal fact without promoting per-item completion', status => {
    for (const output of [[], [{ ...reasoning, encrypted_content: 'terminal-B' }]]) {
      const assembler = new OpenAIResponsesStreamAssemblerV1()
      push(assembler, 'response.output_item.done', { output_index: 0, item: reasoning })
      push(assembler, `response.${status}`, { response: response(status, output) })
      expect(assembler.finish().terminalKind).toBe(status)
      expect(assembler.interruptedSnapshot()).toMatchObject({ complete: false, items: [reasoning],
        terminalFact: { terminalKind: status, output } })
    }
  })

  it('accepts the observed additive completion metadata and cache-write usage', () => {
    const decoder = new OpenAIResponsesTypedSseDecoderV1()
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    const completed = { ...response('completed', [
      { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'OpenAI连接成功。', annotations: [], logprobs: [] }] },
    ]), access_programs: null, moderation: null, frequency_penalty: 0, presence_penalty: 0,
      tool_usage: { web_search: { num_requests: 0 } },
      usage: { input_tokens: 22, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens: 6, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 28 } }
    for (const item of decoder.push(event('response.completed', 1, { response: completed }))) assembler.push(item)
    expect(assembler.finish()).toMatchObject({ terminalKind: 'completed', visibleText: 'OpenAI连接成功。',
      usage: { inputTokens: 22, outputTokens: 6, totalTokens: 28 } })
    const invalidUsage = new OpenAIResponsesStreamAssemblerV1()
    expect(() => invalidUsage.push({ type: 'response.completed', sequenceNumber: 1,
      value: { type: 'response.completed', response: { ...completed, usage: { ...completed.usage,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: -1 } } } } }))
      .toThrow('GENERATION_V2_OPENAI_STREAM_INVALID_EVENT')
  })

  it('retains a bounded diagnostic for an invalid native item without changing the rejection', () => {
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    try {
      assembler.push({ type: 'response.output_item.done', sequenceNumber: 1,
        value: { type: 'response.output_item.done', output_index: 0, item: { type: 'invalid', text: 'x'.repeat(20_000) } } })
      throw new Error('expected stream rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'GENERATION_V2_OPENAI_STREAM_INVALID_EVENT',
        diagnostic: { stage: 'assemble', eventType: 'response.output_item.done' } })
      expect((error as any).diagnostic.rawFrameExcerpt.length).toBeLessThanOrEqual(8192)
    }
  })

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

  it.each(['failed', 'incomplete'] as const)('restores the durable %s outcome without changing its native output', status => {
    const error = status === 'failed' ? { code: 'server_error', message: 'provider failed' } : null
    const incompleteReason = status === 'incomplete' ? 'max_output_tokens' : null
    const restored = restoreOpenAIResponsesTerminalResultV1({
      terminalKind: status, responseId: 'resp_terminal', model: 'gpt-5.6-sol', createdAt: 1, completedAt: null,
      output: [{ ...reasoning, status: 'incomplete', encrypted_content: 'ciphertext-kept' }],
      visibleText: '', reasoningSummaryText: '', usage: null, error, incompleteReason,
    })
    expect(restored).toMatchObject({ terminalKind: status, error, incompleteReason,
      output: [{ type: 'reasoning', status: 'incomplete', encrypted_content: 'ciphertext-kept' }] })
    expect(() => restoreOpenAIResponsesTerminalResultV1({
      terminalKind: status, responseId: 'resp_terminal', model: 'gpt-5.6-sol', createdAt: 1, completedAt: null,
      output: [], visibleText: '', reasoningSummaryText: '', usage: null,
      error: status === 'failed' ? null : error, incompleteReason: status === 'incomplete' ? null : incompleteReason,
    })).toThrow('GENERATION_V2_OPENAI_STREAM_TERMINAL_INVALID')
  })

  it('restores terminal native output above the legacy per-item limit', () => {
    const text = 'x'.repeat(9 * 1024 * 1024)
    const restored = restoreOpenAIResponsesTerminalResultV1({
      terminalKind: 'completed', responseId: 'resp_large', model: 'model:test', createdAt: 1, completedAt: 2,
      output: [{ id: 'msg_large', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text, annotations: [], logprobs: [] }] }],
      visibleText: text, reasoningSummaryText: '', usage: null, error: null, incompleteReason: null,
    })
    expect(restored.output[0]).toMatchObject({ type: 'message', content: [{ text }] })
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
