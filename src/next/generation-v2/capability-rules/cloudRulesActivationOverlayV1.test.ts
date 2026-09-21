import { describe, expect, it } from 'vitest'
import { computeCloudRulesContentRevisionV1, decodeCloudRulesReleaseDocumentV1 } from
  './cloudRulesReleaseV1'
import { applyCloudRulesActivationOverridesV1 } from './cloudRulesActivationOverlayV1'

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
  it('overlays only activation fields and drops identities absent from the target document', () => {
    const result = applyCloudRulesActivationOverridesV1({ document: document(), overrides: [
      { kind: 'pack', packId: 'pack.a', mode: 'override', target: 'disabled' },
      { kind: 'rule', ruleId: 'rule.a', configured: 'on' },
      { kind: 'rule', ruleId: 'removed.rule', configured: 'off' },
    ] })
    expect(result.ownershipSnapshot.packs[0]).toMatchObject({ mode: 'override', target: 'disabled',
      rules: [{ ruleId: 'rule.a', configured: 'on' }] })
    expect(result.retainedOverrides).toEqual([
      { kind: 'pack', packId: 'pack.a', mode: 'override', target: 'disabled' },
      { kind: 'rule', ruleId: 'rule.a', configured: 'on' },
    ])
    expect(document().packs[0]).toMatchObject({ mode: 'no_control', target: 'enabled',
      rules: [{ configured: 'default' }] })
  })
})
