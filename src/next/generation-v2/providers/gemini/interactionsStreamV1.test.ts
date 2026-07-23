import { describe, expect, it } from 'vitest'
import { createGeminiInteractionsImageTerminalArtifactV1 } from './interactionsTerminalArtifactV1'
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
    const artifact = createGeminiInteractionsImageTerminalArtifactV1(result)
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
    expect(createGeminiInteractionsImageTerminalArtifactV1(result).reasoningDetails).toEqual(result.reasoningDetails)
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
})

function decodeWithBytes(bytes: Uint8Array) {
  const decoder = new GeminiInteractionsImageSseDecoderV1()
  const assembler = new GeminiInteractionsImageResultAssemblerV1()
  for (const event of decoder.push(bytes)) assembler.push(event)
  for (const event of decoder.finish()) assembler.push(event)
  return assembler.finish()
}
