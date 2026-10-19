import { describe, expect, it, vi } from 'vitest'
import { projectCapabilityRuleOwnershipSnapshotV1 } from
  '../../../core/generation-v2/capability-rules/capabilityRuleCoreV1'
import { buildAuthoritativeModelSubjectSetV1 } from '../../../core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { createMaterializedCapabilityRuleSourceAdapterV1, prepareCapabilityRuleMaterializationV1 } from '../../../core/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { buildEnumerableSourcePublicationV1 } from '../../../core/generation-v2/model-facts/sourceSnapshotBuilderV1'
import type { RawPayloadRefV1 } from '../../../core/generation-v2/model-facts/canonicalSourceFactsV1'

const proof = (scopeId: string) => Object.freeze({ kind: 'provider_native_catalog' as const,
  providerKey: 'openai_responses', scopeId, credentialScopeId: 'credential-scope-v2:test',
  credentialRevision: 1, endpointProfileId: 'openai-api-v1',
  operationContractId: 'openai-models-v1', catalogCategory: '', activeSnapshotDigest: 'a'.repeat(64) })

const subject = (nativeModelId: string) => Object.freeze({ providerAuthorityId: 'openai',
  endpointProfileId: 'openai-api-v1', nativeModelId })

function rule(input: Readonly<{
  ruleId: string
  selector: unknown
  configured?: 'default' | 'on' | 'off'
  value?: 'supported' | 'unsupported'
}>) {
  return { ruleId: input.ruleId, label: null, description: null, priority: 2,
    configured: input.configured ?? 'on', providerAuthorityId: 'openai',
    endpointProfileId: 'openai-api-v1', selector: input.selector,
    assertion: { path: 'reasoning.support', value: { kind: 'support', value: input.value ?? 'supported' } },
    evidence: null }
}

function projectedSnapshot(rules: readonly unknown[]) {
  return projectCapabilityRuleOwnershipSnapshotV1({ schemaVersion: 1, ownership: 'cloud', ownerId: 'official',
    packs: [{ schemaVersion: 1, packId: 'pack.openai', displayName: 'OpenAI', description: null,
      priority: 10, mode: 'no_control', target: 'enabled', rules }] })
}

