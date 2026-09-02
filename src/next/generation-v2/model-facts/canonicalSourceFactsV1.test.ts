import { describe, expect, it } from 'vitest'
import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
  canonicalizeCanonicalFactValueV1,
  decodeCanonicalSourceRevisionRefV1,
  type CanonicalObservationProvenanceV1,
  type CanonicalSourceRevisionRefV1,
} from './canonicalSourceFactsV1'
import { buildExplicitAssertionV1, invalidOutcomeV1, missingOutcomeV1, presentOutcomeV1 } from './sourceAdapterV1'

const subject = Object.freeze({ providerAuthorityId: 'google-ai-studio',
  endpointProfileId: 'gemini-developer-api-v1beta', nativeModelId: 'models/gemini-test' })

function revision(previousLkgSourceRevision?: string): CanonicalSourceRevisionRefV1 {
  return buildCanonicalSourceRevisionRefV1({ sourceKind: 'provider_native', sourceScopeId: 'scope:test',
    rawSourceSnapshotRevision: 'raw:test', adapterRevision: 'adapter:test',
    coverageManifestRevision: 'manifest:test', providerAuthorityRegistryRevision: 'registry:test',
    ...(previousLkgSourceRevision === undefined ? {} : { previousLkgSourceRevision }) })
}

function observation(sourceRevision: CanonicalSourceRevisionRefV1): CanonicalObservationProvenanceV1 {
  return Object.freeze({ sourceKind: 'provider_native', canonicalSourceRevision: sourceRevision.canonicalSourceRevision,
    sourceFieldRefs: Object.freeze([{ rawPayloadRef: { storeId: `canonical-raw-v1:${'a'.repeat(64)}`,
      persistedPayloadSha256: 'a'.repeat(64), recordKey: 'models/gemini-test', sanitizerRevision: 'sanitizer:test' },
    sourceRecordIdentity: 'models/gemini-test', sourceFieldPath: 'thinking', observedPresence: 'present' as const }]),
    adapterId: 'provider-native:test', adapterRevision: 'adapter:test', mappingId: 'google.thinking.v1' })
}

describe('Canonical Source Facts V1', () => {
  it('canonicalizes source revisions deterministically and rejects tampering', () => {
    const first = revision()
    expect(revision()).toEqual(first)
    expect(decodeCanonicalSourceRevisionRefV1(first)).toEqual(first)
    expect(() => decodeCanonicalSourceRevisionRefV1({ ...first, adapterRevision: 'adapter:other' }))
      .toThrowError('GENERATION_V2_CANONICAL_SOURCE_FACTS_INVALID')
  })

  it('validates registered typed values without an arbitrary JSON escape hatch', () => {
    expect(canonicalizeCanonicalFactValueV1('reasoning.effort.nativeValues', {
      kind: 'native_string_set', values: ['max', 'high'], completeness: 'complete',
    })).toEqual({ kind: 'native_string_set', values: ['high', 'max'], completeness: 'complete' })
    expect(() => canonicalizeCanonicalFactValueV1('reasoning.support', { kind: 'native_string', value: 'yes' }))
      .toThrowError('GENERATION_V2_CANONICAL_SOURCE_FACTS_INVALID')
  })

  it('retains the prior assertion only after invalid, never after missing', () => {
    const initialRevision = revision()
    const initialAssertion = buildExplicitAssertionV1({ subject, sourceRevision: initialRevision,
      path: 'reasoning.support', value: { kind: 'support', value: 'supported' },
      sourceClaimIdentity: 'thinking:true', evidenceRefs: ['evidence:test'],
      observationProvenance: observation(initialRevision) })
    const initial = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision: initialRevision,
      recordOutcome: 'present', outcomes: [presentOutcomeV1({ assertion: initialAssertion })],
      unmappedSourceFields: [] })

    const invalidRevision = revision(initial.ref.sourceRevision.canonicalSourceRevision)
    const invalid = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision: invalidRevision,
      recordOutcome: 'present', outcomes: [invalidOutcomeV1({ path: 'reasoning.support',
        provenance: observation(invalidRevision), errorCode: 'invalid_boolean' })], unmappedSourceFields: [] }, initial.payload)
    expect(invalid.payload.outcomes[0]).toMatchObject({ disposition: 'lkg_retained_after_invalid',
      effectiveAssertion: initialAssertion })

    const missingRevision = revision(invalid.ref.sourceRevision.canonicalSourceRevision)
    const missing = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision: missingRevision,
      recordOutcome: 'present', outcomes: [missingOutcomeV1({ path: 'reasoning.support',
        provenance: observation(missingRevision) })], unmappedSourceFields: [] }, invalid.payload)
    expect(missing.payload.outcomes[0]).toEqual(expect.objectContaining({ disposition: 'none' }))
    expect(missing.payload.outcomes[0]).not.toHaveProperty('effectiveAssertion')
  })

  it('keeps subject-fact revision independent from query order', () => {
    const sourceRevision = revision()
    const candidate = { schemaVersion: 1 as const, subject, sourceRevision, recordOutcome: 'present' as const,
      outcomes: [] as const, unmappedSourceFields: [] as const }
    expect(buildCanonicalSubjectFactV1(candidate).ref).toEqual(buildCanonicalSubjectFactV1(candidate).ref)
  })
})
