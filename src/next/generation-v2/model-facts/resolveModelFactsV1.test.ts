import { describe, expect, it } from 'vitest'
import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
  type CanonicalFactValueV1,
  type CanonicalModelSubjectV1,
  type CanonicalObservationProvenanceV1,
  type CanonicalFactProvenanceV1,
  type CanonicalSourceKindV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
} from './canonicalSourceFactsV1'
import {
  buildDerivedAssertionV1,
  buildExplicitAssertionV1,
  invalidOutcomeV1,
  presentOutcomeV1,
} from './sourceAdapterV1'
import {
  buildSourcePriorityConfigV1,
  DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
  type SourcePriorityConfigV1,
} from './sourcePriorityConfigV1'
import { resolveModelFactsV1 } from './resolveModelFactsV1'
import type { ModelFactsResolutionInputV1 } from './resolvedModelFactsV1'

const subject: CanonicalModelSubjectV1 = Object.freeze({
  providerAuthorityId: 'provider:test', endpointProfileId: 'endpoint:test', nativeModelId: 'model:test',
})

function sourceRevision(sourceKind: CanonicalSourceKindV1, previousLkgSourceRevision?: string): CanonicalSourceRevisionRefV1 {
  return buildCanonicalSourceRevisionRefV1({ sourceKind, sourceScopeId: `scope:${sourceKind}`,
    rawSourceSnapshotRevision: `raw:${sourceKind}`, adapterRevision: `adapter:${sourceKind}`,
    coverageManifestRevision: `manifest:${sourceKind}`, providerAuthorityRegistryRevision: 'registry:test',
    ...(previousLkgSourceRevision === undefined ? {} : { previousLkgSourceRevision }) })
}

function observation(revision: CanonicalSourceRevisionRefV1): CanonicalObservationProvenanceV1 {
  return Object.freeze({ sourceKind: revision.sourceKind,
    canonicalSourceRevision: revision.canonicalSourceRevision,
    sourceFieldRefs: Object.freeze([{ rawPayloadRef: { storeId: `canonical-raw-v1:${'a'.repeat(64)}`,
      persistedPayloadSha256: 'a'.repeat(64), recordKey: revision.sourceKind, sanitizerRevision: 'sanitizer:test' },
      sourceRecordIdentity: revision.sourceKind, sourceFieldPath: 'field', observedPresence: 'present' as const }]),
    adapterId: `adapter:${revision.sourceKind}`, adapterRevision: revision.adapterRevision,
    mappingId: `mapping:${revision.sourceKind}` })
}

function sourceFact(sourceKind: CanonicalSourceKindV1, values: readonly Readonly<{
  path: 'reasoning.support' | 'reasoning.effort.nativeValues' | 'reasoning.budgetTokens.domain'
  value: CanonicalFactValueV1
  derived?: boolean
  ruleClaim?: NonNullable<CanonicalFactProvenanceV1['ruleClaim']>
}>[], invalidPath?: 'reasoning.support', previous?: CanonicalSubjectFactPayloadV1): { payload: CanonicalSubjectFactPayloadV1; ref: CanonicalSubjectFactRefV1 } {
  const revision = sourceRevision(sourceKind, previous?.sourceRevision.canonicalSourceRevision)
  const provenance = observation(revision)
  const outcomes = values.map((entry, index) => {
    const assertionInput = { subject, sourceRevision: revision, path: entry.path, value: entry.value,
      sourceClaimIdentity: `${sourceKind}:${entry.path}:${String(entry.value.kind)}:${index}`,
      evidenceRefs: [`evidence:${sourceKind}`], observationProvenance: provenance,
      ...(entry.ruleClaim === undefined ? {} : { ruleClaim: entry.ruleClaim }) }
    const assertion = entry.derived
      ? buildDerivedAssertionV1({ ...assertionInput, derivation: { derivationId: 'derivation:test',
        derivationRevision: 'derivation-revision:test', inputClaimRefs: ['claim:input'], inputEvidenceRefs: ['evidence:input'] } })
      : buildExplicitAssertionV1(assertionInput)
    return presentOutcomeV1({ assertion })
  })
  if (invalidPath) outcomes.push(invalidOutcomeV1({ path: invalidPath, provenance, errorCode: 'TEST_INVALID' }))
  return buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision: revision,
    recordOutcome: 'present', outcomes, unmappedSourceFields: [] }, previous)
}

function present(sourceKind: CanonicalSourceKindV1, values: Parameters<typeof sourceFact>[1], invalidPath?: Parameters<typeof sourceFact>[2], previous?: CanonicalSubjectFactPayloadV1) {
  const fact = sourceFact(sourceKind, values, invalidPath, previous)
  return { kind: 'present' as const, ref: fact.ref, payload: fact.payload }
}

