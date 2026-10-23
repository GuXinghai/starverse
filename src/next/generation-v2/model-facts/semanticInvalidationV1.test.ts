import { describe, expect, it } from 'vitest'
import { CAPABILITY_RULE_SOURCE_SCOPE_ID_V1, decodeModelFactsSemanticInvalidationV1 } from '../../../core/generation-v2/model-facts/semanticInvalidationV1'

describe('closed semantic invalidation event', () => {
  it('accepts only existing semantic revision hashes and the shared Rules scope', () => {
    const event = { kind: 'capability_rules', sourceScopeId: CAPABILITY_RULE_SOURCE_SCOPE_ID_V1,
      canonicalSourceRevision: `canonical-source-v1:${'a'.repeat(64)}` }
    expect(decodeModelFactsSemanticInvalidationV1(event)).toEqual(event)
    expect(decodeModelFactsSemanticInvalidationV1({ kind: 'source_priority',
      sourcePriorityConfigRevision: `source-priority-config-v1:${'f'.repeat(64)}` }).kind).toBe('source_priority')
    for (const invalid of [{ ...event, sourceScopeId: 'renderer-scope' }, { ...event, sequence: 1 },
      { ...event, canonicalSourceRevision: 'latest' }, { kind: 'source_priority', sourcePriorityConfigRevision: 'bad' }]) {
      expect(() => decodeModelFactsSemanticInvalidationV1(invalid)).toThrow('GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATION_INVALID')
    }
  })

  it('R4-02: accepts a models.dev source publication and rejects other source kinds', () => {
    const event = { kind: 'model_facts_source', sourceKind: 'models_dev',
      canonicalSourceRevision: `canonical-source-v1:${'b'.repeat(64)}` }
    expect(decodeModelFactsSemanticInvalidationV1(event)).toEqual(event)
    for (const invalid of [{ ...event, sourceKind: 'provider_native' }, { ...event, canonicalSourceRevision: 'latest' },
      { ...event, extra: true }]) {
      expect(() => decodeModelFactsSemanticInvalidationV1(invalid)).toThrow('GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATION_INVALID')
    }
  })
})
