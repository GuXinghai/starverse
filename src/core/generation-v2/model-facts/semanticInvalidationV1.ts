import { buildCapabilityRuleSourceScopeIdV1 } from './sourceScopeV1'

export const GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATED = 'generationV2:modelFacts:semanticInvalidated' as const
export const CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 = buildCapabilityRuleSourceScopeIdV1({
  ruleStoreId: 'epoch-2-capability-rules',
})

/** Revision hashes identify committed inputs; their lexical order has no meaning. */
export type ModelFactsSemanticInvalidationV1 =
  | Readonly<{ kind: 'capability_rules'; sourceScopeId: string; canonicalSourceRevision: string }>
  | Readonly<{ kind: 'source_priority'; sourcePriorityConfigRevision: string }>

export function decodeModelFactsSemanticInvalidationV1(value: unknown): ModelFactsSemanticInvalidationV1 {
  const invalid = (): never => { throw new Error('GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATION_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) invalid()
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort().join('\0')
  if (record.kind === 'capability_rules' && keys === 'canonicalSourceRevision\0kind\0sourceScopeId' &&
      record.sourceScopeId === CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 && typeof record.canonicalSourceRevision === 'string' &&
      /^canonical-source-v1:[0-9a-f]{64}$/u.test(record.canonicalSourceRevision)) {
    return Object.freeze({ kind: record.kind, sourceScopeId: record.sourceScopeId,
      canonicalSourceRevision: record.canonicalSourceRevision })
  }
  if (record.kind === 'source_priority' && keys === 'kind\0sourcePriorityConfigRevision' &&
      typeof record.sourcePriorityConfigRevision === 'string' &&
      /^source-priority-config-v1:[0-9a-f]{64}$/u.test(record.sourcePriorityConfigRevision)) {
    return Object.freeze({ kind: record.kind, sourcePriorityConfigRevision: record.sourcePriorityConfigRevision })
  }
  return invalid()
}