function absent(reason: 'not_available' | 'not_configured' | 'no_exact_subject' | 'not_eligible') {
  return { kind: 'absent' as const, reason }
}

function ruleClaim(selectorKind: 'exact' | 'regex', effectiveRulePriority: number): NonNullable<CanonicalFactProvenanceV1['ruleClaim']> {
  return { ownerKind: 'built_in', ownerId: 'owner:test', packId: 'pack:test', ruleId: `rule:${effectiveRulePriority}`,
    packRevision: 'pack-revision:test', ruleRevision: `rule-revision:${effectiveRulePriority}`,
    selectorKind, selectorRef: `selector:${selectorKind}`, packPriority: effectiveRulePriority,
    rulePriority: 0, effectiveRulePriority, prioritySemanticsRevision: 'priority:test' }
}

function resolutionInput(config: SourcePriorityConfigV1, sources: Partial<ModelFactsResolutionInputV1['sources']> = {}): ModelFactsResolutionInputV1 {
  return { schemaVersion: 1, subject,
    sources: {
      providerNative: sources.providerNative ?? absent('no_exact_subject'),
      modelsDev: sources.modelsDev ?? absent('no_exact_subject'),
      capabilityRules: sources.capabilityRules ?? absent('not_available'),
    }, sourcePriorityConfigRevision: config.sourcePriorityConfigRevision,
    resolverRevision: 'model-facts-resolver-v1:test', ontologyRevision: 'model-facts-ontology-v1:test' }
}

function field(result: ReturnType<typeof resolveModelFactsV1>, path: 'reasoning.support' | 'reasoning.effort.nativeValues' | 'reasoning.budgetTokens.domain') {
  return result.fields.find((candidate) => candidate.path === path)!
}

