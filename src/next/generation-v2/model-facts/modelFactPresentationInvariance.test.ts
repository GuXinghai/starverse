import { describe, expect, it } from 'vitest'
import {
  buildCanonicalSourceRevisionRefV1, buildCanonicalSubjectFactV1,
  type CanonicalModelSubjectV1, type CanonicalSourceKindV1,
} from './canonicalSourceFactsV1'
import { buildExplicitAssertionV1, invalidOutcomeV1, presentOutcomeV1 } from './sourceAdapterV1'
import { buildSourcePriorityConfigV1 } from './sourcePriorityConfigV1'
import { resolveModelFactsV1 } from './resolveModelFactsV1'
import { modelFactMatchesFilter, modelFactPresentationState } from '@/shared/model-facts/modelFactPresentation'

const subject: CanonicalModelSubjectV1 = { providerAuthorityId: 'provider:test', endpointProfileId: 'endpoint:test', nativeModelId: 'model:test' }

function present(kind: CanonicalSourceKindV1, value: 'supported' | 'unsupported' | null) {
  const revision = buildCanonicalSourceRevisionRefV1({ sourceKind: kind, sourceScopeId: `scope:${kind}`,
    rawSourceSnapshotRevision: `raw:${kind}`, adapterRevision: `adapter:${kind}`, coverageManifestRevision: `manifest:${kind}`,
    providerAuthorityRegistryRevision: 'registry:test' })
  const provenance = { sourceKind: kind, canonicalSourceRevision: revision.canonicalSourceRevision,
    sourceFieldRefs: [{ rawPayloadRef: { storeId: `canonical-raw-v1:${'a'.repeat(64)}`, persistedPayloadSha256: 'a'.repeat(64),
      recordKey: kind, sanitizerRevision: 'sanitizer:test' }, sourceRecordIdentity: kind, sourceFieldPath: 'f', observedPresence: 'present' as const }],
    adapterId: `adapter:${kind}`, adapterRevision: revision.adapterRevision, mappingId: `mapping:${kind}` }
  const outcomes = value === null
    ? [invalidOutcomeV1({ path: 'reasoning.support', provenance, errorCode: 'TEST_INVALID' })]
    : [presentOutcomeV1({ assertion: buildExplicitAssertionV1({ subject, sourceRevision: revision, path: 'reasoning.support',
        value: { kind: 'support', value }, sourceClaimIdentity: `${kind}:1`, evidenceRefs: [`evidence:${kind}`], observationProvenance: provenance }) })]
  const fact = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision: revision, recordOutcome: 'present',
    outcomes, unmappedSourceFields: [] })
  return { kind: 'present' as const, ref: fact.ref, payload: fact.payload }
}

function resolveFixture() {
  const sourcePriorityConfig = buildSourcePriorityConfigV1({ provider_native: 3, models_dev: 3, capability_rule: 1 })
  return resolveModelFactsV1({ sourcePriorityConfig, resolutionInput: { schemaVersion: 1, subject,
    sources: { providerNative: present('provider_native', 'supported'), modelsDev: present('models_dev', 'unsupported'),
      capabilityRules: present('capability_rule', null) },
    sourcePriorityConfigRevision: sourcePriorityConfig.sourcePriorityConfigRevision,
    resolverRevision: 'model-facts-resolver-v1:test', ontologyRevision: 'model-facts-ontology-v1:test' } })
}

describe('Goal 4 presentation does not alter semantic Model Facts', () => {
  it('leaves resolved payload, capabilityRevision and sourcePriorityConfigRevision identical', () => {
    const before = resolveFixture()
    const snapshotBefore = JSON.stringify(before)
    const frozen = structuredClone(before)
    for (const field of frozen.fields) {
      modelFactPresentationState(field, { coveredBySource: true })
      modelFactPresentationState(field, { coveredBySource: false })
      for (const filter of ['all', 'conflict', 'unknown', 'diagnostics'] as const) modelFactMatchesFilter(filter, field)
    }
    const after = resolveFixture()
    expect(JSON.stringify(frozen)).toBe(snapshotBefore)
    expect(JSON.stringify(after)).toBe(snapshotBefore)
    expect(after.capabilityRevision).toBe(before.capabilityRevision)
    expect(after.input.sourcePriorityConfigRevision).toBe(before.input.sourcePriorityConfigRevision)
    const support = before.fields.find((entry) => entry.path === 'reasoning.support')!
    expect(support.state).toBe('conflict')
    expect(modelFactPresentationState(support)).toBe('conflict')
  })
})
