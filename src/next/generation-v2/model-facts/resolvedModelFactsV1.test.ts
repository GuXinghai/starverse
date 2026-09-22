import { describe, expect, it } from 'vitest'
import {
  buildResolvedModelFactsV1,
  decodeResolvedModelFactsV1,
  RESOLVED_MODEL_FACTS_ONTOLOGY_SCHEMA_DIGEST_V1,
  type ModelFactsResolutionInputV1,
  type ResolvedModelFactFieldV1,
} from './resolvedModelFactsV1'
import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
  type CanonicalObservationProvenanceV1,
  type CanonicalSourceKindV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
} from './canonicalSourceFactsV1'
import { buildExplicitAssertionV1, presentOutcomeV1 } from './sourceAdapterV1'

const subject = Object.freeze({
  providerAuthorityId: 'google-ai-studio',
  endpointProfileId: 'gemini-developer-api-v1beta',
  nativeModelId: 'models/gemini-test',
})

function sourceRevision(sourceKind: CanonicalSourceKindV1): CanonicalSourceRevisionRefV1 {
  return buildCanonicalSourceRevisionRefV1({
    sourceKind,
    sourceScopeId: `scope:${sourceKind}`,
    rawSourceSnapshotRevision: `raw:${sourceKind}`,
    adapterRevision: `adapter:${sourceKind}`,
    coverageManifestRevision: `manifest:${sourceKind}`,
    providerAuthorityRegistryRevision: 'registry:test',
  })
}

function observation(revision: CanonicalSourceRevisionRefV1): CanonicalObservationProvenanceV1 {
  return Object.freeze({
    sourceKind: revision.sourceKind,
    canonicalSourceRevision: revision.canonicalSourceRevision,
    sourceFieldRefs: Object.freeze([{
      rawPayloadRef: {
        storeId: `canonical-raw-v1:${'a'.repeat(64)}`,
        persistedPayloadSha256: 'a'.repeat(64),
        recordKey: 'models/gemini-test',
        sanitizerRevision: 'sanitizer:test',
      },
      sourceRecordIdentity: 'models/gemini-test',
      sourceFieldPath: 'thinking',
      observedPresence: 'present' as const,
    }]),
    adapterId: `adapter:${revision.sourceKind}`,
    adapterRevision: revision.adapterRevision,
    mappingId: `mapping:${revision.sourceKind}`,
  })
}

function sourceFact(sourceKind: CanonicalSourceKindV1): {
  payload: CanonicalSubjectFactPayloadV1
  ref: CanonicalSubjectFactRefV1
  assertion: NonNullable<CanonicalSubjectFactPayloadV1['outcomes'][number]['effectiveAssertion']>
} {
  const revision = sourceRevision(sourceKind)
  const assertion = buildExplicitAssertionV1({
    subject,
    sourceRevision: revision,
    path: 'reasoning.support',
    value: { kind: 'support', value: 'supported' },
    sourceClaimIdentity: `${sourceKind}:reasoning`,
    evidenceRefs: [`evidence:${sourceKind}`],
    observationProvenance: observation(revision),
  })
  const built = buildCanonicalSubjectFactV1({
    schemaVersion: 1,
    subject,
    sourceRevision: revision,
    recordOutcome: 'present',
    outcomes: [presentOutcomeV1({ assertion })],
    unmappedSourceFields: [],
  })
  return { ...built, assertion }
}

function input(overrides: Partial<ModelFactsResolutionInputV1> = {}): ModelFactsResolutionInputV1 {
  const providerNative = sourceFact('provider_native')
  return {
    schemaVersion: 1,
    subject,
    sources: {
      providerNative: { kind: 'present', ref: providerNative.ref, payload: providerNative.payload },
      modelsDev: { kind: 'absent', reason: 'no_exact_subject' },
      capabilityRules: { kind: 'absent', reason: 'not_available' },
    },
    sourcePriorityConfigRevision: 'priority-config-v1:test',
    resolverRevision: 'resolver-v1:test',
    ontologyRevision: 'ontology-v1:test',
    ...overrides,
  }
}

function provenance(sourceKind: CanonicalSourceKindV1, sourcePriority: number) {
  const source = sourceFact(sourceKind)
  return {
    sourceKind,
    sourceFactRef: source.ref,
    sourceAssertion: source.assertion,
    sourcePriority,
  }
}