describe('three-source model facts resolver V1', () => {
  it('selects by configured priority and preserves lower claims as overridden provenance', () => {
    const result = resolveModelFactsV1({
      sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
      resolutionInput: resolutionInput(DEFAULT_SOURCE_PRIORITY_CONFIG_V1, {
        providerNative: present('provider_native', [{ path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }]),
        modelsDev: present('models_dev', [{ path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' } }]),
      }),
    })
    const selected = field(result, 'reasoning.support')
    expect(selected.state).toBe('resolved')
    expect(selected.selectedValue).toEqual({ kind: 'support', value: 'supported' })
    expect(selected.selectionReason).toBe('higher_priority_claim')
    expect(selected.overriddenProvenance.map((entry) => entry.sourceKind)).toEqual(['models_dev'])
  })

  it('keeps invalid diagnostics while allowing a lower source to fill', () => {
    const result = resolveModelFactsV1({
      sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
      resolutionInput: resolutionInput(DEFAULT_SOURCE_PRIORITY_CONFIG_V1, {
        providerNative: present('provider_native', [], 'reasoning.support'),
        modelsDev: present('models_dev', [{ path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }]),
      }),
    })
    const selected = field(result, 'reasoning.support')
    expect(selected.state).toBe('resolved')
    expect(selected.selectionReason).toBe('lower_priority_fill')
    expect(selected.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'invalid', sourceKind: 'provider_native' })]))
  })

  it('uses a retained same-subject LKG assertion while preserving the current invalid observation', () => {
    const previous = sourceFact('provider_native', [{ path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }]).payload
    const current = sourceFact('provider_native', [], 'reasoning.support', previous)
    const result = resolveModelFactsV1({
      sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
      resolutionInput: resolutionInput(DEFAULT_SOURCE_PRIORITY_CONFIG_V1, {
        providerNative: { kind: 'present', ref: current.ref, payload: current.payload },
      }),
    })
    const selected = field(result, 'reasoning.support')
    expect(selected.selectedValue).toEqual({ kind: 'support', value: 'supported' })
    expect(selected.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'invalid' })]))
    expect(selected.supportingProvenance[0].sourceAssertion.provenance.canonicalSourceRevision)
      .toBe(previous.sourceRevision.canonicalSourceRevision)
  })

  it('reports equal-priority disagreement as conflict and prefers explicit over derived', () => {
    const config = buildSourcePriorityConfigV1({ provider_native: 3, models_dev: 3, capability_rule: 3 })
    const conflict = resolveModelFactsV1({
      sourcePriorityConfig: config,
      resolutionInput: resolutionInput(config, {
        providerNative: present('provider_native', [{ path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }]),
        modelsDev: present('models_dev', [{ path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' } }]),
      }),
    })
    expect(field(conflict, 'reasoning.support').state).toBe('conflict')
    expect(field(conflict, 'reasoning.support').candidates).toHaveLength(2)

    const explicitWins = resolveModelFactsV1({
      sourcePriorityConfig: config,
      resolutionInput: resolutionInput(config, {
        providerNative: present('provider_native', [
          { path: 'reasoning.support', value: { kind: 'support', value: 'supported' }, derived: true },
          { path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' } },
        ]),
      }),
    })
    expect(field(explicitWins, 'reasoning.support').selectedValue).toEqual({ kind: 'support', value: 'unsupported' })
    expect(field(explicitWins, 'reasoning.support').selectionReason).toBe('explicit_over_derived')
  })

  it('supplements only explicit partial collections and keeps a single semantic revision', () => {
    const result = resolveModelFactsV1({
      sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
      resolutionInput: resolutionInput(DEFAULT_SOURCE_PRIORITY_CONFIG_V1, {
        providerNative: present('provider_native', [{ path: 'reasoning.effort.nativeValues',
          value: { kind: 'native_string_set', values: ['native-a'], completeness: 'partial' } }]),
        modelsDev: present('models_dev', [{ path: 'reasoning.effort.nativeValues',
          value: { kind: 'native_string_set', values: ['native-b'], completeness: 'partial' } }]),
      }),
    })
    const selected = field(result, 'reasoning.effort.nativeValues')
    expect(selected.state).toBe('resolved')
    expect(selected.selectedValue).toEqual({ kind: 'native_string_set', values: ['native-a', 'native-b'], completeness: 'partial' })
    expect(selected.selectionReason).toBe('partial_supplementation')
    expect(result.capabilityRevision).toMatch(/^capability-revision-v1:[a-f0-9]{64}$/u)
  })

  it('keeps complete collections atomic instead of implicitly unioning lower-priority values', () => {
    const result = resolveModelFactsV1({
      sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
      resolutionInput: resolutionInput(DEFAULT_SOURCE_PRIORITY_CONFIG_V1, {
        providerNative: present('provider_native', [{ path: 'reasoning.effort.nativeValues',
          value: { kind: 'native_string_set', values: ['native-a'], completeness: 'complete' } }]),
        modelsDev: present('models_dev', [{ path: 'reasoning.effort.nativeValues',
          value: { kind: 'native_string_set', values: ['native-b'], completeness: 'complete' } }]),
      }),
    })
    const selected = field(result, 'reasoning.effort.nativeValues')
    expect(selected.selectedValue).toEqual({ kind: 'native_string_set', values: ['native-a'], completeness: 'complete' })
    expect(selected.overriddenProvenance.map((entry) => entry.sourceKind)).toEqual(['models_dev'])
  })

  it('supplements non-overlapping explicit partial integer bounds', () => {
    const result = resolveModelFactsV1({
      sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
      resolutionInput: resolutionInput(DEFAULT_SOURCE_PRIORITY_CONFIG_V1, {
        providerNative: present('provider_native', [{ path: 'reasoning.budgetTokens.domain',
          value: { kind: 'integer_domain', unit: 'token', interval: { min: 0, minInclusive: true, maxInclusive: true }, completeness: 'partial_bounds' } }]),
        modelsDev: present('models_dev', [{ path: 'reasoning.budgetTokens.domain',
          value: { kind: 'integer_domain', unit: 'token', interval: { max: 24576, minInclusive: true, maxInclusive: true }, completeness: 'partial_bounds' } }]),
      }),
    })
    const selected = field(result, 'reasoning.budgetTokens.domain')
    expect(selected.selectionReason).toBe('partial_supplementation')
    expect(selected.selectedValue).toEqual({ kind: 'integer_domain', unit: 'token',
      interval: { min: 0, max: 24576, minInclusive: true, maxInclusive: true }, completeness: 'partial_bounds' })
  })

  it('applies Rules exact-over-regex and effective Rule priority before cross-source priority', () => {
    const result = resolveModelFactsV1({
      sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1,
      resolutionInput: resolutionInput(DEFAULT_SOURCE_PRIORITY_CONFIG_V1, {
        capabilityRules: present('capability_rule', [
          { path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' },
            ruleClaim: ruleClaim('regex', 99) },
          { path: 'reasoning.support', value: { kind: 'support', value: 'supported' },
            ruleClaim: ruleClaim('exact', 1) },
          { path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' },
            ruleClaim: ruleClaim('exact', 10) },
        ]),
      }),
    })
    const selected = field(result, 'reasoning.support')
    expect(selected.state).toBe('resolved')
    expect(selected.selectedValue).toEqual({ kind: 'support', value: 'unsupported' })
    expect(selected.overriddenProvenance.map((entry) => entry.sourceAssertion.provenance.ruleClaim?.selectorKind))
      .toEqual(expect.arrayContaining(['regex', 'exact']))
  })
})
