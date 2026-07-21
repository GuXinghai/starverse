import { describe, expect, it } from 'vitest'
import {
  compileGeminiInteractionsRequestV1,
  GeminiInteractionsRequestV1Error,
} from './interactionsRequestV1'

const base = Object.freeze({
  model: 'gemini-3.1-flash-image',
  prompt: 'draw a red apple',
  outputMode: 'image_only',
})

describe('Gemini Interactions request V1', () => {
  it('encodes only the officially supported JPEG image response format', () => {
    const compiled = compileGeminiInteractionsRequestV1({
      ...base,
      image: Object.freeze({ mimeType: 'image/jpeg', aspectRatio: '1:1', imageSize: '1K' }),
    })
    expect(JSON.parse(compiled.preparedBody.copyUtf8Text())).toMatchObject({
      input: 'draw a red apple',
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1', image_size: '1K' },
      stream: true,
      store: false,
    })
  })

  it.each(['image/png', 'image/webp'] as const)('rejects unsupported %s output', (mimeType) => {
    expect(() => compileGeminiInteractionsRequestV1({
      ...base,
      image: Object.freeze({ mimeType }),
    })).toThrow(new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED'))
  })

  it('rejects an explicit image delivery mode until the V2 intent and output runner support it', () => {
    expect(() => compileGeminiInteractionsRequestV1({
      ...base,
      image: Object.freeze({ mimeType: 'image/jpeg', delivery: 'uri' }),
    })).toThrow(new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED'))
  })

  it('rejects the retired reduced-step continuation input instead of emitting an undocumented Step', () => {
    expect(() => compileGeminiInteractionsRequestV1({
      ...base,
      priorArtifact: Object.freeze({ orderedSteps: [] }),
      image: Object.freeze({ mimeType: 'image/jpeg' }),
    })).toThrow(new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_INVALID'))
  })

  it('rejects text-and-image and any model alias instead of silently changing the verified contract', () => {
    expect(() => compileGeminiInteractionsRequestV1({ ...base, outputMode: 'image_and_text',
      image: { mimeType: 'image/jpeg', aspectRatio: '1:1', imageSize: '1K' } })).toThrow(
      new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED'))
    expect(() => compileGeminiInteractionsRequestV1({ ...base, model: 'models/gemini-3.1-flash-image',
      image: { mimeType: 'image/jpeg', aspectRatio: '1:1', imageSize: '1K' } })).toThrow(
      new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_INVALID'))
  })
})
