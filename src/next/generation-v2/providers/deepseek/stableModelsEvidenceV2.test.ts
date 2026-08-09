import { describe, expect, it } from 'vitest'
import {
  canonicalizeDeepSeekStableModelsEvidenceV2,
  decodeDeepSeekStableModelsEvidenceJsonV2,
  decodeDeepSeekStableModelsEvidenceV2,
} from './stableModelsEvidenceV2'

function response() {
  return {
    object: 'list',
    data: [
      { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' },
      { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
    ],
  }
}

describe('DeepSeek stable Models evidence V2', () => {
  it('canonicalizes one complete strict provider response with stable identity evidence', () => {
    const persisted = canonicalizeDeepSeekStableModelsEvidenceV2(response())
    expect(persisted.data.map((model) => model.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    expect(persisted.response_digest).toMatch(/^[0-9a-f]{64}$/u)
    expect(persisted.response_revision).toBe(`deepseek-stable-models-response-v1:${persisted.response_digest}`)

    const decoded = decodeDeepSeekStableModelsEvidenceV2(persisted)
    expect(decoded.trust).toBe('decoded_unverified')
    expect(decoded.executionAuthority).toBe('none')
    expect(decoded.models.map((model) => model.modelId.value)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    expect(decodeDeepSeekStableModelsEvidenceJsonV2(decoded.canonicalJson).responseRevision)
      .toBe(decoded.responseRevision)
    expect(Object.isFrozen(decoded)).toBe(true)
    expect(Object.isFrozen(decoded.models)).toBe(true)

    expect(canonicalizeDeepSeekStableModelsEvidenceV2({ object: 'list', data: [] }).data).toEqual([])
  })

  it('rejects unknown fields, duplicate IDs, sparse arrays, malformed records and digest drift', () => {
    expect(() => canonicalizeDeepSeekStableModelsEvidenceV2({ ...response(), next: 'cursor' }))
      .toThrow('GENERATION_V2_DEEPSEEK_MODELS_UNKNOWN_FIELD')
    expect(() => canonicalizeDeepSeekStableModelsEvidenceV2({
      object: 'list', data: [response().data[0], response().data[0]],
    })).toThrow('GENERATION_V2_DEEPSEEK_MODELS_DUPLICATE_ID')
    const sparse = new Array(2)
    sparse[1] = response().data[0]
    expect(() => canonicalizeDeepSeekStableModelsEvidenceV2({ object: 'list', data: sparse }))
      .toThrow('GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE')
    expect(() => canonicalizeDeepSeekStableModelsEvidenceV2({
      object: 'list', data: [{ id: '../model', object: 'model', owned_by: 'deepseek' }],
    })).toThrow('GENERATION_V2_DEEPSEEK_MODELS_INVALID_VALUE')
    const persisted = canonicalizeDeepSeekStableModelsEvidenceV2(response())
    expect(() => decodeDeepSeekStableModelsEvidenceV2({ ...persisted, response_digest: '0'.repeat(64) }))
      .toThrow('GENERATION_V2_DEEPSEEK_MODELS_DIGEST_MISMATCH')
  })
})
