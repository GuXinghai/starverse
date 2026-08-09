import { describe, expect, it } from 'vitest'
import { createGeminiInteractionsImageTerminalArtifactV2 } from './interactionsTerminalArtifactV2'
import { GeminiInteractionsImageResultAssemblerV1, GeminiInteractionsImageSseDecoderV1,
  GeminiInteractionsImageStreamV1Error } from './interactionsStreamV1'

function sse(events: readonly unknown[]): Uint8Array {
  const frames = events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('')
  return new TextEncoder().encode(frames)
}
function officialSse(events: readonly unknown[], lineEnding = '\n', terminate = true): Uint8Array {
  const frames = events.map((event) => {
    const eventType = typeof event === 'string' ? 'done' : (event as Record<string, unknown>).event_type as string
    return `event: ${eventType}${lineEnding}data: ${typeof event === 'string' ? event : JSON.stringify(event)}${lineEnding}${lineEnding}`
  }).join('')
  return new TextEncoder().encode(terminate ? frames : frames.slice(0, -lineEnding.length * 2))
}
function decode(events: readonly unknown[]) {
  const decoder = new GeminiInteractionsImageSseDecoderV1()
  const assembler = new GeminiInteractionsImageResultAssemblerV1()
  for (const event of decoder.push(sse(events))) assembler.push(event)
  for (const event of decoder.finish()) assembler.push(event)
  return assembler.finish()
}
const interaction = { id: 'interaction:1', model: 'gemini-3.1-flash-image', status: 'completed',
  usage: { total_input_tokens: 1, total_output_tokens: 2 } }

