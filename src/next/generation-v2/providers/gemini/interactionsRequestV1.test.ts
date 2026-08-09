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

  it('encodes the reviewed text-and-image, sampling, thinking and search matrix exactly', () => {
    const compiled = compileGeminiInteractionsRequestV1({ ...base, outputMode: 'image_and_text',
      image: { aspectRatio: '16:9', imageSize: '2K' },
      generation: { temperature: 0.7, topP: 0.9, maxOutputTokens: 128, stop: ['stop'] },
      reasoning: { thinkingLevel: 'high', thinkingSummaries: 'auto' }, webTypes: ['web', 'image'] })
    expect(JSON.parse(compiled.preparedBody.copyUtf8Text())).toEqual({
      generation_config: { max_output_tokens: 128, stop_sequences: ['stop'], temperature: 0.7,
        thinking_level: 'high', thinking_summaries: 'auto', top_p: 0.9 },
      input: 'draw a red apple', model: 'gemini-3.1-flash-image',
      response_format: [{ type: 'text' }, { aspect_ratio: '16:9', image_size: '2K', type: 'image' }],
      store: false, stream: true, tools: [{ type: 'google_search', search_types: ['web_search', 'image_search'] }],
    })
  })

  it('rejects a model alias at the typed codec boundary', () => {
    expect(() => compileGeminiInteractionsRequestV1({ ...base, model: 'models/gemini-3.1-flash-image',
      image: { mimeType: 'image/jpeg', aspectRatio: '1:1', imageSize: '1K' } })).toThrow(
      new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED'))
  })

  it('omits image_size for the legacy image model without losing its other controls', () => {
    expect(JSON.parse(compileGeminiInteractionsRequestV1({ ...base, model: 'gemini-2.5-flash-image',
      outputMode: 'image_and_text', image: { aspectRatio: '21:9' },
      generation: { temperature: 1, topP: 0.8, maxOutputTokens: 0, stop: ['stop'] }, webTypes: [] })
      .preparedBody.copyUtf8Text())).toMatchObject({
      model: 'gemini-2.5-flash-image', response_format: [{ type: 'text' }, { type: 'image', aspect_ratio: '21:9' }],
    })
  })

  it('enforces Lite and Pro model-specific resolution and search limits', () => {
    expect(() => compileGeminiInteractionsRequestV1({ ...base, model: 'gemini-3.1-flash-lite-image',
      image: { aspectRatio: '1:1', imageSize: '2K' }, webTypes: [] })).toThrow(
      new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED'))
    expect(() => compileGeminiInteractionsRequestV1({ ...base, model: 'gemini-3-pro-image',
      image: { aspectRatio: '1:1', imageSize: '4K' }, webTypes: ['image'] })).toThrow(
      new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED'))
    expect(JSON.parse(compileGeminiInteractionsRequestV1({ ...base, model: 'gemini-3-pro-image',
      image: { aspectRatio: '1:1', imageSize: '4K' }, webTypes: ['web'] }).preparedBody.copyUtf8Text()))
      .toMatchObject({ model: 'gemini-3-pro-image', tools: [{ type: 'google_search', search_types: ['web_search'] }] })
  })

  it('encodes image-only search without silently adding web search', () => {
    expect(JSON.parse(compileGeminiInteractionsRequestV1({ ...base,
      image: { aspectRatio: '1:1', imageSize: '1K' }, webTypes: ['image'] }).preparedBody.copyUtf8Text()))
      .toMatchObject({ tools: [{ type: 'google_search', search_types: ['image_search'] }] })
  })

  it('encodes web-only search without silently adding image search', () => {
    expect(JSON.parse(compileGeminiInteractionsRequestV1({ ...base,
      image: { aspectRatio: '1:1', imageSize: '1K' }, webTypes: ['web'] }).preparedBody.copyUtf8Text()))
      .toMatchObject({ tools: [{ type: 'google_search', search_types: ['web_search'] }] })
  })
})
