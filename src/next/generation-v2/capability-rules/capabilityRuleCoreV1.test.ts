import { describe, expect, it } from 'vitest'
import {
  decodeCapabilityRuleCorePackV1,
  decodeCapabilityRuleOwnershipSnapshotV1,
  evaluateCapabilityRuleActivationV1,
  planCapabilityRuleRewriteV1,
  projectCapabilityRuleCorePackV1,
  projectCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleConfiguredStateV1,
  type CapabilityRuleDefaultActivationPolicyV1,
  type CapabilityRulePackModeV1,
  type CapabilityRulePackTargetV1,
} from './capabilityRuleCoreV1'

function rule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: 'rule.reasoning',
    label: null,
    description: null,
    priority: 0,
    configured: 'default',
    providerAuthorityId: 'openai',
    endpointProfileId: 'openai-default',
    selector: { kind: 'exact', nativeModelIds: ['gpt-5-mini', 'gpt-5'] },
    assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
    evidence: null,
    ...overrides,
  }
}

function pack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    packId: 'pack.reasoning',
    displayName: 'Reasoning facts',
    description: null,
    priority: 0,
    mode: 'no_control',
    target: 'enabled',
    rules: [rule()],
    ...overrides,
  }
}

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { schemaVersion: 1, ownership: 'cloud', ownerId: 'official', packs: [pack()], ...overrides }
}

function evidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evidenceSourceRef: 'provider.docs.reasoning',
    evidenceKind: 'explicit_provider',
    evidenceNote: 'Official provider documentation.',
    identityEvidenceKind: 'official_exact_model_doc',
    identityEvidenceSourceRef: 'provider.docs.model-id',
    provenanceUrl: 'https://example.com/models/reasoning',
    verifiedAt: '2026-09-21T00:00:00.000Z',
    derivation: null,
    ...overrides,
  }
}