describe('Gemini Interactions image SSE V1', () => {
  it('assembles one ordered native image stream and creates a body-free terminal artifact', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1h', mime_type: 'image/jpeg' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'Z2U=' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction },
      '[DONE]',
    ])
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
    expect(result.events.map((event) => event.eventType)).toEqual([
      'interaction.created', 'step.start', 'step.delta', 'step.delta', 'step.stop', 'interaction.completed', 'done',
    ])
    const artifact = createGeminiInteractionsImageTerminalArtifactV2(result)
    expect(artifact.image).toMatchObject({ mime: 'image/jpeg', byteLength: 5 })
    expect(JSON.stringify(artifact)).not.toContain('aW1h')
  })

  it('preserves text and thought summaries alongside the generated image', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'thought' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'thought_summary', text: 'Plan.', thought_signature: 'sig' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'thought_signature', signature: 'sig-raw' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'thought_summary',
        content: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' }, thought_signature: 'sig-image' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'step.start', index: 1, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 1, delta: { type: 'output_text', text: 'Done.' } },
      { event_type: 'step.delta', index: 1, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
      { event_type: 'step.stop', index: 1 },
      { event_type: 'interaction.completed', interaction }, '[DONE]',
    ])
    expect(result.text).toBe('Done.')
    expect(result.reasoningDetails).toEqual([
      { type: 'thought_summary', text: 'Plan.', thoughtSignature: 'sig' },
      { type: 'thought_signature', signature: 'sig-raw' },
      { type: 'thought_image', data: 'aW1hZ2U=', mimeType: 'image/png', thoughtSignature: 'sig-image' },
    ])
    expect(createGeminiInteractionsImageTerminalArtifactV2(result).reasoningDetails).toEqual(result.reasoningDetails)
  })

  it('rejects incomplete terminals', () => {
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, status: 'in_progress' } },
      '[DONE]',
    ])).toThrow(new GeminiInteractionsImageStreamV1Error('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID'))
  })

  it('parses the official event/data stream with text and image deltas', () => {
    const result = decodeWithBytes(officialSse([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'text', text: '千里' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'text', text: '江山' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction }, '[DONE]',
    ]))
    expect(result.text).toBe('千里江山')
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
    expect(result.events.map((event) => event.eventType)).toEqual([
      'interaction.created', 'step.start', 'step.delta', 'step.delta', 'step.delta', 'step.stop', 'interaction.completed', 'done',
    ])
  })

  it('supports CRLF, comments, multiple data lines, network chunk boundaries, and a final frame without a blank line', () => {
    const first = JSON.stringify({ event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } })
    const splitAt = first.indexOf(',"interaction"') + 1
    const firstSplit = `${first.slice(0, splitAt)}\r\ndata: ${first.slice(splitAt)}`
    const remaining = new TextDecoder().decode(officialSse([
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
      { event_type: 'step.stop', index: 0 }, { event_type: 'interaction.completed', interaction }, '[DONE]',
    ], '\r\n', false))
    const body = [
      `: heartbeat\r\n\r\n`, `event: interaction.created\r\ndata: ${firstSplit}\r\n\r\n`,
      remaining,
    ].join('')
    const encoded = new TextEncoder().encode(body)
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    const assembler = new GeminiInteractionsImageResultAssemblerV1()
    for (let offset = 0; offset < encoded.length; offset += 3) {
      for (const event of decoder.push(encoded.slice(offset, Math.min(offset + 3, encoded.length)))) assembler.push(event)
    }
    for (const event of decoder.finish()) assembler.push(event)
    expect(new TextDecoder().decode(assembler.finish().bytes)).toBe('image')
  })

  it('accepts an SSE-only discriminator and rejects conflicting discriminators', () => {
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    const event = { interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } }
    expect(decoder.push(new TextEncoder().encode(`event: interaction.created\ndata: ${JSON.stringify(event)}\n\n`))[0].eventType)
      .toBe('interaction.created')
    const mismatch = new GeminiInteractionsImageSseDecoderV1()
    expect(() => mismatch.push(new TextEncoder().encode('event: step.delta\ndata: {"event_type":"step.stop","index":0}\n\n')))
      .toThrow(new GeminiInteractionsImageStreamV1Error('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_EVENT_MISMATCH'))
  })

  it('keeps provider stream errors distinct from invalid SSE and validates terminal frames', () => {
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    const events = decoder.push(new TextEncoder().encode(
      'event: error\ndata: {"event_type":"error","error":{"code":"bad_request","message":"No image"}}\n\n' +
      'event: done\ndata: [DONE]\n\n'))
    expect(events.map((event) => event.eventType)).toEqual(['error', 'done'])
    expect(() => new GeminiInteractionsImageSseDecoderV1().push(new TextEncoder().encode('event: step.delta\ndata: {bad}\n\n')))
      .toThrow(new GeminiInteractionsImageStreamV1Error('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE'))
    const truncated = new GeminiInteractionsImageSseDecoderV1()
    truncated.push(new TextEncoder().encode('event: interaction.created\ndata: {"event_type":"interaction.created"}'))
    expect(() => truncated.finish()).toThrow()
  })

  it('preserves the raw Provider error when the stream closes without a done frame', () => {
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    const assembler = new GeminiInteractionsImageResultAssemblerV1()
    for (const event of decoder.push(new TextEncoder().encode(
      'event: interaction.created\ndata: {"event_type":"interaction.created","interaction":{"id":"interaction:1","model":"gemini-3.1-flash-image","status":"in_progress"}}\n\n' +
      'event: error\ndata: {"event_type":"error","error":{"code":"INVALID_ARGUMENT","status":"INVALID_ARGUMENT","message":"bad prompt"}}\n\n'))) assembler.push(event)
    for (const event of decoder.finish()) assembler.push(event)
    expect(() => assembler.finish()).toThrowError(expect.objectContaining({
      code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED',
      providerError: { code: 'INVALID_ARGUMENT', status: 'INVALID_ARGUMENT', message: 'bad prompt' },
    }))
  })

  it('keeps Google Search call/result steps out of the image assembler and preserves raw evidence', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'google_search_call', id: 'search-1' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'google_search_call', arguments: { queries: ['red apple'] }, signature: 'sig-call' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'step.start', index: 1, step: { type: 'google_search_result', call_id: 'search-1' } },
      { event_type: 'step.delta', index: 1, delta: { type: 'google_search_result', is_error: true,
        result: [{ search_suggestions: '<div>Apple result</div>' }] } },
      { event_type: 'step.stop', index: 1 },
      { event_type: 'step.start', index: 2, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 2, delta: { type: 'text', text: 'Found it.', annotations: [
        { type: 'url_citation', url: 'https://example.test/apple', title: 'Apple', start_index: 0, end_index: 5 },
      ] } },
      { event_type: 'step.delta', index: 2, delta: { type: 'text_annotation_delta', annotations: [
        { type: 'url_citation', url: 'https://example.test/second', title: 'Second source', start_index: 6, end_index: 9 },
      ] } },
      { event_type: 'step.delta', index: 2, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
      { event_type: 'step.stop', index: 2 },
      { event_type: 'interaction.completed', interaction }, '[DONE]',
    ])
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
    expect(result.searchEvidence.calls).toEqual([{ stepIndex: 0, id: 'search-1', arguments: { queries: ['red apple'] }, signature: 'sig-call' }])
    expect(result.searchEvidence.results[0]).toMatchObject({ callId: 'search-1', isError: true, searchSuggestions: '<div>Apple result</div>' })
    expect(result.searchEvidence.annotations).toEqual([
      { type: 'url_citation', url: 'https://example.test/apple', title: 'Apple', start_index: 0, end_index: 5 },
      { type: 'url_citation', url: 'https://example.test/second', title: 'Second source', start_index: 6, end_index: 9 },
    ])
    expect(result.searchEvidence.events.map((event) => event.stepType)).toEqual([
      'google_search_call', 'google_search_call', 'google_search_call',
      'google_search_result', 'google_search_result', 'google_search_result',
    ])
    const artifact = createGeminiInteractionsImageTerminalArtifactV2(result)
    expect(artifact.artifactKind).toBe('gemini_interactions_image_terminal_v2')
    expect(JSON.stringify(artifact.searchEvidence)).toContain('Apple result')
    expect(JSON.stringify(artifact.searchEvidence)).not.toContain('aW1hZ2U=')
  })

  it('reports an unknown server-side tool with its raw event instead of invalid SSE', () => {
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    expect(() => decoder.push(new TextEncoder().encode(
      'event: step.start\ndata: {"event_type":"step.start","index":0,"step":{"type":"code_execution_call","id":"code-1"}}\n\n',
    ))).toThrowError(expect.objectContaining({
      code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_SERVER_TOOL_STEP',
      rawEvent: expect.objectContaining({ event_type: 'step.start' }),
    }))
  })
})

function decodeWithBytes(bytes: Uint8Array) {
  const decoder = new GeminiInteractionsImageSseDecoderV1()
  const assembler = new GeminiInteractionsImageResultAssemblerV1()
  for (const event of decoder.push(bytes)) assembler.push(event)
  for (const event of decoder.finish()) assembler.push(event)
  return assembler.finish()
}
