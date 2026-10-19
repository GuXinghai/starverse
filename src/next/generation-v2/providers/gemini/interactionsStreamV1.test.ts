import { describe, expect, it } from 'vitest'
import { createGeminiInteractionsImageTerminalArtifactV2, serializeGeminiInteractionsImageTerminalArtifactV2 } from '../../../../core/generation-v2/providers/gemini/interactionsTerminalArtifactV2'
import { stableSerializeProviderRequestV2 } from '../../../../core/generation-v2/compiler/stableSerialize'
import { sha256Hex } from '../../../../shared/crypto/sha256Hex'
import { GeminiInteractionsImageResultAssemblerV1, GeminiInteractionsImageSseDecoderV1,
  GeminiInteractionsImageStreamV1Error, type GeminiInteractionsImageNativeEventV1 } from '../../../../core/generation-v2/providers/gemini/interactionsStreamV1'
import { GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 } from '../../../../core/generation-v2/capacity/generationCapacityV1'

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
  const assembler = new GeminiInteractionsImageResultAssemblerV1('gemini-3.1-flash-image')
  for (const event of decoder.push(sse(events))) assembler.push(event)
  for (const event of decoder.finish()) assembler.push(event)
  return assembler.finish()
}
const interaction = { id: 'interaction:1', model: 'gemini-3.1-flash-image', status: 'completed',
  usage: { total_input_tokens: 1, total_output_tokens: 2 } }

