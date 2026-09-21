import { describe, expect, it } from 'vitest'
import { createUserRulePackTransferV1, decodeUserRulePackTransferV1 } from
  './userRulePackTransferV1'

function pack() {
  return { schemaVersion: 1, packId: 'pack.user', displayName: 'User Pack', description: null,
    priority: 0, mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule.user', label: null,
      description: null, priority: 0, configured: 'default', providerAuthorityId: 'openai',
      endpointProfileId: 'openai-default', selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null }] }
}

describe('UserRulePackTransferV1', () => {
  it('round-trips one complete shared Pack with stable identities, activation, and notes', () => {
    const transfer = createUserRulePackTransferV1({ pack: pack(),
      notes: [{ ruleId: 'rule.user', note: 'Verified locally' }] })
    expect(decodeUserRulePackTransferV1(JSON.parse(JSON.stringify(transfer)))).toEqual(transfer)
    expect(transfer.pack.rules[0]).toMatchObject({ ruleId: 'rule.user', configured: 'default' })
  })

  it('rejects notes outside the transferred Pack and any content digest drift', () => {
    expect(() => createUserRulePackTransferV1({ pack: pack(),
      notes: [{ ruleId: 'other.rule', note: 'x' }] })).toThrow()
    const transfer = createUserRulePackTransferV1({ pack: pack() })
    expect(() => decodeUserRulePackTransferV1({ ...transfer,
      contentDigest: `user-rule-pack-transfer-v1:${'f'.repeat(64)}` })).toThrow()
  })
})
