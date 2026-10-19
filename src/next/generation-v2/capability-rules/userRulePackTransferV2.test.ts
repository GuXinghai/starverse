import { describe, expect, it } from 'vitest'
import { createUserRulePackTransferV2, decodeUserRulePackTransferV2 } from
  '../../../core/generation-v2/capability-rules/userRulePackTransferV2'
import { createUserRulePackTransferV1 } from '../../../core/generation-v2/capability-rules/userRulePackTransferV1'

function pack() {
  return { schemaVersion: 2, packId: 'pack.user', displayName: 'User Pack', description: null,
    priority: 12, mode: 'override', target: 'enabled', rules: [{
      ruleId: 'rule.user', label: null, description: null, priority: 4, configured: 'default',
      providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] }, evidence: null,
      category: 'reasoning', when: { kind: 'eq', path: 'target.protocolContractId', value: 'openai-responses' },
      effect: { kind: 'enum_mapping', path: 'effective.reasoning.effort',
        mappings: [{ from: 'high', to: 'high' }] },
      decisionKey: 'reasoning.effort', dependencies: [],
    }],
  }
}

describe('UserRulePackTransferV2', () => {
  it('authenticates legacy V1 imports and converts their facts and notes into V2', () => {
    const legacy = createUserRulePackTransferV1({ pack: { schemaVersion: 1, packId: 'pack.legacy', displayName: 'Legacy',
      description: null, priority: 12, mode: 'override', target: 'enabled', rules: [{
        ruleId: 'rule.legacy', label: 'Custom label', description: null, priority: 4, configured: 'off',
        providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
        selector: { kind: 'exact', nativeModelIds: ['gpt-test'] }, evidence: null,
        assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      }] }, notes: [{ ruleId: 'rule.legacy', note: 'Keep this note' }] })
    const converted = decodeUserRulePackTransferV2(legacy)
    expect(converted.schemaVersion).toBe(2)
    expect(converted.pack).toMatchObject({ schemaVersion: 2, packId: 'pack.legacy', priority: 12, rules: [{
      ruleId: 'rule.legacy', label: 'Custom label', configured: 'off', priority: 4, category: 'reasoning',
      effect: { kind: 'fact_assertion', path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
    }] })
    expect(converted.notes).toEqual(legacy.notes)
    expect(converted.contentDigest).toMatch(/^user-rule-pack-transfer-v2:/u)
    expect(() => decodeUserRulePackTransferV2({ ...legacy, contentDigest: 'tampered' })).toThrow()
  })
  it('round-trips typed predicates, effects, pack metadata, and notes', () => {
    const transfer = createUserRulePackTransferV2({ pack: pack(),
      notes: [{ ruleId: 'rule.user', note: 'Reviewed policy' }] })
    expect(decodeUserRulePackTransferV2(JSON.parse(JSON.stringify(transfer)))).toEqual(transfer)
  })

  it('rejects notes outside the Pack and content digest drift', () => {
    expect(() => createUserRulePackTransferV2({ pack: pack(),
      notes: [{ ruleId: 'other.rule', note: 'x' }] })).toThrow()
    const transfer = createUserRulePackTransferV2({ pack: pack() })
    expect(() => decodeUserRulePackTransferV2({ ...transfer,
      contentDigest: `user-rule-pack-transfer-v2:${'f'.repeat(64)}` })).toThrow()
  })
})