describe('Capability Rule shared core V1', () => {
  it('canonicalizes unordered exact selectors and Pack/Rule sets deterministically', () => {
    const first = projectCapabilityRuleOwnershipSnapshotV1({
      ...snapshot(),
      packs: [
        pack({ packId: 'pack.z', rules: [rule({ ruleId: 'rule.z' })] }),
        pack({ packId: 'pack.a', rules: [rule({ ruleId: 'rule.b', selector: {
          kind: 'exact', nativeModelIds: ['gpt-5-mini', 'gpt-5'],
        } }), rule({ ruleId: 'rule.a' })] }),
      ],
    })
    const second = projectCapabilityRuleOwnershipSnapshotV1({
      ...snapshot(),
      packs: [
        pack({ packId: 'pack.a', rules: [rule({ ruleId: 'rule.a' }), rule({
          ruleId: 'rule.b', selector: { kind: 'exact', nativeModelIds: ['gpt-5', 'gpt-5-mini'] },
        })] }),
        pack({ packId: 'pack.z', rules: [rule({ ruleId: 'rule.z' })] }),
      ],
    })
    expect(first.snapshotRevision).toBe(second.snapshotRevision)
    expect(first.definition.packs.map((entry) => entry.packId)).toEqual(['pack.a', 'pack.z'])
    expect(first.definition.packs[0]?.rules.map((entry) => entry.ruleId)).toEqual(['rule.a', 'rule.b'])
    expect(first.definition.packs[0]?.rules[1]?.selector).toEqual({
      kind: 'exact', nativeModelIds: ['gpt-5', 'gpt-5-mini'],
    })
  })

  it('keeps the shared Pack content owner-neutral while ownership revisions remain isolated', () => {
    const cloud = projectCapabilityRuleOwnershipSnapshotV1(snapshot())
    const user = projectCapabilityRuleOwnershipSnapshotV1(snapshot({ ownership: 'user', ownerId: 'local-user' }))
    expect(cloud.packs[0]?.packRevision).toBe(user.packs[0]?.packRevision)
    expect(cloud.snapshotRevision).not.toBe(user.snapshotRevision)
    expect(Object.keys(cloud.packs[0]!.definition)).not.toContain('ownership')
    expect(Object.keys(cloud.packs[0]!.definition)).not.toContain('ownerId')
  })

  it('uses globally stable Rule identities within one ownership snapshot', () => {
    expect(() => decodeCapabilityRuleOwnershipSnapshotV1(snapshot({ packs: [
      pack({ packId: 'pack.a', rules: [rule({ ruleId: 'stable.rule' })] }),
      pack({ packId: 'pack.b', rules: [rule({ ruleId: 'stable.rule' })] }),
    ] }))).toThrowError('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
  })

  it('rejects unknown fields and non-canonical assertion values', () => {
    expect(() => decodeCapabilityRuleCorePackV1({ ...pack(), hiddenLifecycle: true }))
      .toThrowError('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
    expect(() => decodeCapabilityRuleCorePackV1(pack({ rules: [rule({ assertion: {
      path: 'reasoning.support', value: { kind: 'native_string', value: 'yes' },
    } })] }))).toThrowError()
  })

  it('requires constrained regex selectors with passing positive and negative examples', () => {
    const valid = decodeCapabilityRuleCorePackV1(pack({ rules: [rule({ selector: {
      kind: 'regex', pattern: '^gemini-2\\.5-(?:pro|flash)$',
      positiveExamples: ['gemini-2.5-flash', 'gemini-2.5-pro'], negativeExamples: ['gemini-pro'],
    } })] }))
    expect(valid.rules[0]?.selector.kind).toBe('regex')
    expect(() => decodeCapabilityRuleCorePackV1(pack({ rules: [rule({ selector: {
      kind: 'regex', pattern: '^.*pro.*$', positiveExamples: ['gpt-pro'], negativeExamples: ['gpt-mini'],
    } })] }))).toThrowError('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
  })

  it('covers every Pack semantic field in Pack revisions', () => {
    const baselineProjection = projectCapabilityRuleCorePackV1(pack())
    const variants = [
      pack({ packId: 'pack.changed' }),
      pack({ displayName: 'Changed' }),
      pack({ description: 'Changed' }),
      pack({ priority: 1 }),
      pack({ mode: 'override' }),
      pack({ target: 'disabled' }),
      pack({ rules: [rule(), rule({ ruleId: 'rule.second' })] }),
    ]
    for (const variant of variants) {
      expect(projectCapabilityRuleCorePackV1(variant).packRevision).not.toBe(baselineProjection.packRevision)
    }
  })

  it('covers every Rule semantic field in Rule, Pack, and ownership revisions', () => {
    const baselineRule = { ...rule(), evidence: evidence() }
    const baselinePack = pack({ rules: [baselineRule] })
    const baselinePackProjection = projectCapabilityRuleCorePackV1(baselinePack)
    const baselineSnapshot = projectCapabilityRuleOwnershipSnapshotV1(snapshot({ packs: [baselinePack] }))
    const ruleVariants = [
      rule({ ruleId: 'rule.changed', evidence: evidence() }),
      rule({ label: 'Changed', evidence: evidence() }),
      rule({ description: 'Changed', evidence: evidence() }),
      rule({ priority: 1, evidence: evidence() }),
      rule({ configured: 'on', evidence: evidence() }),
      rule({ providerAuthorityId: 'anthropic', evidence: evidence() }),
      rule({ endpointProfileId: 'other', evidence: evidence() }),
      rule({ selector: { kind: 'exact', nativeModelIds: ['gpt-5-mini'] }, evidence: evidence() }),
      rule({ selector: { kind: 'regex', pattern: '^gpt-(?:5|5-mini)$',
        positiveExamples: ['gpt-5', 'gpt-5-mini'], negativeExamples: ['gpt-4'], }, evidence: evidence() }),
      rule({ assertion: { path: 'tools.calling.support',
        value: { kind: 'support', value: 'supported' } }, evidence: evidence() }),
      rule({ assertion: { path: 'reasoning.support',
        value: { kind: 'support', value: 'unsupported' } }, evidence: evidence() }),
      rule({ evidence: null }),
    ]
    for (const variant of ruleVariants) {
      const changedPack = pack({ rules: [variant] })
      const changedPackProjection = projectCapabilityRuleCorePackV1(changedPack)
      const changedSnapshot = projectCapabilityRuleOwnershipSnapshotV1(snapshot({ packs: [changedPack] }))
      expect(changedPackProjection.rules[0]?.ruleRevision)
        .not.toBe(baselinePackProjection.rules[0]?.ruleRevision)
      expect(changedPackProjection.packRevision).not.toBe(baselinePackProjection.packRevision)
      expect(changedSnapshot.snapshotRevision).not.toBe(baselineSnapshot.snapshotRevision)
    }
    const evidenceVariants = [
      evidence({ evidenceSourceRef: 'provider.docs.changed' }),
      evidence({ evidenceKind: 'explicit_provider_series' }),
      evidence({ evidenceNote: 'Changed evidence note.' }),
      evidence({ identityEvidenceKind: 'provider_archive' }),
      evidence({ identityEvidenceSourceRef: 'provider.archive.changed' }),
      evidence({ provenanceUrl: 'https://example.com/changed' }),
      evidence({ verifiedAt: '2026-09-22T00:00:00.000Z' }),
      evidence({ evidenceKind: 'derived_empirical', derivation: {
        derivationId: 'derivation.reasoning', derivationRevision: 'derivation.reasoning.v1',
        inputClaimRefs: ['claim.input'], inputEvidenceRefs: ['evidence.input'],
      } }),
    ]
    for (const changedEvidence of evidenceVariants) {
      const changedPackProjection = projectCapabilityRuleCorePackV1(pack({
        rules: [rule({ evidence: changedEvidence })],
      }))
      expect(changedPackProjection.rules[0]?.ruleRevision)
        .not.toBe(baselinePackProjection.rules[0]?.ruleRevision)
    }

    const regexBaseline = projectCapabilityRuleCorePackV1(pack({ rules: [rule({ selector: {
      kind: 'regex', pattern: '^gpt-(?:5|5-mini)$', positiveExamples: ['gpt-5'],
      negativeExamples: ['gpt-4'],
    } })] })).rules[0]!.ruleRevision
    const regexVariants = [
      { kind: 'regex', pattern: '^gpt-(?:5|5-nano)$', positiveExamples: ['gpt-5'],
        negativeExamples: ['gpt-4'] },
      { kind: 'regex', pattern: '^gpt-(?:5|5-mini)$', positiveExamples: ['gpt-5-mini'],
        negativeExamples: ['gpt-4'] },
      { kind: 'regex', pattern: '^gpt-(?:5|5-mini)$', positiveExamples: ['gpt-5'],
        negativeExamples: ['gpt-3'] },
    ]
    for (const selector of regexVariants) {
      expect(projectCapabilityRuleCorePackV1(pack({ rules: [rule({ selector })] }))
        .rules[0]!.ruleRevision).not.toBe(regexBaseline)
    }

    const derivedBaseline = evidence({ evidenceKind: 'derived_empirical', derivation: {
      derivationId: 'derivation.reasoning', derivationRevision: 'derivation.reasoning.v1',
      inputClaimRefs: ['claim.input'], inputEvidenceRefs: ['evidence.input'],
    } })
    const derivedBaselineRevision = projectCapabilityRuleCorePackV1(pack({
      rules: [rule({ evidence: derivedBaseline })],
    })).rules[0]!.ruleRevision
    const derivationVariants = [
      { derivationId: 'derivation.changed', derivationRevision: 'derivation.reasoning.v1',
        inputClaimRefs: ['claim.input'], inputEvidenceRefs: ['evidence.input'] },
      { derivationId: 'derivation.reasoning', derivationRevision: 'derivation.reasoning.v2',
        inputClaimRefs: ['claim.input'], inputEvidenceRefs: ['evidence.input'] },
      { derivationId: 'derivation.reasoning', derivationRevision: 'derivation.reasoning.v1',
        inputClaimRefs: ['claim.changed'], inputEvidenceRefs: ['evidence.input'] },
      { derivationId: 'derivation.reasoning', derivationRevision: 'derivation.reasoning.v1',
        inputClaimRefs: ['claim.input'], inputEvidenceRefs: ['evidence.changed'] },
    ]
    for (const derivation of derivationVariants) {
      const changed = evidence({ evidenceKind: 'derived_empirical', derivation })
      expect(projectCapabilityRuleCorePackV1(pack({ rules: [rule({ evidence: changed })] }))
        .rules[0]!.ruleRevision).not.toBe(derivedBaselineRevision)
    }
  })

  it('covers ownership metadata only in ownership snapshot revisions', () => {
    const cloud = projectCapabilityRuleOwnershipSnapshotV1(snapshot())
    const changedOwner = projectCapabilityRuleOwnershipSnapshotV1(snapshot({ ownerId: 'other-owner' }))
    const user = projectCapabilityRuleOwnershipSnapshotV1(snapshot({ ownership: 'user' }))
    expect(changedOwner.snapshotRevision).not.toBe(cloud.snapshotRevision)
    expect(user.snapshotRevision).not.toBe(cloud.snapshotRevision)
    expect(changedOwner.packs[0]?.packRevision).toBe(cloud.packs[0]?.packRevision)
    expect(user.packs[0]?.packRevision).toBe(cloud.packs[0]?.packRevision)
  })
})

describe('Capability Rule activation V1', () => {
  const modes: readonly CapabilityRulePackModeV1[] = ['override', 'default_only', 'no_control']
  const targets: readonly CapabilityRulePackTargetV1[] = ['enabled', 'disabled']
  const configuredStates: readonly CapabilityRuleConfiguredStateV1[] = ['default', 'on', 'off']
  const policies: readonly CapabilityRuleDefaultActivationPolicyV1[] = ['enabled', 'disabled']

  it('covers the full shared activation truth table', () => {
    for (const mode of modes) for (const target of targets) for (const configured of configuredStates) {
      for (const defaultPolicy of policies) {
        const result = evaluateCapabilityRuleActivationV1({ mode, target, configured, defaultPolicy })
        if (mode === 'override') {
          expect(result).toEqual({ enabled: target === 'enabled', source: 'pack_override' })
        } else if (configured !== 'default') {
          expect(result).toEqual({ enabled: configured === 'on', source: 'rule_explicit' })
        } else if (mode === 'default_only') {
          expect(result).toEqual({ enabled: target === 'enabled', source: 'pack_default_only' })
        } else {
          expect(result).toEqual({ enabled: defaultPolicy === 'enabled', source: 'ownership_default_policy' })
        }
      }
    }
  })

  it('plans one-shot Rewrite without changing Pack policy or future Rules', () => {
    const rules = [
      { ruleId: 'default', configured: 'default' as const },
      { ruleId: 'on', configured: 'on' as const },
      { ruleId: 'off', configured: 'off' as const },
    ]
    expect(planCapabilityRuleRewriteV1({ mode: 'override', target: 'disabled', rules })).toEqual({
      available: true, configured: 'off', selectedRuleIds: ['default', 'off', 'on'],
      changedRules: [{ ruleId: 'default', configured: 'off' }, { ruleId: 'on', configured: 'off' }],
    })
    expect(planCapabilityRuleRewriteV1({ mode: 'default_only', target: 'enabled', rules })).toEqual({
      available: true, configured: 'on', selectedRuleIds: ['default'],
      changedRules: [{ ruleId: 'default', configured: 'on' }],
    })
    expect(planCapabilityRuleRewriteV1({ mode: 'no_control', target: 'enabled', rules })).toEqual({
      available: false, configured: null, selectedRuleIds: [], changedRules: [],
    })
    const laterRule = { ruleId: 'later', configured: 'default' as const }
    expect(planCapabilityRuleRewriteV1({ mode: 'default_only', target: 'enabled', rules })
      .selectedRuleIds).not.toContain(laterRule.ruleId)
  })
})
