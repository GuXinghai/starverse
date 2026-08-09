import { describe, expect, it } from 'vitest'
import { decodeGeminiModelsEvidenceV1 } from './modelsEvidenceV1'

describe('Gemini models evidence V1', () => {
  it('accepts the provider model resource shape and ignores additive fields', () => {
    const result = decodeGeminiModelsEvidenceV1({
      models: [{
        name: 'models/gemini-2.5-flash', version: '002', displayName: 'Gemini 2.5 Flash',
        description: 'test', inputTokenLimit: 1_000_000, outputTokenLimit: 8_192,
        supportedGenerationMethods: ['generateContent'], thinking: { type: 'dynamic' },
      }],
    })
    expect(result.models[0]).toMatchObject({ name: 'models/gemini-2.5-flash', baseModelId: 'gemini-2.5-flash' })
    expect(decodeGeminiModelsEvidenceV1(JSON.parse(result.canonicalJson))).toMatchObject({
      responseRevision: result.responseRevision,
      responseDigest: result.responseDigest,
    })
  })
})
