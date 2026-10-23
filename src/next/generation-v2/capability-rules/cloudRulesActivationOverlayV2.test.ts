import { describe, expect, it } from 'vitest'
import { computeCloudRulesContentRevisionV2, decodeCloudRulesReleaseDocumentV1 } from
  '../../../core/generation-v2/capability-rules/cloudRulesReleaseV1'
import { applyCloudRulesActivationOverridesV2 } from '../../../core/generation-v2/capability-rules/cloudRulesActivationOverlayV2'

function pack(packId: string, ruleId: string) {
  return { schemaVersion: 2, packId, displayName: packId, description: null, priority: 5, mode: 'no_control',
    target: 'enabled', rules: [{
      ruleId, label: null, description: null, priority: 8, configured: 'default',
      providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] }, evidence: null,
      category: 'reasoning', when: { kind: 'eq', path: 'target.protocolContractId', value: 'openai-models-v1' },
      effect: { kind: 'registered_operation', operationId: 'reasoning_openai', parameters: { samplingBehavior: 'preserve' } },
      decisionKey: `reasoning.effort.${ruleId}`, dependencies: [],
    }] }
}

function release(packs: readonly ReturnType<typeof pack>[]) {
  const document = decodeCloudRulesReleaseDocumentV1({ schemaVersion: 2, releaseVersion: '2.0.0',
    contentRevision: computeCloudRulesContentRevisionV2(packs), packs })
  if (document.schemaVersion !== 2) throw new Error('expected a schema 2 release')
  return document
}

describe('applyCloudRulesActivationOverridesV2', () => {
  it('P3a-22: retains an "off" for a rule absent from the release and re-applies it when the rule returns', () => {
    const kept = pack('pack.kept', 'rule.kept')
    const returning = pack('pack.returning', 'rule.returning')
    const first = applyCloudRulesActivationOverridesV2({ document: release([kept]), overrides: [
      { kind: 'pack', packId: 'pack.returning', target: 'disabled' },
      { kind: 'rule', ruleId: 'rule.returning', configured: 'off' },
    ] })
    expect(first.retainedOverrides).toEqual([
      { kind: 'pack', packId: 'pack.returning', target: 'disabled' },
      { kind: 'rule', ruleId: 'rule.returning', configured: 'off' },
    ])

    const returned = applyCloudRulesActivationOverridesV2({ document: release([kept, returning]),
      overrides: first.retainedOverrides })
    expect(returned.ownershipSnapshot.packs.find(entry => entry.packId === 'pack.returning')).toMatchObject({
      target: 'disabled', rules: [{ ruleId: 'rule.returning', configured: 'off' }] })
    expect(returned.ownershipSnapshot.packs.find(entry => entry.packId === 'pack.kept')).toMatchObject({
      target: 'enabled', rules: [{ ruleId: 'rule.kept', configured: 'default' }] })
  })
})
