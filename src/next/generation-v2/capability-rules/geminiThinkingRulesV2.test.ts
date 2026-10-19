import { describe, expect, it } from 'vitest'
import { migrateCapabilityRuleOwnershipSnapshotV1ToV2 } from '../../../core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { geminiThinkingRulesSnapshotV2 } from '../../../core/generation-v2/capability-rules/geminiThinkingRulesV2'
import { computeCloudRulesContentRevisionV2, decodeCloudRulesReleaseDocumentV1, selectHighestCloudRulesReleaseV1 } from '../../../core/generation-v2/capability-rules/cloudRulesReleaseV1'

describe('reviewed Gemini native thinking corpus and release isolation', () => {
  it('keeps 2.5 disjoint domains and API-scoped facts explicit', () => {
    const snapshot = geminiThinkingRulesSnapshotV2()
    const rules = snapshot.packs.flatMap(pack => pack.rules)
    const find = (model: string, suffix: string) => rules.find(rule => rule.selector.kind === 'exact' && rule.selector.nativeModelIds.includes(model) && rule.assertion.path.endsWith(suffix))?.assertion.value
    expect(find('gemini-2.5-pro', 'thinkingBudget.domain')).toMatchObject({ interval: { min: 128, max: 32768 }, includedValues: [-1] })
    expect(find('gemini-2.5-flash-lite', 'thinkingBudget.domain')).toMatchObject({ interval: { min: 512, max: 24576 }, includedValues: [-1, 0] })
    expect(find('gemini-2.5-pro', 'thinking.required')).toEqual({ kind: 'boolean', value: true })
    expect(rules.filter(rule => rule.selector.kind === 'exact' && rule.selector.nativeModelIds.includes('gemini-2.5-flash')).some(rule => rule.assertion.path.endsWith('thinkingLevel.nativeValues'))).toBe(false)
    const migrated = migrateCapabilityRuleOwnershipSnapshotV1ToV2(snapshot)
    const document = { schemaVersion: 2, releaseVersion: '2.0.0', packs: migrated.packs, contentRevision: computeCloudRulesContentRevisionV2(migrated.packs) }
    expect(decodeCloudRulesReleaseDocumentV1(document)).toEqual(document)
    expect(() => decodeCloudRulesReleaseDocumentV1({ ...document, schemaVersion: 1 })).toThrow()
  })
  it('selects schema2 from its separate namespace and keeps legacy selection available without it', () => {
    const release = (tag: string) => ({ id: 1, tag_name: tag, name: null, body: null, draft: false, prerelease: false, published_at: '2026-10-17T00:00:00Z', html_url: 'https://github.com/GuXinghai/starverse/releases/tag/'+tag, assets: [] })
    expect(selectHighestCloudRulesReleaseV1([release('cloud-rules-v99.0.0'), release('cloud-rules-schema2-v2.0.0')])?.tagName).toBe('cloud-rules-schema2-v2.0.0')
    expect(selectHighestCloudRulesReleaseV1([release('cloud-rules-v1.0.0')])?.releaseVersion).toBe('1.0.0')
  })
})