function resolvedField(extra: Partial<ResolvedModelFactFieldV1> = {}): ResolvedModelFactFieldV1 {
  return {
    path: 'reasoning.support',
    state: 'resolved',
    selectedValue: { kind: 'support', value: 'supported' },
    completenessDisposition: 'not_applicable',
    selectionReason: 'single_claim',
    supportingProvenance: [provenance('provider_native', 3)],
    opposingProvenance: [],
    overriddenProvenance: [],
    diagnostics: [],
    ...extra,
  }
}

describe('Resolved Model Facts V1', () => {
  it('preserves resolved, unknown, and conflict without collapsing source diagnostics', () => {
    const unknown = {
      path: 'reasoning.effort.nativeValues' as const,
      state: 'unknown' as const,
      completenessDisposition: 'unknown' as const,
      selectionReason: 'no_effective_claim' as const,
      supportingProvenance: [],
      opposingProvenance: [],
      overriddenProvenance: [],
      diagnostics: [],
    }
    const conflict = {
      path: 'reasoning.support' as const,
      state: 'conflict' as const,
      completenessDisposition: 'not_applicable' as const,
      selectionReason: 'equal_priority_conflict' as const,
      supportingProvenance: [],
      opposingProvenance: [],
      overriddenProvenance: [],
      diagnostics: [],
      candidates: [
        { value: { kind: 'support' as const, value: 'supported' as const }, completenessDisposition: 'not_applicable' as const,
          provenance: [provenance('provider_native', 3)] },
        { value: { kind: 'support' as const, value: 'unsupported' as const }, completenessDisposition: 'not_applicable' as const,
          provenance: [provenance('models_dev', 3)] },
      ],
    }
    const result = buildResolvedModelFactsV1({
      resolutionInput: input(),
      fields: [unknown, conflict],
    })
    expect(result.fields.map((field) => field.state)).toEqual(['unknown', 'conflict'])
    expect(result.fields[1]).toHaveProperty('candidates')
    expect(result.fields[0]).not.toHaveProperty('selectedValue')
  })

  it('canonicalizes field and provenance order independently of insertion order', () => {
    const first = buildResolvedModelFactsV1({
      resolutionInput: input(),
      fields: [resolvedField({ supportingProvenance: [provenance('provider_native', 3), provenance('models_dev', 2)] })],
    })
    const second = buildResolvedModelFactsV1({
      resolutionInput: input(),
      fields: [resolvedField({ supportingProvenance: [provenance('models_dev', 2), provenance('provider_native', 3)] })],
    })
    expect(second).toEqual(first)
    expect(RESOLVED_MODEL_FACTS_ONTOLOGY_SCHEMA_DIGEST_V1).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('binds all three sources and changes revision for semantic source/config changes', () => {
    const base = buildResolvedModelFactsV1({ resolutionInput: input(), fields: [resolvedField()] })
    const priorityChanged = buildResolvedModelFactsV1({
      resolutionInput: input({ sourcePriorityConfigRevision: 'priority-config-v1:changed' }),
      fields: [resolvedField()],
    })
    const sourceChanged = buildResolvedModelFactsV1({
      resolutionInput: input({ sources: {
        providerNative: { kind: 'absent', reason: 'not_available' },
        modelsDev: { kind: 'absent', reason: 'no_exact_subject' },
        capabilityRules: { kind: 'absent', reason: 'not_available' },
      } }),
      fields: [{
        path: 'reasoning.support',
        state: 'unknown',
        completenessDisposition: 'unknown',
        selectionReason: 'no_effective_claim',
        supportingProvenance: [],
        opposingProvenance: [],
        overriddenProvenance: [],
        diagnostics: [],
      }],
    })
    expect(base.input.sources.modelsDev).toEqual({ kind: 'absent', reason: 'no_exact_subject' })
    expect(base.input.sources.capabilityRules).toEqual({ kind: 'absent', reason: 'not_available' })
    expect(priorityChanged.capabilityRevision).not.toBe(base.capabilityRevision)
    expect(sourceChanged.capabilityRevision).not.toBe(base.capabilityRevision)
  })

  it('round-trips and rejects tampering or execution-layer fields', () => {
    const built = buildResolvedModelFactsV1({ resolutionInput: input(), fields: [resolvedField()] })
    expect(decodeResolvedModelFactsV1(built)).toEqual(built)
    expect(() => decodeResolvedModelFactsV1({ ...built, capabilityRevision: `${built.capabilityRevision}x` }))
      .toThrowError('GENERATION_V2_RESOLVED_MODEL_FACTS_INVALID')
    expect(() => decodeResolvedModelFactsV1({ ...built, operation: 'initial' }))
      .toThrowError('GENERATION_V2_RESOLVED_MODEL_FACTS_INVALID')
  })
})
