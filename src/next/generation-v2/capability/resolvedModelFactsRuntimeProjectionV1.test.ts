import { describe, expect, it } from 'vitest'
import { decodeProviderBindingRecordV2 } from '../domain/providerBindingV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from './modelCapabilitySchemaV2'
import { projectResolvedModelFactsToRuntimeV2 } from './resolvedModelFactsRuntimeProjectionV1'
import type { ResolvedModelFactsV1 } from '../model-facts/resolvedModelFactsV1'
import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
  type CanonicalFactValueV1,
  type CanonicalModelSubjectV1,
  type CanonicalObservationProvenanceV1,
  type CanonicalSemanticPathV1,
  type CanonicalSourceKindV1,
  type CanonicalFactProvenanceV1,
} from '../model-facts/canonicalSourceFactsV1'
import { buildExplicitAssertionV1, presentOutcomeV1 } from '../model-facts/sourceAdapterV1'
import { buildSourcePriorityConfigV1 } from '../model-facts/sourcePriorityConfigV1'
import { resolveModelFactsV1 } from '../model-facts/resolveModelFactsV1'

const binding = decodeProviderBindingRecordV2({
  credentialScopeId: 'credential-scope:test', providerId: 'openai_responses',
  endpointProfileId: 'openai-api-v1',
  endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint-set:test',
    descriptors: [{ endpointId: 'responses', descriptorRevision: 'descriptor:test' }] },
  protocolContractId: 'openai-responses-v1', contractRevision: `openai-responses-v1:${'a'.repeat(64)}`,
  contractDefinitionDigest: 'a'.repeat(64), registryRevision: `provider-contract-registry-v1:${'b'.repeat(64)}`,
  modelId: 'gpt-5.4', operation: 'text',
})

function facts(...fields: readonly Readonly<Record<string, unknown>>[]): ResolvedModelFactsV1 {
  return {
    schemaVersion: 1,
    input: {} as ResolvedModelFactsV1['input'],
    fields: fields as unknown as ResolvedModelFactsV1['fields'],
    capabilityRevision: `capability-revision-v1:${'c'.repeat(64)}`,
  }
}

function provenance(sourceKind: 'provider_native' | 'models_dev' | 'capability_rule', claimId: string) {
  return {
    sourceKind,
    sourceFactRef: {
      canonicalSubjectFactRevision: `${sourceKind}:revision:${claimId}`,
      subjectFactPayloadDigest: 'a'.repeat(64),
    },
    sourceAssertion: { provenance: { claimId } },
    sourcePriority: sourceKind === 'provider_native' ? 3 : sourceKind === 'models_dev' ? 2 : 1,
  }
}

function resolvedField(path: string, selectedValue: unknown, input: Readonly<{
  state?: 'resolved' | 'conflict'
  supporting?: readonly Readonly<Record<string, unknown>>[]
  opposing?: readonly Readonly<Record<string, unknown>>[]
  overridden?: readonly Readonly<Record<string, unknown>>[]
}> = {}) {
  return {
    path,
    state: input.state ?? 'resolved',
    selectedValue,
    completenessDisposition: 'complete',
    selectionReason: input.state === 'conflict' ? 'equal_priority_conflict' : 'single_claim',
    supportingProvenance: input.supporting ?? [],
    opposingProvenance: input.opposing ?? [],
    overriddenProvenance: input.overridden ?? [],
    diagnostics: [],
  }
}

const resolverSubject: CanonicalModelSubjectV1 = Object.freeze({
  providerAuthorityId: 'provider:test', endpointProfileId: 'endpoint:test', nativeModelId: 'model:test',
})

function resolverRevision(sourceKind: CanonicalSourceKindV1) {
  return buildCanonicalSourceRevisionRefV1({ sourceKind, sourceScopeId: `scope:${sourceKind}`,
    rawSourceSnapshotRevision: `raw:${sourceKind}`, adapterRevision: `adapter:${sourceKind}`,
    coverageManifestRevision: `manifest:${sourceKind}`, providerAuthorityRegistryRevision: 'registry:test' })
}

