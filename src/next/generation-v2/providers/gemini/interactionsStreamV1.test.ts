import { describe, expect, it } from 'vitest'
import { createGeminiInteractionsImageTerminalArtifactV1 } from './interactionsTerminalArtifactV1'
import { GeminiInteractionsImageResultAssemblerV1, GeminiInteractionsImageSseDecoderV1,
  GeminiInteractionsImageStreamV1Error } from './interactionsStreamV1'

function sse(events: readonly unknown[]): Uint8Array {
  const frames = events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('')
  return new TextEncoder().encode(frames)
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

  it('rejects text output and incomplete terminals', () => {
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'unexpected' } },
      '[DONE]',
    ])).toThrow(new GeminiInteractionsImageStreamV1Error('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT'))
  })
})
