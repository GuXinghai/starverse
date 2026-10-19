import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_RULE_CATEGORY_BY_CANONICAL_PATH_V2,
  decodeCapabilityRuleOwnershipSnapshotV2,
  migrateCapabilityRuleOwnershipSnapshotV1ToV2,
  projectCapabilityRuleOwnershipSnapshotV2,
} from '../../../core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { CANONICAL_MODEL_FACT_PATHS_V1 } from '../../../core/generation-v2/model-facts/canonicalSourceFactsV1'

function rule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: 'rule.reasoning', label: null, description: null, priority: 0, configured: 'default',
    providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
    selector: { kind: 'exact', nativeModelIds: ['gpt-test'] }, evidence: null,
    category: 'reasoning', when: null,
    effect: { kind: 'fact_assertion', path: 'reasoning.support',
      value: { kind: 'support', value: 'supported' } },
    decisionKey: 'reasoning.support', dependencies: [], ...overrides,
  }
}

function pack(rules: readonly Record<string, unknown>[] = [rule()]): Record<string, unknown> {
  return { schemaVersion: 2, packId: 'pack.reasoning', displayName: 'Reasoning', description: null,
    priority: 7, mode: 'no_control', target: 'enabled', rules }
}

function snapshot(rules: readonly Record<string, unknown>[] = [rule()]): Record<string, unknown> {
  return { schemaVersion: 2, ownership: 'cloud', ownerId: 'official', packs: [pack(rules)] }
}

describe('Capability Rule shared core V2', () => {
  it('explicitly categorizes every canonical source path', () => {
    expect(Object.keys(CAPABILITY_RULE_CATEGORY_BY_CANONICAL_PATH_V2).sort())
      .toEqual([...CANONICAL_MODEL_FACT_PATHS_V1].sort())
    expect(CAPABILITY_RULE_CATEGORY_BY_CANONICAL_PATH_V2['generation.effort.nativeValues']).toBe('reasoning')
    expect(CAPABILITY_RULE_CATEGORY_BY_CANONICAL_PATH_V2['limits.output.providerDefaultTokens'])
      .toBe('context_quotas')
  })

  it('accepts only closed request paths and rejects a mismatched fact category', () => {
    const valid = decodeCapabilityRuleOwnershipSnapshotV2(snapshot([rule({ when: {
      kind: 'all', predicates: [
        { kind: 'eq', path: 'target.operation', value: 'generate_content' },
        { kind: 'lte', path: 'requested.reasoning.budgetTokens',
          right: { path: 'effective.generation.maxOutputTokens' } },
      ],
    } })]))
    expect(valid.packs[0]!.rules[0]!.when).toMatchObject({ kind: 'all' })
    expect(() => decodeCapabilityRuleOwnershipSnapshotV2(snapshot([rule({ when: {
      kind: 'exists', path: 'requested.rawJsonPath',
    } })]))).toThrowError('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
    expect(() => decodeCapabilityRuleOwnershipSnapshotV2(snapshot([rule({ category: 'output' })])))
      .toThrowError('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
  })

  it('checks dependency references and rejects cycles in decision keys', () => {
    expect(() => decodeCapabilityRuleOwnershipSnapshotV2(snapshot([rule({ dependencies: ['missing.decision'] })])))
      .toThrowError('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
    expect(() => decodeCapabilityRuleOwnershipSnapshotV2(snapshot([
      rule({ decisionKey: 'a', dependencies: ['b'] }),
      rule({ ruleId: 'rule.second', decisionKey: 'b', dependencies: ['a'] }),
    ]))).toThrowError('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
  })

  it('keeps image mapping values in Rule data while rejecting malformed tables', () => {
    const mappingRule = (mappings: unknown) => rule({ category: 'image_generation', decisionKey: 'image:ratio',
      effect: { kind: 'registered_operation', operationId: 'image_aspect_ratio_to_size', parameters: { mappings } } })
    const decoded = decodeCapabilityRuleOwnershipSnapshotV2(snapshot([mappingRule([{ from: '1:1', width: 512, height: 512 }])]))
    expect(decoded.packs[0]!.rules[0]!.effect).toMatchObject({ parameters: { mappings: [{ from: '1:1', width: 512, height: 512 }] } })
    for (const mappings of [
      [{ from: '2:3', width: 512, height: 768 }], [{ from: '1:1', width: 0, height: 512 }],
      [{ from: '1:1', width: 512, height: 512 }, { from: '1:1', width: 1024, height: 1024 }],
    ]) expect(() => decodeCapabilityRuleOwnershipSnapshotV2(snapshot([mappingRule(mappings)])))
      .toThrow('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
  })

  it('migrates reviewed V1 assertions without changing owner, identities, activation, or provenance', () => {
    const legacy = { schemaVersion: 1, ownership: 'user', ownerId: 'local-user', packs: [{
      schemaVersion: 1, packId: 'pack.legacy', displayName: 'Legacy', description: null,
      priority: 22, mode: 'override', target: 'enabled', rules: [{
        ruleId: 'rule.legacy', label: 'Legacy rule', description: null, priority: 31,
        configured: 'on', providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
        selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
        assertion: { path: 'limits.output.maxTokens', value: { kind: 'integer', value: 4096 } },
        evidence: null,
      }],
    }] }
    const migrated = projectCapabilityRuleOwnershipSnapshotV2(
      migrateCapabilityRuleOwnershipSnapshotV1ToV2(legacy))
    expect(migrated.definition).toMatchObject({ schemaVersion: 2, ownership: 'user', ownerId: 'local-user' })
    expect(migrated.definition.packs[0]).toMatchObject({ packId: 'pack.legacy', priority: 22,
      mode: 'override', target: 'enabled' })
    expect(migrated.definition.packs[0]!.rules[0]).toMatchObject({ ruleId: 'rule.legacy',
      priority: 31, configured: 'on', category: 'context_quotas', when: null,
      effect: { kind: 'fact_assertion', path: 'limits.output.maxTokens',
        value: { kind: 'integer', value: 4096 } }, decisionKey: 'fact:limits.output.maxTokens',
      dependencies: [], evidence: null })
  })
})
