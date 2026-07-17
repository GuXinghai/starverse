import { describe, expect, it } from 'vitest'
import {
  canonicalizeOpenAIResponsesModelsEvidenceV2,
  decodeOpenAIResponsesModelsEvidenceV2,
} from './modelsEvidenceV2'

describe('OpenAI Responses V2 Models evidence', () => {
  it('canonicalizes the exact official list shape with content-addressed identity', () => {
    const persisted = canonicalizeOpenAIResponsesModelsEvidenceV2({
      object: 'list',
      data: [
        { id: 'gpt-5.4-nano', object: 'model', created: 2, owned_by: 'system' },
        { id: 'gpt-5.4', object: 'model', created: 1, owned_by: 'openai' },
      ],
    })
    expect(persisted.data.map((model) => model.id)).toEqual(['gpt-5.4', 'gpt-5.4-nano'])
    expect(persisted.response_digest).toMatch(/^[0-9a-f]{64}$/u)
    const decoded = decodeOpenAIResponsesModelsEvidenceV2(persisted)
    expect(decoded.models.map((model) => [model.modelId.value, model.created, model.ownedBy])).toEqual([
      ['gpt-5.4', 1, 'openai'], ['gpt-5.4-nano', 2, 'system'],
    ])
    expect(decoded.executionAuthority).toBe('none')
  })

  it('rejects unknown fields, duplicate ids, sparse arrays, accessors and digest tampering', () => {
    expect(() => canonicalizeOpenAIResponsesModelsEvidenceV2({
      object: 'list', data: [{ id: 'gpt-5', object: 'model', created: 1, owned_by: 'openai', capability: true }],
    })).toThrow('GENERATION_V2_OPENAI_MODELS_UNKNOWN_FIELD')
    expect(() => canonicalizeOpenAIResponsesModelsEvidenceV2({
      object: 'list', data: [
        { id: 'gpt-5', object: 'model', created: 1, owned_by: 'openai' },
        { id: 'gpt-5', object: 'model', created: 2, owned_by: 'openai' },
      ],
    })).toThrow('GENERATION_V2_OPENAI_MODELS_DUPLICATE_ID')
    expect(() => canonicalizeOpenAIResponsesModelsEvidenceV2({ object: 'list', data: new Array(1) }))
      .toThrow('GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE')
    expect(() => canonicalizeOpenAIResponsesModelsEvidenceV2(Object.defineProperty({ data: [] }, 'object', {
      enumerable: true, get: () => 'list',
    }))).toThrow('GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE')
    const persisted = canonicalizeOpenAIResponsesModelsEvidenceV2({ object: 'list', data: [] })
    expect(() => decodeOpenAIResponsesModelsEvidenceV2({ ...persisted, response_digest: '0'.repeat(64) }))
      .toThrow('GENERATION_V2_OPENAI_MODELS_DIGEST_MISMATCH')
  })
})