function resolverObservation(revision: ReturnType<typeof resolverRevision>): CanonicalObservationProvenanceV1 {
  return Object.freeze({ sourceKind: revision.sourceKind, canonicalSourceRevision: revision.canonicalSourceRevision,
    sourceFieldRefs: Object.freeze([{ rawPayloadRef: { storeId: `canonical-raw-v1:${'a'.repeat(64)}`,
      persistedPayloadSha256: 'a'.repeat(64), recordKey: revision.sourceKind, sanitizerRevision: 'sanitizer:test' },
      sourceRecordIdentity: revision.sourceKind, sourceFieldPath: 'field', observedPresence: 'present' as const }]),
    adapterId: `adapter:${revision.sourceKind}`, adapterRevision: revision.adapterRevision, mappingId: `mapping:${revision.sourceKind}` })
}

function resolvedFromSources(input: Readonly<{
  providerNative?: Readonly<{ path: CanonicalSemanticPathV1; value: CanonicalFactValueV1 }>
  modelsDev?: Readonly<{ path: CanonicalSemanticPathV1; value: CanonicalFactValueV1 }>
  capabilityRules?: Readonly<{ path: CanonicalSemanticPathV1; value: CanonicalFactValueV1 }>
  equalPriority?: boolean
}>): ResolvedModelFactsV1 {
  const source = (sourceKind: CanonicalSourceKindV1, entry: Readonly<{ path: CanonicalSemanticPathV1; value: CanonicalFactValueV1 }> | undefined) => {
    if (!entry) return { kind: 'absent' as const, reason: 'no_exact_subject' as const }
    const sourceRevision = resolverRevision(sourceKind)
    const ruleClaim: CanonicalFactProvenanceV1['ruleClaim'] = sourceKind === 'capability_rule' ? {
      ownerKind: 'built_in', ownerId: 'owner:test', packId: 'pack:test', ruleId: 'rule:test',
      packRevision: 'pack-revision:test', ruleRevision: 'rule-revision:test', selectorKind: 'exact',
      selectorRef: 'selector:test', packPriority: 1, rulePriority: 1, effectiveRulePriority: 1,
      prioritySemanticsRevision: 'priority:test',
    } : undefined
    const assertion = buildExplicitAssertionV1({ subject: resolverSubject, sourceRevision, path: entry.path,
      value: entry.value, sourceClaimIdentity: `${sourceKind}:${entry.path}`, evidenceRefs: [`evidence:${sourceKind}`],
      observationProvenance: resolverObservation(sourceRevision), ...(ruleClaim ? { ruleClaim } : {}) })
    const fact = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject: resolverSubject, sourceRevision,
      recordOutcome: 'present', outcomes: [presentOutcomeV1({ assertion })], unmappedSourceFields: [] })
    return { kind: 'present' as const, ref: fact.ref, payload: fact.payload }
  }
  const priorities = input.equalPriority
    ? { provider_native: 3, models_dev: 3, capability_rule: 1 }
    : { provider_native: 3, models_dev: 2, capability_rule: 1 }
  const config = buildSourcePriorityConfigV1(priorities)
  return resolveModelFactsV1({ sourcePriorityConfig: config, resolutionInput: {
    schemaVersion: 1, subject: resolverSubject,
    sources: { providerNative: source('provider_native', input.providerNative),
      modelsDev: source('models_dev', input.modelsDev), capabilityRules: source('capability_rule', input.capabilityRules) },
    sourcePriorityConfigRevision: config.sourcePriorityConfigRevision,
    resolverRevision: 'model-facts-resolver-v1:test', ontologyRevision: 'model-facts-ontology-v1:test',
  } })
}

