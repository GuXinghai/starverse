import { describe, expect, it } from 'vitest'
import {
  decodeOpenRouterImageBufferedResponseV1,
  OpenRouterImageSingleResultAssemblerV1,
  OpenRouterImageSseDecoderV1,
} from './imageStreamV1'

const encoder = new TextEncoder()
const image = Buffer.from([137, 80, 78, 71]).toString('base64')

function completed() {
  return JSON.stringify({
    type: 'image_generation.completed', b64_json: image, media_type: 'image/png', created: 1748372400,
    usage: { prompt_tokens: 16, completion_tokens: 272, total_tokens: 288, cost: 0.011 },
  })
}

describe('OpenRouter Images V1 strict single-image SSE decoder', () => {
  it('decodes the documented non-streaming n:1 response without accepting a hidden second image', () => {
    const result = decodeOpenRouterImageBufferedResponseV1({
      created: 1748372400,
      data: [{ b64_json: image, media_type: 'image/png' }],
      usage: { prompt_tokens: 0, completion_tokens: 4175, total_tokens: 4175, cost: 0.04 },
    })
    expect(result.mime).toBe('image/png')
    expect(result.createdAtMs).toBe(1748372400000)
    expect(() => decodeOpenRouterImageBufferedResponseV1({
      created: 1, data: [
        { b64_json: image, media_type: 'image/png' },
        { b64_json: image, media_type: 'image/png' },
      ], usage: {},
    })).toThrow('GENERATION_V2_OPENROUTER_IMAGE_STREAM_MULTI_IMAGE_UNSUPPORTED')
  })

  it('preserves only the final image bytes, usage and MIME after documented completion plus DONE', () => {
    const decoder = new OpenRouterImageSseDecoderV1()
    const assembler = new OpenRouterImageSingleResultAssemblerV1()
    const partial = JSON.stringify({ type: 'image_generation.partial_image', partial_image_index: 0, b64_json: image })
    const events = [
      ...decoder.push(encoder.encode(`data: ${partial}\n\n`)),
      ...decoder.push(encoder.encode(`data: ${completed()}\n\n`)),
      ...decoder.push(encoder.encode('data: [DONE]\n\n')),
      ...decoder.finish(),
    ]
    events.forEach((event) => assembler.push(event))
    const result = assembler.finish()
    expect([...result.bytes]).toEqual([137, 80, 78, 71])
    expect(result.mime).toBe('image/png')
    expect(result.createdAtMs).toBe(1748372400000)
    expect(result.usage).toEqual({ prompt_tokens: 16, completion_tokens: 272, total_tokens: 288, cost: 0.011 })
  })

  it('rejects undefined text chunks, multi-image partials, unknown fields and malformed terminal framing', () => {
    const text = new OpenRouterImageSseDecoderV1()
    expect(() => text.push(encoder.encode('data: {"type":"image_generation.text_chunk","phase":"content"}\n\n')))
      .toThrow('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TEXT_CHUNK_UNSUPPORTED')
    const multi = new OpenRouterImageSseDecoderV1()
    expect(() => multi.push(encoder.encode(`data: ${JSON.stringify({
      type: 'image_generation.partial_image', partial_image_index: 1, b64_json: image,
    })}\n\n`))).toThrow('GENERATION_V2_OPENROUTER_IMAGE_STREAM_MULTI_IMAGE_UNSUPPORTED')
    const unknown = new OpenRouterImageSseDecoderV1()
    expect(() => unknown.push(encoder.encode(`data: ${JSON.stringify({
      ...JSON.parse(completed()), extra: true,
    })}\n\n`))).toThrow('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
    const noDone = new OpenRouterImageSseDecoderV1()
    noDone.push(encoder.encode(`data: ${completed()}\n\n`))
    expect(() => noDone.finish()).toThrow('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID')
  })

  it('does not treat provider error or partial preview as a final persisted image', () => {
    const decoder = new OpenRouterImageSseDecoderV1()
    const assembler = new OpenRouterImageSingleResultAssemblerV1()
    const events = [
      ...decoder.push(encoder.encode('data: {"type":"error","error":{"message":"Generation failed","code":"server_error"}}\n\n')),
      ...decoder.push(encoder.encode('data: [DONE]\n\n')),
      ...decoder.finish(),
    ]
    events.forEach((event) => assembler.push(event))
    expect(() => assembler.finish()).toThrow('GENERATION_V2_OPENROUTER_IMAGE_STREAM_PROVIDER_FAILED')
  })
})
