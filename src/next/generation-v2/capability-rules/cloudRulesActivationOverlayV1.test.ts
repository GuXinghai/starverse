import { describe, expect, it } from 'vitest'
import { computeCloudRulesContentRevisionV1, decodeCloudRulesReleaseDocumentV1 } from
  '../../../core/generation-v2/capability-rules/cloudRulesReleaseV1'
import { applyCloudRulesActivationOverridesV1 } from '../../../core/generation-v2/capability-rules/cloudRulesActivationOverlayV1'

function document() {
  const packs = [{ schemaVersion: 1, packId: 'pack.a', displayName: 'A', description: null,
    priority: 0, mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule.a', label: null,
      description: null, priority: 0, configured: 'default', providerAuthorityId: 'openai',
      endpointProfileId: 'openai-default', selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: null }] }]
  return decodeCloudRulesReleaseDocumentV1({ schemaVersion: 1, releaseVersion: '1.0.0',
    contentRevision: computeCloudRulesContentRevisionV1(packs), packs })
}

describe('applyCloudRulesActivationOverridesV1', () => {
  // P3a-22: this test used to assert that an override for an identity absent from the
  // release is dropped, which loses a user's "off" when the rule returns. It is now retained.
  it('P3a-22: overlays only activation fields and retains overrides for identities absent from the target document', () => {
    const result = applyCloudRulesActivationOverridesV1({ document: document(), overrides: [
      { kind: 'pack', packId: 'pack.a', mode: 'override', target: 'disabled' },
      { kind: 'rule', ruleId: 'rule.a', configured: 'on' },
      { kind: 'rule', ruleId: 'removed.rule', configured: 'off' },
    ] })
    expect(result.ownershipSnapshot.packs[0]).toMatchObject({ mode: 'override', target: 'disabled',
      rules: [{ ruleId: 'rule.a', configured: 'on' }] })
    expect(result.retainedOverrides).toEqual([
      { kind: 'pack', packId: 'pack.a', mode: 'override', target: 'disabled' },
      { kind: 'rule', ruleId: 'removed.rule', configured: 'off' },
      { kind: 'rule', ruleId: 'rule.a', configured: 'on' },
    ])
    expect(document().packs[0]).toMatchObject({ mode: 'no_control', target: 'enabled',
      rules: [{ configured: 'default' }] })
  })

  it('P3a-22: re-applies a retained "off" when a later release brings the rule back', () => {
    const withoutRule = applyCloudRulesActivationOverridesV1({ document: document(), overrides: [
      { kind: 'rule', ruleId: 'returning.rule', configured: 'off' },
      { kind: 'pack', packId: 'returning.pack', target: 'disabled' },
    ] })
    expect(withoutRule.retainedOverrides).toEqual([
      { kind: 'pack', packId: 'returning.pack', target: 'disabled' },
      { kind: 'rule', ruleId: 'returning.rule', configured: 'off' },
    ])
    const base = document()
    const packs = [...base.packs, { ...base.packs[0]!, packId: 'returning.pack', displayName: 'Returning',
      rules: [{ ...base.packs[0]!.rules[0]!, ruleId: 'returning.rule' }] }]
    const returned = decodeCloudRulesReleaseDocumentV1({ schemaVersion: 1, releaseVersion: '1.1.0',
      contentRevision: computeCloudRulesContentRevisionV1(packs), packs })
    const result = applyCloudRulesActivationOverridesV1({ document: returned, overrides: withoutRule.retainedOverrides })
    expect(result.ownershipSnapshot.packs.find(pack => pack.packId === 'returning.pack')).toMatchObject({
      target: 'disabled', rules: [{ ruleId: 'returning.rule', configured: 'off' }] })
  })

  it('still rejects a malformed override for an absent identity', () => {
    expect(() => applyCloudRulesActivationOverridesV1({ document: document(), overrides: [
      { kind: 'rule', ruleId: 'removed.rule', configured: 'maybe' as never },
    ] })).toThrow('GENERATION_V2_CLOUD_RULES_ACTIVATION_OVERRIDE_INVALID')
  })
})