describe('Goal 3 model facts runtime projection V1', () => {
  it('projects only frozen facts, preserves the Goal 3 revision, and closes the runtime field set', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts({
        path: 'reasoning.support', state: 'resolved', selectedValue: { kind: 'support', value: 'supported' },
        completenessDisposition: 'complete', selectionReason: 'single_claim',
        supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [],
      }),
    })
    expect(projected.capabilityRevision).toBe(`capability-revision-v1:${'c'.repeat(64)}`)
    expect(projected.fields.map((field) => field.path)).toEqual(MODEL_CAPABILITY_SEMANTIC_PATHS_V2)
    expect(projected.fields.find((field) => field.path === 'reasoning.mode')).toMatchObject({ state: 'supported' })
    expect(projected.fields.find((field) => field.path === 'reasoning.mode')?.domain).toBeUndefined()
    expect(projected.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({ state: 'unknown' })
  })

  it('keeps equal-priority conflict as a distinct runtime conflict state', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts({
        path: 'reasoning.support', state: 'conflict', completenessDisposition: 'complete',
        selectionReason: 'equal_priority_conflict', supportingProvenance: [], opposingProvenance: [],
        overriddenProvenance: [], diagnostics: [],
      }),
    })
    expect(projected.fields.find((field) => field.path === 'reasoning.mode')).toMatchObject({
      state: 'conflict',
    })
  })

  it('uses explicit source-path precedence while retaining model defaults and maxima', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts(
        { path: 'reasoning.effort.nativeValues', state: 'resolved', selectedValue: {
          kind: 'native_string_set', values: ['low', 'high'], completeness: 'complete',
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
        { path: 'reasoning.effort.providerDefault', state: 'resolved', selectedValue: {
          kind: 'native_string', value: 'low',
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
        { path: 'sampling.temperature.support', state: 'resolved', selectedValue: {
          kind: 'support', value: 'supported',
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
        { path: 'sampling.temperature.modelMaximum', state: 'resolved', selectedValue: {
          kind: 'decimal', value: 1.25,
        }, completenessDisposition: 'complete', selectionReason: 'single_claim',
          supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
      ),
    })
    expect(projected.fields.find((field) => field.path === 'reasoning.effort')).toMatchObject({
      state: 'supported', defaultValue: 'low', domain: { kind: 'enum', values: ['high', 'low'] },
    })
    expect(projected.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({
      state: 'supported', domain: { kind: 'range', min: 0, max: 1.25 },
    })
  })

  it('keeps same-value multi-source provenance compatible with the runtime field effect', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts(
        resolvedField('reasoning.effort.nativeValues', {
          kind: 'native_string_set', values: ['low', 'high'], completeness: 'complete',
        }, { supporting: [provenance('provider_native', 'provider-effort'), provenance('models_dev', 'models-effort')] }),
        resolvedField('generation.effort.nativeValues', {
          kind: 'native_string_set', values: ['low', 'high'], completeness: 'complete',
        }, { supporting: [provenance('capability_rule', 'rule-effort')] }),
      ),
    })
    const field = projected.fields.find((candidate) => candidate.path === 'reasoning.effort')!
    const evidence = new Map(projected.evidence.map((item) => [item.evidenceId, item]))
    expect(field.state).toBe('supported')
    expect(field.evidenceIds.every((id) => evidence.get(id)?.effect === 'supports')).toBe(true)
    expect(field.evidenceIds).toHaveLength(3)
  })

  it('keeps lower-priority opposing and overridden provenance out of supported field evidence', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts(resolvedField('reasoning.effort.nativeValues', {
        kind: 'native_string_set', values: ['low'], completeness: 'complete',
      }, {
        supporting: [provenance('provider_native', 'winner')],
        opposing: [provenance('models_dev', 'opposed')],
        overridden: [provenance('capability_rule', 'overridden')],
      })),
    })
    const field = projected.fields.find((candidate) => candidate.path === 'reasoning.effort')!
    const evidence = new Map(projected.evidence.map((item) => [item.evidenceId, item]))
    expect(field.state).toBe('supported')
    expect(field.evidenceIds.every((id) => evidence.get(id)?.effect === 'supports')).toBe(true)
    expect(projected.evidence.some((item) => item.effect === 'rejects')).toBe(true)
    expect(projected.evidence.some((item) => item.effect === 'unknown')).toBe(true)
  })

  it('lets an explicit unsupported support fact gate sibling metadata', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts(
        resolvedField('sampling.temperature.support', { kind: 'support', value: 'unsupported' }, {
          supporting: [provenance('provider_native', 'temperature-unsupported')],
        }),
        resolvedField('sampling.temperature.modelMaximum', { kind: 'decimal', value: 1.25 }, {
          supporting: [provenance('models_dev', 'temperature-maximum')],
        }),
      ),
    })
    const field = projected.fields.find((candidate) => candidate.path === 'generation.temperature')!
    const evidence = new Map(projected.evidence.map((item) => [item.evidenceId, item]))
    expect(field).toMatchObject({ state: 'unsupported' })
    expect(field.domain).toBeUndefined()
    expect(field.evidenceIds.every((id) => evidence.get(id)?.effect === 'rejects')).toBe(true)
  })

  it('preserves equal-priority conflict semantics in field evidence', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts(resolvedField('reasoning.support', undefined, {
        state: 'conflict',
        opposing: [provenance('provider_native', 'conflict-left'), provenance('models_dev', 'conflict-right')],
      })),
    })
    const field = projected.fields.find((candidate) => candidate.path === 'reasoning.mode')!
    const evidence = new Map(projected.evidence.map((item) => [item.evidenceId, item]))
    expect(field).toMatchObject({ state: 'conflict' })
    expect(field.domain).toBeUndefined()
    expect(field.evidenceIds.every((id) => evidence.get(id)?.effect === 'conflict')).toBe(true)
    expect(field.evidenceIds.some((id) => evidence.get(id)?.effect !== 'conflict')).toBe(false)
  })

  it('keeps unsupported ahead of an unrelated sibling conflict', () => {
    const projected = projectResolvedModelFactsToRuntimeV2({
      binding,
      resolvedFacts: facts(
        resolvedField('sampling.temperature.support', { kind: 'support', value: 'unsupported' }, {
          supporting: [provenance('provider_native', 'temperature-unsupported')],
        }),
        resolvedField('sampling.temperature.modelMaximum', undefined, {
          state: 'conflict',
          opposing: [provenance('models_dev', 'temperature-conflict-left'), provenance('capability_rule', 'temperature-conflict-right')],
        }),
      ),
    })
    expect(projected.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({ state: 'unsupported' })
  })

  it('projects provenance produced by the real resolver without changing source semantics', () => {
    const sameValue = projectResolvedModelFactsToRuntimeV2({ binding, resolvedFacts: resolvedFromSources({
      providerNative: { path: 'reasoning.effort.nativeValues', value: {
        kind: 'native_string_set', values: ['low'], completeness: 'complete',
      } },
      modelsDev: { path: 'reasoning.effort.nativeValues', value: {
        kind: 'native_string_set', values: ['low'], completeness: 'complete',
      } },
    }) })
    const sameValueField = sameValue.fields.find((field) => field.path === 'reasoning.effort')!
    const sameValueEvidence = new Map(sameValue.evidence.map((item) => [item.evidenceId, item]))
    expect(sameValueField.evidenceIds).toHaveLength(1)
    expect(sameValueField.evidenceIds.every((id) => sameValueEvidence.get(id)?.effect === 'supports')).toBe(true)
    expect(sameValue.evidence.some((item) => item.effect === 'unknown' && item.sourceRef.endsWith(':overridden'))).toBe(true)

    const overridden = projectResolvedModelFactsToRuntimeV2({ binding, resolvedFacts: resolvedFromSources({
      providerNative: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      modelsDev: { path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' } },
    }) })
    const overriddenField = overridden.fields.find((field) => field.path === 'reasoning.mode')!
    const overriddenEvidence = new Map(overridden.evidence.map((item) => [item.evidenceId, item]))
    expect(overriddenField.state).toBe('supported')
    expect(overriddenField.evidenceIds.every((id) => overriddenEvidence.get(id)?.effect === 'supports')).toBe(true)
    expect(overridden.evidence.some((item) => item.effect === 'unknown' && item.sourceRef.endsWith(':overridden'))).toBe(true)

    const unsupported = projectResolvedModelFactsToRuntimeV2({ binding, resolvedFacts: resolvedFromSources({
      providerNative: { path: 'sampling.temperature.support', value: { kind: 'support', value: 'unsupported' } },
      modelsDev: { path: 'sampling.temperature.modelMaximum', value: { kind: 'decimal', value: 1.25 } },
    }) })
    const unsupportedField = unsupported.fields.find((field) => field.path === 'generation.temperature')!
    const unsupportedEvidence = new Map(unsupported.evidence.map((item) => [item.evidenceId, item]))
    expect(unsupportedField.state).toBe('unsupported')
    expect(unsupportedField.evidenceIds).toHaveLength(1)
    expect(unsupportedEvidence.get(unsupportedField.evidenceIds[0])?.effect).toBe('rejects')

    const conflict = projectResolvedModelFactsToRuntimeV2({ binding, resolvedFacts: resolvedFromSources({
      equalPriority: true,
      providerNative: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      modelsDev: { path: 'reasoning.support', value: { kind: 'support', value: 'unsupported' } },
      capabilityRules: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
    }) })
    const conflictField = conflict.fields.find((field) => field.path === 'reasoning.mode')!
    const conflictEvidence = new Map(conflict.evidence.map((item) => [item.evidenceId, item]))
    expect(conflictField.state).toBe('conflict')
    expect(conflictField.evidenceIds).toHaveLength(2)
    expect(conflictField.evidenceIds.every((id) => conflictEvidence.get(id)?.effect === 'conflict')).toBe(true)
    expect(conflict.evidence.some((item) => item.effect === 'unknown' && item.sourceRef.endsWith(':overridden'))).toBe(true)
  })
})