describe('Gemini Interactions image SSE V1', () => {
  it.each([undefined, '', 'interaction:known'])('treats empty optional IDs as absent and retains known identity (%s)', (createdId) => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { ...(createdId === undefined ? {} : { id: createdId }), model: interaction.model } },
      { event_type: 'interaction.status_update', interaction_id: '', status: 'in_progress' },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction: { id: '', status: 'completed' } }, '[DONE]',
    ])
    expect(result.interactionId).toBe(createdId || null)
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
  })

  it('accepts the captured partial created frame with a synthetic completed stream', () => {
    const capturedCreatedFrame = { event_type: 'interaction.created',
      interaction: { object: 'interaction', model: 'gemini-3.1-flash-lite-image' } }
    // Only the created frame is captured evidence; the remainder is synthetic fixture data.
    const syntheticSuffix = [
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction: { id: 'interaction:synthetic', status: 'completed' } },
      '[DONE]',
    ]
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    const assembler = new GeminiInteractionsImageResultAssemblerV1('gemini-3.1-flash-lite-image')
    for (const event of decoder.push(sse([capturedCreatedFrame, ...syntheticSuffix]))) assembler.push(event)
    for (const event of decoder.finish()) assembler.push(event)
    const result = assembler.finish()

    expect(result.interactionId).toBe('interaction:synthetic')
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
  })

  it('completes with no provider ID when created, status_update, and terminal omit IDs', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { object: 'interaction', model: interaction.model } },
      { event_type: 'interaction.status_update', status: 'in_progress' },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction: { status: 'completed' } }, '[DONE]',
    ])
    expect(result.interactionId).toBeNull()
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
    const artifact = createGeminiInteractionsImageTerminalArtifactV2(result)
    const serializedArtifact = serializeGeminiInteractionsImageTerminalArtifactV2(artifact)
    const { artifactHash, ...projection } = artifact
    expect(artifact.interactionId).toBeNull()
    expect(JSON.parse(serializedArtifact)).toMatchObject({ interactionId: null, artifactHash })
    expect(artifactHash).toBe(sha256Hex(stableSerializeProviderRequestV2(projection)))
  })

  it('retains a created provider ID when the completed interaction omits it', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, status: 'in_progress', model: interaction.model } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction: { status: 'completed' } }, '[DONE]',
    ])
    expect(result.interactionId).toBe(interaction.id)
  })

  it('still requires completed status when the terminal ID is present', () => {
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.completed', interaction: { id: 'interaction:terminal' } }, '[DONE]',
    ])).toThrow(expect.objectContaining({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT',
      fieldPath: 'interaction.status', diagnosticReason: 'missing_required_field' }))
  })

  it.each([
    ['null created ID', [
      { event_type: 'interaction.created', interaction: { id: null, model: interaction.model } },
      { event_type: 'interaction.completed', interaction: { status: 'completed' } }, '[DONE]',
    ], 'interaction.id'],
    ['non-string created ID', [
      { event_type: 'interaction.created', interaction: { id: 42, model: interaction.model } },
      { event_type: 'interaction.completed', interaction: { status: 'completed' } }, '[DONE]',
    ], 'interaction.id'],
    ['null status_update ID', [
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.status_update', interaction_id: null, status: 'in_progress' },
      { event_type: 'interaction.completed', interaction: { status: 'completed' } }, '[DONE]',
    ], 'interaction_id'],
    ['non-string status_update ID', [
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.status_update', interaction_id: {}, status: 'in_progress' },
      { event_type: 'interaction.completed', interaction: { status: 'completed' } }, '[DONE]',
    ], 'interaction_id'],
    ['null completed ID', [
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.completed', interaction: { id: null, status: 'completed' } }, '[DONE]',
    ], 'interaction.id'],
    ['non-string completed ID', [
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.completed', interaction: { id: {}, status: 'completed' } }, '[DONE]',
    ], 'interaction.id'],
  ] as const)('rejects an explicit invalid %s', (_name, events, fieldPath) => {
    expect(() => decode(events)).toThrow(expect.objectContaining({
      code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', fieldPath, diagnosticReason: 'invalid_string',
    }))
  })

  it('rejects a completed interaction ID that conflicts with a known created ID', () => {
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { id: 'interaction:created', status: 'in_progress', model: interaction.model } },
      { event_type: 'interaction.completed', interaction: { id: 'interaction:completed', status: 'completed' } }, '[DONE]',
    ])).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  })

  it('rejects duplicate created events even when their IDs are absent', () => {
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.created', interaction: { model: interaction.model } }, '[DONE]',
    ])).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  })

  it('rejects streams that begin without interaction.created', () => {
    expect(() => decode([
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } }, '[DONE]',
    ])).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  })

  it('allows status_update to establish identity after partial created and checks later IDs', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.status_update', interaction_id: 'interaction:status', status: 'in_progress' },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction: { id: 'interaction:status', status: 'completed' } }, '[DONE]',
    ])
    expect(result.interactionId).toBe('interaction:status')
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { model: interaction.model } },
      { event_type: 'interaction.status_update', interaction_id: 'interaction:status', status: 'in_progress' },
      { event_type: 'interaction.completed', interaction: { id: 'interaction:other', status: 'completed' } }, '[DONE]',
    ])).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  })

  it('accepts optional continuation metadata and a partial completed interaction without model', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model,
        status: 'in_progress', continuation_token: 'opaque-token' } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction: { id: interaction.id, status: 'completed' } }, '[DONE]',
    ])
    expect(result.model).toBe(interaction.model)
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
  })

  it.each(['interaction.created', 'interaction.completed'])('still rejects a supplied wrong model in %s', event_type => {
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, status: 'in_progress',
        model: event_type === 'interaction.created' ? 'other-model' : interaction.model } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/png' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction: { ...interaction, model: 'other-model' } }, '[DONE]',
    ])).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  })

  it('attaches the failing event and a bounded frame even for generic shape validation errors', () => {
    const raw = { event_type: 'step.delta', index: 'bad', delta: { type: 'image', data: 'x'.repeat(20_000) } }
    try {
      new GeminiInteractionsImageSseDecoderV1().push(officialSse([raw]))
      throw new Error('expected invalid event')
    } catch (error) {
      expect(error).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT',
        eventType: 'step.delta', stepType: 'image', rawEvent: raw, diagnosticStage: 'frame_decode',
        fieldPath: 'index', diagnosticReason: 'invalid_index' })
      expect((error as GeminiInteractionsImageStreamV1Error).rawFrameExcerpt).toContain('"index":"bad"')
      expect((error as GeminiInteractionsImageStreamV1Error).rawFrameExcerpt!.length).toBeLessThanOrEqual(8192)
    }
  })

  it.each([
    ['additional field', { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=' }, future_field: true },
      'future_field', 'unexpected_field'],
    ['missing field', { event_type: 'step.delta', index: 0 }, 'delta', 'missing_required_field'],
    ['nested index type', { event_type: 'step.delta', index: { value: 0 }, delta: { type: 'image', data: 'aW1hZ2U=' } },
      'index', 'invalid_index'],
  ] as const)('pinpoints an INVALID_EVENT %s without recording field values', (_name, raw, fieldPath, reason) => {
    try {
      new GeminiInteractionsImageSseDecoderV1().push(officialSse([raw]))
      throw new Error('expected invalid event')
    } catch (error) {
      expect(error).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT',
        diagnosticStage: 'frame_decode', fieldPath, diagnosticReason: reason })
      expect((error as GeminiInteractionsImageStreamV1Error).diagnosticReason).not.toContain('0')
    }
  })

  it('labels invalid joined Base64 as stream-finish context instead of blaming the last frame', () => {
    try {
      decode([
        { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
        { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
        { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'AA=A', mime_type: 'image/png' } },
        { event_type: 'step.stop', index: 0 },
        { event_type: 'interaction.completed', interaction }, '[DONE]',
      ])
      throw new Error('expected invalid image encoding')
    } catch (error) {
      expect(error).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT',
        diagnosticStage: 'stream_finish', fieldPath: 'image.data', diagnosticReason: 'invalid_base64',
        rawEvent: null, eventType: null, stepType: null, rawFrameExcerpt: null,
        diagnosticContext: { contextKind: 'stream_snapshot', acceptedEventCount: 6, lastAcceptedEventType: 'done' } })
    }
  })

  it('labels assembler shape failures separately from frame decoding', () => {
    const assembler = new GeminiInteractionsImageResultAssemblerV1('gemini-3.1-flash-image')
    assembler.push({ eventType: 'interaction.created', canonicalJson: '{}', raw: {
      event_type: 'interaction.created', interaction: { id: interaction.id, status: 'in_progress' },
    } })
    const invalidStepStart = {
      eventType: 'step.start', canonicalJson: '{"event_type":"step.start","index":"bad"}',
      raw: { event_type: 'step.start', index: 'bad', step: { type: 'model_output' } },
    } as unknown as GeminiInteractionsImageNativeEventV1
    expect(() => assembler.push(invalidStepStart)).toThrow(expect.objectContaining({
      code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', diagnosticStage: 'event_assembly',
      fieldPath: 'index', diagnosticReason: 'invalid_index',
      diagnosticContext: { contextKind: 'failing_frame', eventType: 'step.start' },
    }))
  })

  it('preserves legal events before a bad tail and lets the caller take them once', () => {
    const prefix = { event_type: 'interaction.created', interaction: {
      id: interaction.id, model: interaction.model, status: 'in_progress',
    } }
    const badTail = { event_type: 'step.delta', index: 'bad', delta: { type: 'image', data: 'aW1hZ2U=' } }
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    let sameChunkError: unknown
    try { decoder.push(officialSse([prefix, badTail])) } catch (error) { sameChunkError = error }
    expect(sameChunkError).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT',
      diagnosticStage: 'frame_decode', fieldPath: 'index', diagnosticReason: 'invalid_index' })
    const sameChunkPrefix = decoder.takeParsedEventsAfterError()
    expect(Object.isFrozen(sameChunkPrefix)).toBe(true)
    expect(sameChunkPrefix.map((event) => event.eventType)).toEqual(['interaction.created'])
    expect(decoder.takeParsedEventsAfterError()).toEqual([])
    expect(sameChunkError).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT' })

    const splitDecoder = new GeminiInteractionsImageSseDecoderV1()
    const splitFirstChunk = splitDecoder.push(officialSse([prefix]))
    expect(splitDecoder.takeParsedEventsAfterError()).toEqual([])
    let splitChunkError: unknown
    try { splitDecoder.push(officialSse([badTail])) } catch (error) { splitChunkError = error }
    expect(splitChunkError).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT',
      diagnosticStage: 'frame_decode', fieldPath: 'index', diagnosticReason: 'invalid_index' })
    const splitChunkPrefix = splitDecoder.takeParsedEventsAfterError()
    expect([...splitFirstChunk, ...splitChunkPrefix]).toEqual(sameChunkPrefix)
    expect(splitDecoder.takeParsedEventsAfterError()).toEqual([])
  })

  it('labels EOF without DONE as stream-finish context and keeps frame parse errors distinct', () => {
    const raw = { event_type: 'interaction.created', interaction: {
      id: interaction.id, model: interaction.model, status: 'in_progress',
    } }
    const missingDone = new GeminiInteractionsImageSseDecoderV1()
    missingDone.push(officialSse([raw], '\n', false))
    let finishError: unknown
    try { missingDone.finish() } catch (error) { finishError = error }
    expect(finishError).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID',
      diagnosticStage: 'stream_finish', diagnosticReason: 'stream_incomplete_or_invalid',
      rawEvent: null, eventType: null, rawFrameExcerpt: null,
      diagnosticContext: { contextKind: 'stream_snapshot', acceptedEventCount: 1, doneSeen: false } })
    expect(missingDone.takeParsedEventsAfterError().map((event) => event.eventType)).toEqual(['interaction.created'])
    expect(missingDone.takeParsedEventsAfterError()).toEqual([])

    const malformedAtEof = new GeminiInteractionsImageSseDecoderV1()
    malformedAtEof.push(new TextEncoder().encode('event: step.delta\ndata: {invalid-json}'))
    let frameError: unknown
    try { malformedAtEof.finish() } catch (error) { frameError = error }
    expect(frameError).toMatchObject({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE',
      diagnosticStage: 'frame_decode', eventType: 'step.delta', rawEvent: null,
      rawFrameExcerpt: 'event: step.delta\ndata: {invalid-json}' })
  })

  it('retains a bounded invalid JSON frame without fabricating a parsed event', () => {
    const frame = 'event: step.delta\ndata: {invalid-json}\n\n'
    expect(() => new GeminiInteractionsImageSseDecoderV1().push(new TextEncoder().encode(frame)))
      .toThrow(expect.objectContaining({ code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE',
        eventType: 'step.delta', rawEvent: null, rawFrameExcerpt: frame.trimEnd() }))
  })
  it.each(['', 'AA=A', 'A===', '!AAA', 'AB=='])('rejects malformed or noncanonical image encoding %j', data => {
    expect(() => decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data, mime_type: 'image/jpeg' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction }, '[DONE]',
    ])).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  })

  it('retains the wire size ceiling before parsing', () => {
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    expect(() => decoder.push(new Uint8Array(GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1 + 1)))
      .toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED')
  }, 30_000)

  it('decodes only after joining image pieces split inside a Base64 quantum', () => {
    const result = decode([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'a', mime_type: 'image/jpeg' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'W1hZ2U=' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction }, '[DONE]',
    ])
    expect(new TextDecoder().decode(result.bytes)).toBe('image')
  })

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
    ])).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  })

  it('parses the official event/data stream with text and image deltas', () => {
    const result = decodeWithBytes(officialSse([
      { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
      { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'text', text: '鍗冮噷' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
      { event_type: 'step.delta', index: 0, delta: { type: 'text', text: '姹熷北' } },
      { event_type: 'step.stop', index: 0 },
      { event_type: 'interaction.completed', interaction }, '[DONE]',
    ]))
    expect(result.text).toBe('鍗冮噷姹熷北')
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
    const assembler = new GeminiInteractionsImageResultAssemblerV1('gemini-3.1-flash-image')
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
      .toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_EVENT_MISMATCH')
  })

  it('keeps provider stream errors distinct from invalid SSE and validates terminal frames', () => {
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    const events = decoder.push(new TextEncoder().encode(
      'event: error\ndata: {"event_type":"error","error":{"code":"bad_request","message":"No image"}}\n\n' +
      'event: done\ndata: [DONE]\n\n'))
    expect(events.map((event) => event.eventType)).toEqual(['error', 'done'])
    expect(() => new GeminiInteractionsImageSseDecoderV1().push(new TextEncoder().encode('event: step.delta\ndata: {bad}\n\n')))
      .toThrow('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
    const truncated = new GeminiInteractionsImageSseDecoderV1()
    truncated.push(new TextEncoder().encode('event: interaction.created\ndata: {"event_type":"interaction.created"}'))
    expect(() => truncated.finish()).toThrow()
  })

  it('preserves the raw Provider error when the stream closes without a done frame', () => {
    const decoder = new GeminiInteractionsImageSseDecoderV1()
    const assembler = new GeminiInteractionsImageResultAssemblerV1('gemini-3.1-flash-image')
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
  const assembler = new GeminiInteractionsImageResultAssemblerV1('gemini-3.1-flash-image')
  for (const event of decoder.push(bytes)) assembler.push(event)
  for (const event of decoder.finish()) assembler.push(event)
  return assembler.finish()
}