describe('Materialized Capability Rule Source V1', () => {
  it('validates and projects a source once per publication without changing facts or reusing another snapshot', () => {
    const subjectSet = buildAuthoritativeModelSubjectSetV1([
      { subject: subject('gpt-5'), proof: proof('scope:a') },
      { subject: subject('gpt-5-mini'), proof: proof('scope:a') },
    ])
    const prepare = (value: 'supported' | 'unsupported') => prepareCapabilityRuleMaterializationV1({
      sourceScopeId: 'capability-rules:test', subjectSet,
      ownershipSnapshots: [projectedSnapshot([rule({ ruleId: 'rule.exact',
        selector: { kind: 'exact', nativeModelIds: ['gpt-5', 'gpt-5-mini'] }, value })])],
      defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' },
    })
    const first = prepare('supported'), next = prepare('unsupported')
    const payloads = new Map([first, next].map(item => [item.rawPayload.ref.storeId, item.rawPayload.persistedPayload]))
    const readRawPayload = vi.fn((ref: RawPayloadRefV1) => {
      const payload = payloads.get(ref.storeId)
      if (!payload) throw new Error('unrecognized immutable payload')
      return payload
    })
    const adapter = createMaterializedCapabilityRuleSourceAdapterV1({ rawPayloadReader: { readRawPayload } })
    const publication = buildEnumerableSourcePublicationV1({ adapter, rawSnapshot: first.rawSnapshot })
    expect(publication).toEqual(first.publication)
    expect(readRawPayload).toHaveBeenCalledTimes(1)
    const changed = buildEnumerableSourcePublicationV1({ adapter, rawSnapshot: next.rawSnapshot })
    expect(changed).toEqual(next.publication)
    expect(readRawPayload).toHaveBeenCalledTimes(2)
    expect(changed.subjectFacts[0]?.payload.outcomes[0]?.effectiveAssertion?.value)
      .toEqual({ kind: 'support', value: 'unsupported' })
  })

  it('materializes exact and constrained regex rules only onto authoritative exact subjects', () => {
    const subjectSet = buildAuthoritativeModelSubjectSetV1([
      { subject: subject('gpt-5'), proof: proof('scope:a') },
      { subject: subject('gpt-5-mini'), proof: proof('scope:a') },
    ])
    const snapshot = projectedSnapshot([
      rule({ ruleId: 'rule.exact', selector: { kind: 'exact', nativeModelIds: ['gpt-5', 'not-listed'] } }),
      rule({ ruleId: 'rule.regex', selector: { kind: 'regex', pattern: '^gpt-5(?:-mini|-nano)$',
        positiveExamples: ['gpt-5-mini', 'gpt-5-nano'], negativeExamples: ['gpt-5', 'gpt-4.1'] } }),
    ])
    const prepared = prepareCapabilityRuleMaterializationV1({ sourceScopeId: 'capability-rules:test',
      subjectSet, ownershipSnapshots: [snapshot],
      defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })

    expect(prepared.publication.subjectFacts.map((fact) => fact.payload.subject.nativeModelId))
      .toEqual(expect.arrayContaining(['gpt-5', 'gpt-5-mini']))
    expect(prepared.publication.subjectFacts).toHaveLength(2)
    expect(prepared.publication.subjectFacts.map((fact) => fact.payload.outcomes.length)).toEqual([1, 1])
    expect(JSON.stringify(prepared.publication.subjectFacts)).not.toContain('^gpt-5')
    expect(JSON.stringify(prepared.publication.subjectFacts)).not.toContain('not-listed')
  })

  it('preserves every active matched claim without choosing a winner', () => {
    const subjectSet = buildAuthoritativeModelSubjectSetV1([
      { subject: subject('gpt-5'), proof: proof('scope:a') },
    ])
    const snapshot = projectedSnapshot([
      rule({ ruleId: 'rule.supported', selector: { kind: 'exact', nativeModelIds: ['gpt-5'] } }),
      rule({ ruleId: 'rule.unsupported', selector: { kind: 'exact', nativeModelIds: ['gpt-5'] },
        value: 'unsupported' }),
      rule({ ruleId: 'rule.off', selector: { kind: 'exact', nativeModelIds: ['gpt-5'] }, configured: 'off' }),
    ])
    const prepared = prepareCapabilityRuleMaterializationV1({ sourceScopeId: 'capability-rules:test',
      subjectSet, ownershipSnapshots: [snapshot],
      defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })
    const outcomes = prepared.publication.subjectFacts[0]!.payload.outcomes
    expect(outcomes).toHaveLength(2)
    expect(outcomes.map((outcome) => outcome.effectiveAssertion?.value)).toEqual(expect.arrayContaining([
      { kind: 'support', value: 'supported' }, { kind: 'support', value: 'unsupported' },
    ]))
  })

  it('is deterministic, while rule definitions and subject membership independently change revisions', () => {
    const firstSet = buildAuthoritativeModelSubjectSetV1([
      { subject: subject('gpt-5'), proof: proof('scope:a') },
    ])
    const firstSnapshot = projectedSnapshot([
      rule({ ruleId: 'rule.exact', selector: { kind: 'exact', nativeModelIds: ['gpt-5'] } }),
    ])
    const input = { sourceScopeId: 'capability-rules:test', subjectSet: firstSet,
      ownershipSnapshots: [firstSnapshot],
      defaultActivationPolicies: { cloud: 'enabled' as const, user: 'enabled' as const } }
    const first = prepareCapabilityRuleMaterializationV1(input)
    expect(prepareCapabilityRuleMaterializationV1(input).materializationRevision)
      .toBe(first.materializationRevision)
    const proofOnlyChange = prepareCapabilityRuleMaterializationV1({ ...input,
      subjectSet: buildAuthoritativeModelSubjectSetV1([
        { subject: subject('gpt-5'), proof: { ...proof('scope:a'), credentialRevision: 2,
          activeSnapshotDigest: 'b'.repeat(64) } },
      ]) })
    expect(proofOnlyChange.materializationRevision).toBe(first.materializationRevision)

    const changedRule = prepareCapabilityRuleMaterializationV1({ ...input,
      ownershipSnapshots: [projectedSnapshot([
        rule({ ruleId: 'rule.exact', selector: { kind: 'exact', nativeModelIds: ['gpt-5'] },
          value: 'unsupported' }),
      ])] })
    expect(changedRule.ruleDefinitionRevision).not.toBe(first.ruleDefinitionRevision)
    expect(changedRule.authoritativeSubjectSetRevision).toBe(first.authoritativeSubjectSetRevision)

    const changedSubjects = prepareCapabilityRuleMaterializationV1({ ...input,
      subjectSet: buildAuthoritativeModelSubjectSetV1([
        { subject: subject('gpt-5'), proof: proof('scope:a') },
        { subject: subject('gpt-5-mini'), proof: proof('scope:a') },
      ]) })
    expect(changedSubjects.ruleDefinitionRevision).toBe(first.ruleDefinitionRevision)
    expect(changedSubjects.authoritativeSubjectSetRevision).not.toBe(first.authoritativeSubjectSetRevision)
  })

  it('applies separate Cloud and User default activation policies without creating source winners', () => {
    const subjectSet = buildAuthoritativeModelSubjectSetV1([
      { subject: subject('gpt-5'), proof: proof('scope:a') },
    ])
    const cloud = projectedSnapshot([
      rule({ ruleId: 'rule.cloud', configured: 'default',
        selector: { kind: 'exact', nativeModelIds: ['gpt-5'] } }),
    ])
    const userDefinition = { ...cloud.definition, ownership: 'user' as const, ownerId: 'local-user',
      packs: cloud.definition.packs.map((pack) => ({ ...pack,
        rules: pack.rules.map((entry) => ({ ...entry, ruleId: 'rule.user' })) })) }
    const prepared = prepareCapabilityRuleMaterializationV1({ sourceScopeId: 'capability-rules:test',
      subjectSet, ownershipSnapshots: [cloud, projectCapabilityRuleOwnershipSnapshotV1(userDefinition)],
      defaultActivationPolicies: { cloud: 'disabled', user: 'enabled' } })
    const claims = prepared.publication.subjectFacts[0]!.payload.outcomes
      .map((outcome) => outcome.effectiveAssertion?.provenance.ruleClaim)
    expect(claims).toHaveLength(1)
    expect(claims[0]).toMatchObject({ ownerKind: 'user', ownerId: 'local-user', ruleId: 'rule.user' })
  })
})
